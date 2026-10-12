// Fixture-only Node-API bridge. No production key/authority or TLS listener.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <bcrypt.h>
#include <node_api.h>
#include <atomic>
#include <array>
#include <string>
#include <vector>
#include <thread>
#include <algorithm>
#include <memory>
#include <cmath>
#include "owner_measurements.h"

struct Denied { const char* code; };
static void Need(bool ok, const char* code) { if (!ok) throw Denied{code}; }
static void N(napi_status status) { Need(status == napi_ok, "napi"); }
struct Handle {
  HANDLE value = INVALID_HANDLE_VALUE;
  Handle() = default; explicit Handle(HANDLE h) : value(h) {}
  Handle(const Handle&) = delete; Handle& operator=(const Handle&) = delete;
  ~Handle() { close(); }
  void close() { if (value != INVALID_HANDLE_VALUE && value != nullptr) CloseHandle(value); value = INVALID_HANDLE_VALUE; }
};
struct State {
  napi_env env{}; Handle owner, pipe, workDone{CreateEventW(nullptr, TRUE, TRUE, nullptr)};
  std::vector<HANDLE> images;
  std::atomic<bool> ended{false}, active{false}, released{false};
  bool authenticated = false, consumed = false, queueFailureForTest = false;
  std::atomic<bool> bound{false};
  DWORD ownerPid{}; ULONGLONG started = GetTickCount64(), until = 0; int64_t expires = 0;
  std::array<unsigned char,16> session{};
  napi_ref objects[3]{}; napi_threadsafe_function terminal{};
  std::thread observer;
  std::atomic<uint32_t> maxFrameBytes{0};
  uint32_t connectionAttempts=0, queuedWork=0, peakReferences=0, observerThreads=0;
  const char* failure = "terminal";
  void live() {
    FILETIME now; GetSystemTimeAsFileTime(&now); ULARGE_INTEGER time; time.LowPart=now.dwLowDateTime; time.HighPart=now.dwHighDateTime;
    const int64_t wall = static_cast<int64_t>(time.QuadPart / 10000ULL - 11644473600000ULL);
    Need(!ended && WaitForSingleObject(owner.value, 0) == WAIT_TIMEOUT, "owner-ended");
    Need(GetTickCount64() < until && wall < expires, "expiry");
  }
  void requestEnd(const char* reason) {
    if (!ended.exchange(true)) { failure = reason; if (pipe.value != INVALID_HANDLE_VALUE) CancelIoEx(pipe.value, nullptr); }
  }
  void notify() {
    if (terminal) { napi_call_threadsafe_function(terminal, nullptr, napi_tsfn_nonblocking);
      if (!released.exchange(true)) napi_release_threadsafe_function(terminal, napi_tsfn_release); }
  }
  void stop() {
    requestEnd("revoked");
    if (active) {
      const ULONGLONG stopUntil=GetTickCount64()+3500;
      WaitForSingleObject(workDone.value,3500);
      while(active && GetTickCount64()<stopUntil) Sleep(1);
      if(active) TerminateProcess(GetCurrentProcess(),91); // Fixture failure, never a successful cleanup result.
    }
    if (observer.joinable()) observer.join();
    pipe.close(); owner.close();
    workDone.close();
    for (HANDLE h : images) CloseHandle(h); images.clear();
    SecureZeroMemory(session.data(), session.size());
    if (terminal && !released.exchange(true)) napi_release_threadsafe_function(terminal, napi_tsfn_release);
  }
  void releaseObjects() { for (auto& ref : objects) if (ref) { napi_delete_reference(env, ref); ref=nullptr; } }
  ~State() { stop(); }
};
static std::string String(napi_env env, napi_value value) {
  size_t size; N(napi_get_value_string_utf8(env, value, nullptr, 0, &size)); Need(size <= 1024, "argument");
  std::vector<char> bytes(size+1); N(napi_get_value_string_utf8(env,value,bytes.data(),bytes.size(),&size)); return std::string(bytes.data(),size);
}
static napi_value Text(napi_env env, const std::string& value) { napi_value result; N(napi_create_string_utf8(env,value.data(),value.size(),&result)); return result; }
static napi_value Boolean(napi_env env, bool value) { napi_value result; N(napi_get_boolean(env,value,&result)); return result; }
static void Error(napi_env env, const char* code) { napi_throw_error(env,code,"Native fixture bridge unavailable."); }
static State* Get(napi_env env) { State* state; N(napi_get_instance_data(env,reinterpret_cast<void**>(&state))); return state; }
static void IO(State* s, bool write, unsigned char* bytes, DWORD length) {
  while (length) {
    s->live(); Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr)); Need(event.value != nullptr,"event");
    OVERLAPPED ov{}; ov.hEvent=event.value; DWORD count=0;
    BOOL ok=write ? WriteFile(s->pipe.value,bytes,length,&count,&ov) : ReadFile(s->pipe.value,bytes,length,&count,&ov);
    if (!ok) {
      Need(GetLastError()==ERROR_IO_PENDING,"channel");
      try { while (WaitForSingleObject(event.value,20)==WAIT_TIMEOUT) s->live(); }
      catch (...) { CancelIoEx(s->pipe.value,&ov); GetOverlappedResult(s->pipe.value,&ov,&count,TRUE); throw; }
      Need(GetOverlappedResult(s->pipe.value,&ov,&count,FALSE)!=0,"channel");
    }
    Need(count>0 && count<=length,"channel"); bytes+=count; length-=count;
  }
}
static std::vector<unsigned char> Read(State* s, unsigned char type) {
  uint32_t length=0; IO(s,false,reinterpret_cast<unsigned char*>(&length),4); Need(length>=1 && length<=16384,"frame");
  s->maxFrameBytes.store(std::max(s->maxFrameBytes.load(),length));
  std::vector<unsigned char> bytes(length); IO(s,false,bytes.data(),length); Need(bytes[0]==type,"protocol");
  bytes.erase(bytes.begin()); return bytes;
}
static void Send(State* s, unsigned char type, const unsigned char* bytes, size_t length) {
  Need(length<16384,"frame"); uint32_t size=static_cast<uint32_t>(length+1);
  IO(s,true,reinterpret_cast<unsigned char*>(&size),4); IO(s,true,&type,1);
  if (length) IO(s,true,const_cast<unsigned char*>(bytes),static_cast<DWORD>(length));
}
static bool Same(const unsigned char* a,const unsigned char* b,size_t size) { unsigned char diff=0; for(size_t i=0;i<size;i++)diff|=a[i]^b[i]; return diff==0; }
static std::string Hash(HANDLE file) {
  BCRYPT_ALG_HANDLE algorithm{}; BCRYPT_HASH_HANDLE hash{};
  Need(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0,"measurement");
  std::array<unsigned char,32> digest{};
  try {
    Need(BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0)>=0,"measurement");
    std::array<unsigned char,65536> bytes{}; DWORD count;
    while (true) { Need(ReadFile(file,bytes.data(),static_cast<DWORD>(bytes.size()),&count,nullptr)!=0,"measurement"); if (!count) break;
      Need(BCryptHashData(hash,bytes.data(),count,0)>=0,"measurement"); }
    Need(BCryptFinishHash(hash,digest.data(),static_cast<ULONG>(digest.size()),0)>=0,"measurement");
  } catch (...) { if(hash)BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(algorithm,0); throw; }
  BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(algorithm,0);
  static const char hex[]="0123456789abcdef"; std::string result; for(auto byte:digest){result+=hex[byte>>4];result+=hex[byte&15];} return result;
}
static std::vector<unsigned char> TokenInfo(HANDLE token,TOKEN_INFORMATION_CLASS kind) {
  DWORD size=0; GetTokenInformation(token,kind,nullptr,0,&size); Need(size>0&&size<=65536,"owner-token");
  std::vector<unsigned char> bytes(size); Need(GetTokenInformation(token,kind,bytes.data(),size,&size)!=0,"owner-token"); return bytes;
}
static void Owner(State* s) {
  DWORD server=0; Need(GetNamedPipeServerProcessId(s->pipe.value,&server)!=0 && server==s->ownerPid,"owner-peer");
  s->live();
  std::array<wchar_t,32768> image{}; DWORD length=static_cast<DWORD>(image.size());
  Need(QueryFullProcessImageNameW(s->owner.value,0,image.data(),&length)!=0 && _wcsicmp(image.data(),ownerMeasurements[0].path)==0,"owner-image");
  Handle token, current;
  Need(OpenProcessToken(s->owner.value,TOKEN_QUERY,&token.value)!=0 && OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&current.value)!=0,"owner-token");
  auto a=TokenInfo(token.value,TokenLogonSid), b=TokenInfo(current.value,TokenLogonSid);
  auto ga=reinterpret_cast<TOKEN_GROUPS*>(a.data()), gb=reinterpret_cast<TOKEN_GROUPS*>(b.data());
  Need(ga->GroupCount==1&&gb->GroupCount==1&&EqualSid(ga->Groups[0].Sid,gb->Groups[0].Sid),"owner-logon");
  auto sa=TokenInfo(token.value,TokenSessionId), sb=TokenInfo(current.value,TokenSessionId);
  Need(*reinterpret_cast<DWORD*>(sa.data())==*reinterpret_cast<DWORD*>(sb.data()),"owner-session");
  auto elevation=TokenInfo(token.value,TokenElevation); Need(!reinterpret_cast<TOKEN_ELEVATION*>(elevation.data())->TokenIsElevated,"owner-elevation");
  // The inherited capability must not permit reading arbitrary owner memory.
  unsigned char value{}; SIZE_T got{}; SetLastError(0);
  Need(!ReadProcessMemory(s->owner.value,nullptr,&value,1,&got) && GetLastError()==ERROR_ACCESS_DENIED,"owner-access");
  s->live();
}
static void OnTerminal(napi_env env,napi_value callback,void*,void*) {
  if (!env) return; napi_value global,result; napi_get_undefined(env,&global); napi_call_function(env,global,callback,0,nullptr,&result);
}
static napi_value Authenticate(napi_env env,napi_callback_info info) {
  State* s=Get(env);
  try {
    size_t count=4; napi_value args[4]; N(napi_get_cb_info(env,info,&count,args,nullptr,nullptr)); Need(count==4&&!s->authenticated&&!s->ended,"replay");
    uint64_t raw; bool lossless; N(napi_get_value_bigint_uint64(env,args[0],&raw,&lossless)); Need(lossless&&raw,"owner-handle");
    s->owner.value=reinterpret_cast<HANDLE>(static_cast<uintptr_t>(raw));
    s->ownerPid=GetProcessId(s->owner.value); Need(s->ownerPid!=0,"owner-handle");
    Need(SetHandleInformation(s->owner.value,HANDLE_FLAG_INHERIT,0)!=0,"owner-handle");
    auto pipe=String(env,args[1]), fault=String(env,args[3]);
    Need(s->workDone.value != nullptr,"event");
    s->queueFailureForTest = fault=="bind-queue-failure";
    Need(pipe.size()==65 && pipe.rfind("cctv-application-",0)==0 && std::all_of(pipe.begin()+17,pipe.end(),[](char c){return(c>='0'&&c<='9')||(c>='a'&&c<='f');}),"pipe-name");
    napi_valuetype callbackType; N(napi_typeof(env,args[2],&callbackType)); Need(callbackType==napi_function,"callback");
    N(napi_create_threadsafe_function(env,args[2],nullptr,Text(env,"fixture-terminal"),1,1,nullptr,nullptr,nullptr,OnTerminal,&s->terminal));
    N(napi_unref_threadsafe_function(env,s->terminal));
    s->until=GetTickCount64()+3000; s->expires=INT64_MAX;
    for (const auto& measurement: ownerMeasurements) {
      HANDLE file=CreateFileW(measurement.path,GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
      Need(file!=INVALID_HANDLE_VALUE,"owner-image"); s->images.push_back(file); Need(Hash(file)==measurement.sha256,"owner-image");
    }
    const std::wstring name=L"\\\\.\\pipe\\"+std::wstring(pipe.begin(),pipe.end());
    while (true) {
      s->live(); ++s->connectionAttempts; s->pipe.value=CreateFileW(name.c_str(),GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,FILE_FLAG_OVERLAPPED|SECURITY_SQOS_PRESENT|SECURITY_IDENTIFICATION,nullptr);
      if(s->pipe.value!=INVALID_HANDLE_VALUE)break; Need(GetLastError()==ERROR_PIPE_BUSY||GetLastError()==ERROR_FILE_NOT_FOUND,"channel"); Sleep(10);
    }
    Owner(s);
    std::array<unsigned char,32> nonce{}; Need(BCryptGenRandom(nullptr,nonce.data(),32,BCRYPT_USE_SYSTEM_PREFERRED_RNG)>=0,"random");
    std::vector<unsigned char> offer, ack, material;
    try {
      if(fault=="node-wire-oversized" || fault=="node-wire-zero") {
        uint32_t size=fault=="node-wire-oversized"?UINT32_MAX:0;
        IO(s,true,reinterpret_cast<unsigned char*>(&size),4);
      } else Send(s,1,nonce.data(),nonce.size());
      offer=Read(s,2); Owner(s);
      Need(offer.size()==88&&Same(offer.data(),nonce.data(),32),"challenge");
      memcpy(s->session.data(),offer.data()+64,16); memcpy(&s->expires,offer.data()+80,8);
      FILETIME now;GetSystemTimeAsFileTime(&now);ULARGE_INTEGER wall;wall.LowPart=now.dwLowDateTime;wall.HighPart=now.dwHighDateTime;
      const ULONGLONG received=GetTickCount64();
      int64_t remaining=s->expires-static_cast<int64_t>(wall.QuadPart/10000ULL-11644473600000ULL);
      Need(remaining>0&&remaining<=10000,"expiry");
      ack.assign(offer.begin(),offer.begin()+80); if(fault=="bad-nonce")ack[32]^=1;
      Send(s,3,ack.data(),ack.size()); material=Read(s,4); Owner(s);
      if(fault=="replay") Send(s,3,ack.data(),ack.size());
      s->until=received+static_cast<ULONGLONG>(remaining); s->authenticated=true;
      Need(material.size()>=8,"tls-material"); uint32_t certSize,keySize;memcpy(&certSize,material.data(),4);
      Need(certSize<=8192 && 8ULL+certSize<=material.size(),"tls-material"); memcpy(&keySize,material.data()+4+certSize,4);
      Need(keySize<=8192&&8ULL+certSize+keySize==material.size(),"tls-material");
      napi_value result;N(napi_create_object(env,&result));
      N(napi_set_named_property(env,result,"cert",Text(env,std::string(reinterpret_cast<char*>(material.data()+4),certSize))));
      N(napi_set_named_property(env,result,"key",Text(env,std::string(reinterpret_cast<char*>(material.data()+8+certSize),keySize))));
      SecureZeroMemory(material.data(),material.size()); SecureZeroMemory(nonce.data(),nonce.size()); SecureZeroMemory(offer.data(),offer.size()); SecureZeroMemory(ack.data(),ack.size()); return result;
    } catch (...) { SecureZeroMemory(nonce.data(),nonce.size()); if(!offer.empty())SecureZeroMemory(offer.data(),offer.size()); if(!ack.empty())SecureZeroMemory(ack.data(),ack.size()); if(!material.empty())SecureZeroMemory(material.data(),material.size()); throw; }
  } catch (Denied e) { s->requestEnd(e.code); s->stop(); Error(env,e.code); return nullptr; }
  catch (...) { s->requestEnd("native"); s->stop(); Error(env,"native"); return nullptr; }
}
struct Work { State* state; napi_async_work work{}; napi_deferred result{}; uint16_t port{}; const char* error=nullptr; };
static void Execute(napi_env,void* pointer) {
  auto w=static_cast<Work*>(pointer); auto s=w->state;
  try { Owner(s); unsigned char payload[18];memcpy(payload,s->session.data(),16);memcpy(payload+16,&w->port,2);
    Send(s,5,payload,18); auto ack=Read(s,6); Owner(s); Need(ack.size()==16&&Same(ack.data(),s->session.data(),16),"session"); s->bound=true;
  } catch (Denied e) { w->error=e.code; s->requestEnd(e.code); } catch (...) { w->error="native";s->requestEnd("native"); }
  SetEvent(s->workDone.value); s->active=false;
}
static void Complete(napi_env env,napi_status status,void* pointer) {
  auto w=static_cast<Work*>(pointer);auto s=w->state;
  if(status==napi_ok && !w->error && !s->ended) {
    try { s->observer=std::thread([s]{try { (void)Read(s,255);s->requestEnd("replay"); } catch(Denied e){s->requestEnd(e.code);} catch(...){s->requestEnd("native");}s->notify();}); ++s->observerThreads; }
    catch(...) { w->error="observer";s->requestEnd("observer"); }
  }
  if(status!=napi_ok||w->error||s->ended) {
    s->stop();s->releaseObjects();napi_value error;napi_create_error(env,Text(env,w->error?w->error:"terminal"),Text(env,"Native fixture bridge unavailable."),&error);napi_reject_deferred(env,w->result,error);
  } else {
    napi_resolve_deferred(env,w->result,Boolean(env,true));
  }
  napi_delete_async_work(env,w->work);delete w;
}
static napi_value Bind(napi_env env,napi_callback_info info) {
  State* s=Get(env);
  std::unique_ptr<Work> w;
  auto failed = [&](const char* code) {
    // No worker owns this allocation unless queueing succeeded. In particular,
    // stop must never wait for completion of work that was not queued.
    if(w) { s->active=false; SetEvent(s->workDone.value);
      if(w->work) napi_delete_async_work(env,w->work);
      // N-API releases its deferred allocation only when settled, even though
      // the promise was never returned to JavaScript on this path.
      // It is inaccessible: settle false, then throw the synchronous denial.
      // Rejecting an unreturned promise would create an unhandled rejection.
      if(w->result) { napi_value denied;
        if(napi_get_boolean(env,false,&denied)==napi_ok) napi_resolve_deferred(env,w->result,denied); }
    }
    s->requestEnd(code);s->stop();s->releaseObjects();Error(env,code);
  };
  try {
    Need(!s->consumed,"replay");s->consumed=true; s->live();Need(s->authenticated,"authentication");
    size_t count=4;napi_value args[4];N(napi_get_cb_info(env,info,&count,args,nullptr,nullptr));Need(count==4,"object");
    double port;N(napi_get_value_double(env,args[3],&port));Need(std::isfinite(port)&&port>=1&&port<=65535&&std::floor(port)==port,"endpoint");
    for(int i=0;i<3;i++){napi_valuetype type;N(napi_typeof(env,args[i],&type));Need(type==napi_object,"object");N(napi_create_reference(env,args[i],1,&s->objects[i]));s->peakReferences=static_cast<uint32_t>(i+1);}
    w=std::make_unique<Work>();w->state=s;w->port=static_cast<uint16_t>(port);napi_value promise;N(napi_create_promise(env,&w->result,&promise));
    N(napi_create_async_work(env,nullptr,Text(env,"fixture-binding"),Execute,Complete,w.get(),&w->work));
    s->active=true;ResetEvent(s->workDone.value);
    Need(!s->queueFailureForTest,"queue-failure");
    N(napi_queue_async_work(env,w->work));
    ++s->queuedWork;
    w.release();return promise;
  } catch(Denied e){failed(e.code);return nullptr;}
  catch(...){failed("native");return nullptr;}
}
static napi_value Assert(napi_env env,napi_callback_info info) {
  State* s=Get(env);
  try { s->live();Need(s->bound,"pending");size_t count=3;napi_value args[3];N(napi_get_cb_info(env,info,&count,args,nullptr,nullptr));Need(count==3,"object");
    for(int i=0;i<3;i++){napi_value expected;bool same;Need(s->objects[i]!=nullptr,"object");N(napi_get_reference_value(env,s->objects[i],&expected));N(napi_strict_equals(env,args[i],expected,&same));Need(same,"object");}
    Owner(s);return Boolean(env,true);
  } catch(Denied e){s->requestEnd(e.code);s->stop();s->releaseObjects();Error(env,e.code);return nullptr;}
}
static napi_value Revoke(napi_env env,napi_callback_info) {auto s=Get(env);s->stop();s->releaseObjects();return Boolean(env,true);}
static napi_value Snapshot(napi_env env,napi_callback_info) {
  auto s=Get(env);napi_value result;napi_create_object(env,&result);
  napi_set_named_property(env,result,"ended",Boolean(env,s->ended));napi_set_named_property(env,result,"bound",Boolean(env,s->bound&&!s->ended));
  napi_set_named_property(env,result,"productionAuthority",Boolean(env,false));
  napi_set_named_property(env,result,"handlesClosed",Boolean(env,s->owner.value==INVALID_HANDLE_VALUE&&s->pipe.value==INVALID_HANDLE_VALUE&&s->workDone.value==INVALID_HANDLE_VALUE&&s->images.empty()));
  napi_set_named_property(env,result,"referencesReleased",Boolean(env,!s->objects[0]&&!s->objects[1]&&!s->objects[2]));
  const std::pair<const char*,uint32_t> counts[]={{"maxFrameBytes",s->maxFrameBytes.load()},{"connectionAttempts",s->connectionAttempts},
    {"queuedWork",s->queuedWork},{"peakReferences",s->peakReferences},{"observerThreads",s->observerThreads}};
  for(const auto& count:counts) {napi_value value;napi_create_uint32(env,count.second,&value);napi_set_named_property(env,result,count.first,value);}
  napi_set_named_property(env,result,"activeWork",Boolean(env,s->active));return result;
}
static void Cleanup(void* pointer) {auto s=static_cast<State*>(pointer);s->stop();s->releaseObjects();}
static void Finalize(napi_env,void* pointer,void*) {delete static_cast<State*>(pointer);}
static napi_value Init(napi_env env,napi_value exports) {
  auto state=new State;state->env=env;napi_set_instance_data(env,state,Finalize,nullptr);napi_add_env_cleanup_hook(env,Cleanup,state);
  napi_property_descriptor props[]={ {"authenticate",nullptr,Authenticate,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"bind",nullptr,Bind,nullptr,nullptr,nullptr,napi_default,nullptr}, {"assert",nullptr,Assert,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"revoke",nullptr,Revoke,nullptr,nullptr,nullptr,napi_default,nullptr}, {"snapshot",nullptr,Snapshot,nullptr,nullptr,nullptr,napi_default,nullptr} };
  napi_define_properties(env,exports,5,props);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)

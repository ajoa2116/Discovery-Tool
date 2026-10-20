// Runs before App imports; no native fetch is retained or invoked.
module.exports=function installAppFixture(){
 const clone=value=>JSON.parse(JSON.stringify(value));
 const check=(condition,message)=>{if(!condition){state.violations.push(message);throw Error(message);}};
 const camera=(id,name,location)=>({id,anchor:{macAddress:id==='camera/A'?'00:11:22:33:44:50':'00:11:22:33:44:52',vendor:'Fixture',model:name},
   network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.50']},
   technician:{name,location,notes:'Fixture only'},status:'UNKNOWN',sessionVerification:'NOT_FOUND',discoveredPhase:3,firstSeenAt:'fixture',lastSeenAt:'fixture'});
 const project=(name,devices)=>({id:name,name,siteLocation:'Fixture site',technicianName:'Fixture technician',createdAt:'2026-10-19T12:00:00Z',updatedAt:'2026-10-19T12:00:00Z',devices,collisions:[],rogueDhcpEvents:[],auditLogs:[],totalDevices:devices.length});
 const initial={mode:'PROJECT',dirty:false,project:project('Project One',[camera('camera/A','Camera A','Lobby'),camera('camera/B','Camera B','Garage')])};
 const monitoring={enabled:false,running:false,intervalMs:30000,status:'OFF'};
 const originalStorage=Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]));
 localStorage.clear();localStorage.setItem('cctv-network-assistant-preferences',JSON.stringify({version:1,appearance:'LIGHT',monitoringEnabled:false,monitoringCadenceMs:30000,newDeviceNotifications:false,browserPreference:'SYSTEM',visibleColumns:['NAME','STATUS','IP']}));
 const state=window.__appTransport={requests:[],violations:[],subscriptions:[],subscriptionId:0,holdSessions:false,session:clone(initial),expectedWrites:[],unmount:null};
 state.snapshot=()=>clone(state.session);
 state.nextProject=(sameId)=>({mode:'PROJECT',dirty:false,project:project('Project Two',[camera(sameId?'camera/A':'camera/C',sameId?'Camera A':'Camera C','New project location')])});
 state.emit=(type,data)=>{const active=state.subscriptions.filter(s=>s.active);check(active.length===1,'inert-subscription-cardinality');active[0].onMessage({data:JSON.stringify({type,data})});};
 state.reconcile=()=>{const active=state.subscriptions.filter(s=>s.active);check(active.length===1,'inert-subscription-cardinality');active[0].onState('CONNECTED');};
 state.restore=()=>{localStorage.clear();for(const [key,value] of Object.entries(originalStorage))localStorage.setItem(key,value);
   check(JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])))===JSON.stringify(originalStorage),'preference-restore');};
 window.WebSocket=class{constructor(){check(false,'WebSocket-construction');}};
 window.EventSource=class{constructor(){check(false,'EventSource-construction');}};
 window.open=()=>{check(false,'window-open');};
 window.alert=()=>{check(false,'unexpected-alert');};window.prompt=()=>{check(false,'unexpected-prompt');};
 window.fetch=(url,options={})=>{
   const href=typeof url==='string'?url:url instanceof URL?url.href:url.url;
   const u=new URL(href,location.href),method=options.method||'GET';
   let body=null;try{if(options.body!==undefined)body=JSON.parse(options.body);}catch{check(false,'non-json-body');}
   const record={id:state.requests.length+1,url:u.href,path:u.pathname,method,body,state:'pending',response:null,resolve:null,reject:null};
   state.requests.push(record);check(state.requests.length<=250,'request-budget');
   check(u.origin==='http://localhost:3001'&&!u.search&&!u.hash,'unexpected-origin-or-query:'+u.href);
   let response,held=false;
   if(method==='GET'){
     check(body===null,'get-body');
     switch(u.pathname){
       case '/api/project/session':held=state.holdSessions;response=clone(state.session);break;
       case '/api/diagnostics/refresh':response=clone(monitoring);break;
       case '/api/pair/status':response=null;break;
       case '/api/system/preflight':response={overall:'UNAVAILABLE',version:'1.6.0',runtime:'Inert fixture',checks:[]};break;
       case '/api/report-set':response={members:[]};break;
       case '/api/pair/adapters':response=[];break;
       case '/api/discovery/status':response={foreground:{epoch:'fixture',revision:0,session:null},monitoring:clone(monitoring)};break;
       case '/api/tasks':response={tasks:[],active:0,attention:0};break;
       default:check(false,'unexpected-get:'+u.pathname);
     }
   }else if(method==='POST'&&u.pathname==='/api/monitoring/preferences'){
     check(JSON.stringify(body)===JSON.stringify({enabled:false,cadenceMs:30000}),'monitoring-body');response=clone(monitoring);
   }else if(method==='POST'&&/^\/api\/device\/[^/]+\/config$/.test(u.pathname)){
     const expected=state.expectedWrites.shift();check(!!expected,'unissued-write');
     check(u.pathname==='/api/device/'+encodeURIComponent(expected.id)+'/config','wrong-write-id');
     check(JSON.stringify(body)===JSON.stringify({technician:{location:expected.value}}),'wrong-write-body');held=true;
   }else check(false,'unexpected-method-or-route:'+method+':'+u.pathname);
   if(method==='POST')check(new Headers(options.headers).get('Content-Type')==='application/json','post-content-type');
   return new Promise((resolve,reject)=>{
     const signal=options.signal;
     const detach=()=>signal?.removeEventListener('abort',abort);
     record.resolve=(data,status=200)=>{check(record.state==='pending','duplicate-response:'+record.id);detach();record.state='resolved';record.response=clone(data);resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));};
     record.reject=(message='Injected transport failure')=>{check(record.state==='pending','duplicate-rejection:'+record.id);detach();record.state='rejected';reject(Error(message));};
     const abort=()=>{if(record.state==='pending'){detach();record.state='aborted';reject(new DOMException('Fixture request aborted','AbortError'));}};
     if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
     if(!held)record.resolve(response);
   });
 };
};

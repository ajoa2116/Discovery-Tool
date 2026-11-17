// Synthetic-only loader. Requiring this support file never evaluates application code.
// A VM is NOT a security boundary; only exact measured, reviewed bytes are eligible.
'use strict';
const crypto=require('node:crypto');
const PROFILE='address-identity-synthetic-behavior-v1';
const EXPORTS=Object.freeze(['addressRelationship','canonicalAnchor','canonicalMac','conflicts','hasIdentity','ipv4Number','mergeAnchors','normalizeIPv4','normalizeManualMac','prefixMask','sameIdentity','selectIdentity','sharesAnchor']);
const CANDIDATE=Object.freeze({bytes:3634,sha256:'4fecf936ef7325855b8ec36a3e35afcb773b720c4a246b1d21a73f41ffa5de6b'});
// Archived ORIGINAL island emissions, scripts/BACKEND_STAGING.md:422/424.
// Fresh transpilation must reproduce these bytes; this never renews caller evidence.
const ORIGINALS=Object.freeze([
  Object.freeze({bytes:1059,sha256:'13dcf9f36d058185b789e3894c68358837bd84d5a67b1361d4b105b46819d024'}),
  Object.freeze({bytes:2945,sha256:'c9b4315b782e5dedfeebfda6bd9f85cf7f17b4786dc3c737e78d5f2512f4ee3a'}),
]);
const SOURCE_PINS=Object.freeze([
  Object.freeze({path:'src/shared/address_validation.ts',size:1168,sha256:'e289f20eef91feef0b172cb62daf45bcc825a5e0aca04663af047a6498d388cc'}),
  Object.freeze({path:'src/shared/identity_policy.ts',size:3176,sha256:'b138dbc74f35b52a8afb0dd3c2f5fecbe2adc8cde91ff5974c54c0b8a0f2c614'}),
]);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const envelopeDigest=value=>digest(JSON.stringify(value));
function deny(ok,label){if(!ok)throw Error('Island behavior denied: '+label);}
function resolveModule(specifier,referrer){
  deny(referrer==='original/address_validation.js'&&specifier==='./identity_policy.js','module request');
  return 'original/identity_policy.js';
}
function validateEnvelope(envelope,seal){
  deny(envelopeDigest(envelope)===seal,'sealed evidence changed');
  deny(envelope.profile===PROFILE&&/^[a-f0-9]{32}$/.test(envelope.nonce),'profile/nonce');
  deny(envelope.productionAuthority===false&&envelope.runtimeEquivalence===false&&envelope.stagingAdmission===false&&
    envelope.authoritativeBaseline===825&&envelope.ceiling===64&&envelope.achievedPayloadCount===null&&
    envelope.callerOutputReviews==='29 unresolved; historical evidence not renewed','claims/accounting');
  deny(envelope.bindings&&Array.isArray(envelope.bindings.observations),'input evidence');
  for(const pin of SOURCE_PINS){
    const rows=envelope.bindings.observations.filter(row=>row.root==='repository'&&row.path===pin.path);
    deny(rows.length===1&&rows[0].size===pin.size&&rows[0].sha256===pin.sha256,'source pin');
  }
  deny(Array.isArray(envelope.modules)&&envelope.modules.length===3,'module count');
  const ids=['original/address_validation.js','original/identity_policy.js','candidate/address-identity.generated.js'];
  for(let index=0;index<ids.length;index++){
    const row=envelope.modules[index];
    deny(row.id===ids[index]&&typeof row.text==='string'&&Buffer.byteLength(row.text)<=16384,'module identity/limit');
    const bytes=Buffer.from(row.text,'utf8');
    deny(bytes.length===row.bytes&&digest(bytes)===row.sha256,'module byte binding');
    if(index===2)deny(row.bytes===CANDIDATE.bytes&&row.sha256===CANDIDATE.sha256,'November 2 candidate');
    else deny(row.bytes===ORIGINALS[index].bytes&&row.sha256===ORIGINALS[index].sha256,'original emission reference bytes');
  }
  return true;
}

// Self-contained: this function is installed as trusted harness code INSIDE each VM.
// Only JSON results cross out; no host objects/functions are passed to application code.
function runBehaviorMatrix(api){
  const rows=[];
  const encode=value=>{
    if(value===undefined)return {$undefined:true};
    if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
    if(Object.is(value,-0))return {$number:'-0'};
    if(Array.isArray(value))return value.map(encode);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,encode(value[key])]));
    return value;
  };
  const same=(a,b)=>JSON.stringify(encode(a))===JSON.stringify(encode(b));
  const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};
  const add=(id,exports,expected,work)=>{
    let actual,error;
    try{actual=work();}catch(caught){error={name:caught?.name||typeof caught,message:String(caught?.message??caught)};}
    rows.push({id,exports,expected:encode(expected),actual:encode(actual),error:error||null,pass:!error&&same(actual,expected)});
  };
  const mac='00:50:f9:63:fb:0f',other='e4:30:22:cd:68:85';
  const device=(id,anchor)=>({id,anchor,unrelated:{keep:'value'}});
  for(const [label,input,expected,number]of [
    ['zero','0.0.0.0','0.0.0.0',0],['max','255.255.255.255','255.255.255.255',4294967295],
    ['trim',' 192.168.1.100 ','192.168.1.100',3232235876],
    ...['1.2.3','1..2.3','1.2.3.256','1.2.3.-1','1.2.3.1e2','192.168.001.100','1.2.3.4.5',''].map(ip=>[ip,ip,null,null]),
  ]){
    add('ipv4/'+label,['normalizeIPv4','ipv4Number'],[expected,number],()=>[api.normalizeIPv4(input),api.ipv4Number(input)]);
  }
  for(const [prefix,expected]of [[0,'0.0.0.0'],[1,'128.0.0.0'],[31,'255.255.255.254'],[32,'255.255.255.255'],
    // Standalone prefixMask currently uses JS shifts, not relationship validation.
    [-1,'255.255.255.254'],[33,'128.0.0.0'],[1.5,'192.0.0.0'],[NaN,'255.255.255.255'],[Infinity,'255.255.255.255']]){
    add('mask/'+String(prefix),['prefixMask'],expected,()=>api.prefixMask(prefix));
  }
  for(const [label,ip,local,prefix,expected]of [
    ['all','0.0.0.0','255.255.255.255',0,'LOCAL'],['half-local','128.0.0.0','255.255.255.255',1,'LOCAL'],
    ['half-other','127.255.255.255','128.0.0.0',1,'DIFFERENT_SUBNET'],
    ['pair-local','192.168.1.0','192.168.1.1',31,'LOCAL'],['pair-other','192.168.1.2','192.168.1.1',31,'DIFFERENT_SUBNET'],
    ['host-local','255.255.255.255','255.255.255.255',32,'LOCAL'],['host-other','0.0.0.0','0.0.0.1',32,'DIFFERENT_SUBNET'],
    ['invalid-target','bad','1.2.3.4',24,'UNKNOWN'],['invalid-local','1.2.3.4','bad',24,'UNKNOWN'],
    ...[-1,33,1.5,NaN,Infinity].map(p=>['invalid-'+String(p),'1.2.3.4','1.2.3.4',p,'UNKNOWN']),
  ])add('relationship/'+label,['addressRelationship'],expected,()=>api.addressRelationship(ip,local,prefix));
  for(const [label,input,expected]of [
    ['compact','0050F963FB0F',mac],['colon','00:50:F9:63:FB:0F',mac],['hyphen','00-50-f9-63-fb-0f',mac],
    ['dotted','0050.f963.fb0f',mac],['trim',' 00:50:f9:63:fb:0f ',mac],['local','02:00:00:00:00:01','02:00:00:00:00:01'],
    ...[undefined,null,'','bad','00:50-f9:63:fb:0f','0050f963fb0','00:00:00:00:00:00','ff:ff:ff:ff:ff:ff','01:00:5e:00:00:01'].map((v,i)=>['reject-'+i,v,null]),
  ])add('mac/'+label,['canonicalMac','normalizeManualMac'],[expected,expected],()=>[api.canonicalMac(input),api.normalizeManualMac(input)]);
  add('alias',['canonicalMac','normalizeManualMac'],true,()=>api.normalizeManualMac===api.canonicalMac);
  add('canonical-anchor',['canonicalAnchor'],{
    value:{macAddress:mac,onvifEndpointUuid:'uuid-a',serialNumber:'Serial-A',vendor:'Keep',metadata:{keep:'nested'}},newObject:true,retainedReference:true,unchanged:true,
  },()=>{
    const input=deepFreeze({macAddress:'0050F963FB0F',onvifEndpointUuid:' UUID-A ',serialNumber:' Serial-A ',vendor:'Keep',metadata:{keep:'nested'}}),before=encode(input);
    const result=api.canonicalAnchor(input);return {value:result,newObject:result!==input,retainedReference:result.metadata===input.metadata,unchanged:same(input,before)};
  });
  add('empty-anchor',['canonicalAnchor','hasIdentity'],{
    value:{macAddress:null,onvifEndpointUuid:undefined,serialNumber:undefined},present:false,
  },()=>({value:api.canonicalAnchor({}),present:api.hasIdentity(device('none',{}))}));
  for(const anchor of [{macAddress:mac},{onvifEndpointUuid:' UUID '},{serialNumber:'Serial'}]){
    add('has-identity/'+Object.keys(anchor)[0],['hasIdentity'],true,()=>api.hasIdentity(deepFreeze(device('present',anchor))));
  }
  for(const [label,incoming,expected]of [
    ['empty',{macAddress:null,onvifEndpointUuid:' ',serialNumber:'',vendor:''},{macAddress:mac,onvifEndpointUuid:'uuid-a',serialNumber:'Serial-A',vendor:'Keep'}],
    ['replace',{macAddress:other,onvifEndpointUuid:' UUID-B ',serialNumber:' New ',vendor:'New'},{macAddress:other,onvifEndpointUuid:'uuid-b',serialNumber:'New',vendor:'New'}],
  ])add('merge/'+label,['mergeAnchors'],{value:expected,newObject:true,unchanged:true},()=>{
    const saved=deepFreeze({macAddress:mac,onvifEndpointUuid:'uuid-a',serialNumber:'Serial-A',vendor:'Keep'}),next=deepFreeze(incoming);
    const before=encode([saved,next]),value=api.mergeAnchors(saved,next);
    return {value,newObject:value!==saved&&value!==next,unchanged:same([saved,next],before)};
  });
  for(const [label,left,right,expected]of [
    ['mac',{macAddress:mac},{macAddress:'0050F963FB0F'},[true,false,true]],
    ['uuid',{onvifEndpointUuid:' UUID '},{onvifEndpointUuid:'uuid'},[true,false,true]],
    ['serial',{serialNumber:' Serial '},{serialNumber:'serial'},[true,false,true]],
    ['none',{}, {},[false,false,false]],
    ['mac-conflict',{macAddress:mac,serialNumber:'s'},{macAddress:other,serialNumber:'s'},[true,true,false]],
    ['uuid-conflict',{macAddress:mac,onvifEndpointUuid:'a'},{macAddress:mac,onvifEndpointUuid:'b'},[true,true,false]],
    ['different',{macAddress:mac},{macAddress:other},[false,true,false]],
  ])add('identity/'+label,['sharesAnchor','conflicts','sameIdentity'],{value:expected,unchanged:true},()=>{
    const a=deepFreeze(device('a',left)),b=deepFreeze(device('b',right)),before=encode([a,b]);
    return {value:[api.sharesAnchor(a,b),api.conflicts(a,b),api.sameIdentity(a,b)],unchanged:same([a,b],before)};
  });
  const selectors=[
    ['none',[device('a',{macAddress:mac})],device('in',{macAddress:other}),-1,false,[]],
    ['unique',[device('a',{macAddress:mac})],device('in',{macAddress:mac}),0,false,[0]],
    ['exact',[device('other',{serialNumber:'s'}),device('exact',{macAddress:mac,serialNumber:'s'})],device('exact',{serialNumber:'s'}),1,false,[0,1]],
    ['conflicting-exact',[device('exact',{macAddress:mac})],device('exact',{macAddress:other}),-1,false,[0]],
    ['ambiguous',[device('a',{macAddress:mac,serialNumber:'s'}),device('b',{macAddress:other,serialNumber:'s'})],device('in',{serialNumber:'s'}),-1,true,[0,1]],
    ['ambiguous-exact',[device('a',{macAddress:mac,serialNumber:'s'}),device('b',{macAddress:other,serialNumber:'s'})],device('a',{serialNumber:'s'}),-1,true,[0,1]],
    ['multiple-partials',[device('a',{macAddress:mac}),device('b',{onvifEndpointUuid:'uuid'})],device('in',{macAddress:mac,onvifEndpointUuid:'uuid'}),-1,true,[0,1]],
    ['bridge',[device('exact',{macAddress:mac}),device('partial',{onvifEndpointUuid:'uuid'})],device('exact',{macAddress:mac,onvifEndpointUuid:'uuid'}),0,false,[0,1]],
  ];
  for(const [label,devices,incoming,index,ambiguous,related]of selectors)for(const reverse of [false,true]){
    add('select/'+label+'/'+reverse,['selectIdentity'],{
      index:index<0?index:reverse?devices.length-1-index:index,ambiguous,
      related:reverse?related.map(i=>devices.length-1-i).reverse():related,retainedReferences:true,newRelatedArray:true,unchanged:true,
    },()=>{
      const rows=devices.slice();if(reverse)rows.reverse();deepFreeze(rows);deepFreeze(incoming);const before=encode([rows,incoming]);
      const result=api.selectIdentity(rows,incoming);
      return {index:result.index,ambiguous:result.ambiguous,related:result.related.map(row=>rows.indexOf(row)),
        retainedReferences:result.related.every(row=>rows.includes(row)),newRelatedArray:result.related!==rows,unchanged:same([rows,incoming],before)};
    });
  }
  return rows;
}

function compareResults(runs){
  const mismatches=[];
  deny(Array.isArray(runs)&&runs.length===3,'run count');
  deny(runs.map(run=>run.label).join('|')==='original/address-first|original/identity-first|candidate','run identities');
  const reference=runs[0].rows;
  // Expected values come from the trusted harness, never from a child's assertion.
  // Missing API calls are caught as data; this does not load application modules.
  const schema=runBehaviorMatrix(Object.create(null)).map(row=>[row.id,row.exports,row.expected]);
  deny(JSON.stringify(reference.map(row=>[row.id,row.exports,row.expected]))===JSON.stringify(schema),'trusted expected-result matrix');
  deny(reference.length>0&&new Set(reference.map(row=>row.id)).size===reference.length,'matrix identities');
  deny(JSON.stringify([...new Set(reference.flatMap(row=>row.exports))].sort())===JSON.stringify(EXPORTS),'matrix export coverage');
  for(const run of runs){
    deny(JSON.stringify(run.rows.map(row=>[row.id,row.exports,row.expected]))===JSON.stringify(reference.map(row=>[row.id,row.exports,row.expected])),'matrix correspondence');
    for(let index=0;index<run.rows.length;index++){
      const row=run.rows[index];
      if(row.error||row.pass!==true||JSON.stringify(row.actual)!==JSON.stringify(row.expected))mismatches.push({run:run.label,id:row.id,kind:'expected',expected:row.expected,actual:row.actual,error:row.error});
      if(JSON.stringify(row.actual)!==JSON.stringify(reference[index].actual)||JSON.stringify(row.error)!==JSON.stringify(reference[index].error))mismatches.push({run:run.label,id:row.id,kind:'differential',reference:reference[index].actual,actual:row.actual,error:row.error});
    }
    const candidate=run.label==='candidate',identityFirst=run.label==='original/identity-first';
    const order=candidate?['candidate/address-identity.generated.js']:identityFirst?
      ['original/identity_policy.js','original/address_validation.js']:['original/address_validation.js','original/identity_policy.js'];
    const expectedEvents=order.flatMap((module,index)=>[
      {module,phase:'before-link',status:!candidate&&!identityFirst&&index===1?'evaluated':'unlinked'},
      {module,phase:'before-evaluate',status:!candidate&&!identityFirst&&index===1?'evaluated':'linked'},
      {module,phase:'after-evaluate',status:'evaluated'},
      {module,phase:'after-repeat-evaluate',status:'evaluated'},
    ]);
    if(run.semantics.aliasIdentity!==true||run.semantics.cacheIdentity!==true||run.semantics.namespaceTopology!==(candidate?1:2)||
      JSON.stringify(run.semantics.events)!==JSON.stringify(expectedEvents))mismatches.push({run:run.label,kind:'module-semantics',actual:run.semantics});
  }
  return {status:mismatches.length?'mismatch':'bounded-synthetic-agreement',mismatches,runs,
    productionAuthority:false,runtimeEquivalence:false,stagingAdmission:false,facadeRemovability:false,completeClosure:false,
    authoritativeBaseline:825,ceiling:64,achievedPayloadCount:null,callerOutputReviews:'29 unresolved; historical evidence not renewed',
    limits:['No OS-level containment or native mapped-image attestation.','Evaluation status/order only; internal timing equivalence is unproven.',
      'No mutable exported binding exists in this pair; general live-binding equivalence is unproven.',
      'Repeated same-key namespace/function identity is observed within each graph; cross-graph namespace topology differs.',
      'Finite synthetic cases do not authorize facade removal, staging, signing, release or production use.']};
}

async function evaluateEnvelope(envelope,seal){
  validateEnvelope(envelope,seal); // Recheck bytes at the consumption boundary.
  const vm=require('node:vm');deny(typeof vm.SourceTextModule==='function','VM modules unavailable');
  const runs=[];
  for(const label of ['original/address-first','original/identity-first','candidate']){
    const context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}}),cache=new Map(),events=[];
    const selected=envelope.modules.filter(row=>row.id.startsWith(label==='candidate'?'candidate/':'original/'));
    for(const row of selected)cache.set(row.id,new vm.SourceTextModule(row.text,{context,identifier:row.id,
      initializeImportMeta(){throw Error('Import metadata prohibited');},
      importModuleDynamically(){throw Error('Dynamic imports prohibited');}}));
    const order=label==='original/identity-first'?[...selected].reverse():selected;
    for(const row of order){
      const module=cache.get(row.id);events.push({module:row.id,phase:'before-link',status:module.status});
      if(module.status==='unlinked')await module.link((specifier,referrer)=>{
        const target=resolveModule(specifier,referrer.identifier);deny(cache.has(target),'missing linked module');return cache.get(target);
      });
      events.push({module:row.id,phase:'before-evaluate',status:module.status});
      await module.evaluate({timeout:1000});events.push({module:row.id,phase:'after-evaluate',status:module.status});
      deny(module.status==='evaluated','module evaluation');
      const namespace=module.namespace,functions=Object.keys(namespace).map(key=>[key,namespace[key]]);
      await cache.get(row.id).evaluate({timeout:1000});
      deny(cache.get(row.id)===module&&module.namespace===namespace&&functions.every(([key,value])=>module.namespace[key]===value),'repeat evaluation identity');
      events.push({module:row.id,phase:'after-repeat-evaluate',status:module.status});
    }
    const namespaces=selected.map(row=>cache.get(row.id).namespace);
    const allNames=namespaces.flatMap(namespace=>Object.keys(namespace)).sort();
    deny(JSON.stringify(allNames)===JSON.stringify(EXPORTS),'loaded exports');
    // These namespace objects were created in this context, not supplied by the host.
    context.addressNamespace=namespaces[0];context.identityNamespace=namespaces.at(-1);
    const cacheIdentity=selected.every(row=>{
      const first=cache.get(row.id),second=cache.get(row.id);
      return first===second&&first.namespace===second.namespace&&Object.keys(first.namespace).every(key=>first.namespace[key]===second.namespace[key]);
    });
    const script=new vm.Script(`JSON.stringify((${runBehaviorMatrix.toString()})({...addressNamespace,...identityNamespace}))`,{filename:'synthetic-matrix.js'});
    const rows=JSON.parse(script.runInContext(context,{timeout:2000}));
    const aliasIdentity=new vm.Script('addressNamespace.normalizeManualMac === identityNamespace.canonicalMac').runInContext(context,{timeout:1000});
    runs.push({label,rows,semantics:{aliasIdentity,cacheIdentity,namespaceTopology:namespaces.length,events}});
    cache.clear();delete context.addressNamespace;delete context.identityNamespace;
  }
  return compareResults(runs);
}

// Fixed inert programs: no imports, modules, subprocesses, network or file writes.
// Node permission mode is defense in depth, not Windows OS confinement.
function launcherPreflightProgram(scenario){
  switch(scenario){
    case 'complete':case 'spawn-failure':case 'cleanup-only':
      return "'use strict';process.stdout.write('launcher-preflight-complete\\n');";
    case 'timeout':return "'use strict';setInterval(()=>{},1000);";
    case 'overflow':case 'primary-and-cleanup':
      return "'use strict';process.stdout.write('x'.repeat(4096));process.stderr.write('x'.repeat(65536));setInterval(()=>{},1000);";
    default:throw Error('Unknown inert preflight program');
  }
}
module.exports={launcherPreflightProgram,PROFILE,EXPORTS,CANDIDATE,ORIGINALS,SOURCE_PINS,envelopeDigest,validateEnvelope,resolveModule,runBehaviorMatrix,compareResults};
// No alternate CLI entry point, module path, flags or inherited application environment.
if(require.main===module){
  const [mode,nonce,seal,...extra]=process.argv.slice(2);
  try{
    deny(mode==='--island-behavior-child'&&extra.length===0&&/^[a-f0-9]{32}$/.test(nonce)&&/^[a-f0-9]{64}$/.test(seal),'child invocation');
    deny(process.execArgv.length===2&&process.execArgv.includes('--experimental-vm-modules')&&process.execArgv.includes('--no-warnings'),'child flags');
    deny(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.ESBUILD_BINARY_PATH,'child environment');
    deny(Object.keys(process.env).every(key=>/^(TEMP|TMP|SystemRoot|WINDIR)$/i.test(key))&&
      process.env.TEMP===process.cwd()&&process.env.TMP===process.cwd(),'child environment allowlist/cwd');
    let input='';process.stdin.setEncoding('utf8');
    const watchdog=setTimeout(()=>process.exit(124),10000);
    process.stdin.on('data',chunk=>{input+=chunk;if(Buffer.byteLength(input)>262144)process.exit(125);});
    process.stdin.on('end',async()=>{
      try{
        const envelope=JSON.parse(input);deny(envelope.nonce===nonce,'child nonce');
        deny(envelope.bindings.node.version===process.version&&envelope.bindings.node.path===process.execPath,'child Node identity');
        const report=await evaluateEnvelope(envelope,seal),output=JSON.stringify({nonce,seal,report});
        deny(Buffer.byteLength(output)<=262144,'result limit');
        process.stdout.write(output,()=>{clearTimeout(watchdog);process.exit(0);});
      }catch(error){clearTimeout(watchdog);process.stderr.write(String(error?.message??error));process.exitCode=1;}
    });
  }catch(error){process.stderr.write(String(error?.message??error));process.exitCode=1;}
}

// Pure comparison planning. No require/import callback, loader or admission issuer.
const crypto=require('node:crypto');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const {specs,matchActualCompilerGraph}=require('./dependency_guard_descriptors.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const expected={
  core:{app:{callable:true,environment:'production',defaultViewEngine:null},middleware:{parsers:['json','raw','text','urlencoded'],staticFunction:true,emptyJsonNext:1},
    ordering:['first','second','handler:23'],route:{parameter:'17'},error:{message:'fixture-error',order:['throw','error-handler']},
    request:{accepted:'json'},response:{body:'{"ok":true}',contentType:'application/json'},backendStyleEngineLoaded:false},
  computed:{rendered:'fixture:safe',engineIdentityReused:true,computedRequests:1,engineTarget:'node_modules/fixture-view-engine/index.js'},
  missing:{reason:'missing-dependency',terminalReason:'terminal-denial',callbacks:0,unreviewedEngineLoaded:false},
  unexpected:{reason:'unexpected-computed-import',terminalReason:'terminal-denial',callbacks:0,unreviewedEngineLoaded:false},
};
const prerequisites=[
  {id:'fresh-output-object',requirement:'Fresh independently measured live bundle bytes/identity; the successful capture deleted its output. Metadata is not a live artifact.'},
  {id:'independent-generated-admission',requirement:'Separate review of exact output role, bytes, derivation and dependency selection through existing admission. Source reviews and copied-candidate status cannot authorize it.'},
  {id:'conditional-internal-code',requirement:'Resolve the execution boundary for all five selected/unadmitted conditional modules without branch removal assumptions. Bundler wrappers bypass Node per-file hooks.'},
  {id:'computed-and-external-resolution',requirement:'Exact permitted runtime edges and namespace restrictions; computed engines remain default-deny except a separately reviewed inert tuple, with no ambient search or production engines.'},
  {id:'unexpected-load-denial',requirement:'Independent sticky audit of every unexpected request, including caught library errors; matching return values cannot clear denial.'},
  {id:'owned-consumer-lifetime',requirement:'Bind one-use selection/handoff to an exact birth-specific OwnedChild/process handle and Job; retain measured pins through denial/cancellation until exact exit and confirmed cleanup.'},
  {id:'isolated-runtime-boundary',requirement:'Separately reviewed harmless execution boundary and runtime; private non-redirected roots, no preload/addon/provider/network/listener authority, bounded shutdown and evidence preservation.'},
  {id:'resource-and-policy-boundaries',requirement:'Verify process/Job/pipe/monitor/pin cleanup ordering; retain uncertainty. Keep release policy and 64-file ceiling unchanged; current 102-file estimate is not a valid payload.'},
];
function plan({baseline,compilerRecord}){
  const check=(ok,reason)=>{if(!ok)throw Object.assign(Error(reason),{code:'EXPRESS_BEHAVIOR_CONTRACT_DENIED',reason});};
  const same=(a,b)=>hash(a)===hash(b);
  check(baseline.version==='4.22.2'&&baseline.productionAuthority===false&&baseline.completeClosure===false,'behavior-baseline');
  check(Array.isArray(baseline.results)&&same(baseline.results.map(r=>r.mode).sort(),Object.keys(expected).sort()),'behavior-modes');
  for(const mode of Object.keys(expected)){
    const result=baseline.results.find(r=>r.mode===mode);
    check(result.passed===true&&result.productionAuthority===false&&result.owner.status===0&&result.owner.signal===null&&result.owner.error===null,'behavior-baseline-child');
    check(same(result.behavior,expected[mode]),'behavior-observation:'+mode);
    check(same(result.violations.map(v=>v.reason),mode==='missing'?['missing-dependency','terminal-denial']:mode==='unexpected'?['unexpected-computed-import','terminal-denial']:[]),'behavior-unexpected-load');
  }
  const c=compilerRecord;
  check(c.productionAuthority===false&&c.executionAuthority===false&&c.completeClosure===false&&c.actual.actualMetafileCorrespondence===true,'behavior-compiler-record');
  const output=c.actual.output;
  check(output.path==='node_modules/express/lib/consolidated.cjs'&&output.size===651753&&output.sha256==='3327ef9e74137a5121da2f23bc23d394a42d85a9263286d5196b5c9a026707c5'&&same(output,c.compilerEvidence.output),'behavior-output-measurement');
  check(crypto.createHash('sha256').update(Buffer.from(c.rawMetafile)).digest('hex')===c.compilerEvidence.metafile.sha256,'behavior-metafile-digest');
  const sourceEdges=baseline.sourceEdges.map((e,occurrence)=>({occurrence,source:{root:'sources',path:e.source},line:e.line,kind:'require',specifier:e.specifier,
    target:e.resolution==='node-builtin'?'node:'+e.specifier.replace(/^node:/,''):e.resolvedPath?{root:'sources',path:e.resolvedPath}:null}));
  check(hash(sourceEdges)===c.descriptors.sourceEdgesSha256&&hash(c.descriptors)===c.compilerEvidence.descriptorSha256,'behavior-source-provenance');
  for(const file of baseline.sourceProvenance){
    const measured=c.observations.filter(f=>f.root==='sources'&&f.path===file.path);
    check(measured.length===1&&measured[0].sha256===file.source.sha256&&measured[0].size===file.source.size,'behavior-source-bytes');
  }
  for(const s of specs){
    const d=c.descriptors.descriptors.filter(d=>d.source.path===s.importer);
    check(d.length===1&&d[0].guard.category===s.category&&d[0].guard.expression===s.expression&&d[0].runtimeAdmission==='unadmitted'&&
      d[0].closure==='unresolved'&&d[0].possibleTargets===null&&(s.target?d[0].target?.path===s.target:d[0].target===null),'behavior-guard-mismatch');
    const original=c.actual.conditional.find(row=>row.descriptor.source.path===s.importer);
    if(s.target)check(original&&same(original.descriptor,d[0])&&original.runtimeAdmission==='unadmitted','behavior-conditional-record');
  }
  const matched=matchActualCompilerGraph({graph:JSON.parse(c.rawMetafile),sourceEdges,measurements:c.observations,descriptors:c.descriptors,
    sourceRoot:'sources',output},check);
  check(same(matched.transformed,c.actual.transformed)&&matched.unresolvedComputed.length===1,'behavior-transformed-evidence');
  const result={version:1,profile:'express-behavior-plan-v1',productionAuthority:false,executionAuthority:false,completeClosure:false,
    original:{observationKind:baseline.observationKind??'provided-record-not-authority',sourceProvenanceSha256:hash(baseline.sourceProvenance),
      behavior:clone(expected),sameProcessRequireIdentityRequired:true},
    generated:{outputMeasurement:clone(output),measurementStatus:'historical-successful-capture-not-live-object',behaviorStatus:'unexecuted',observedBehavior:null,
      expectedBehavior:clone(expected),equivalence:'not-established',sourceOccurrences:347,transformedOccurrences:307,computedEdges:1,
      conditionalFiles:5,conditionalAdmission:'unadmitted',independentAdmission:'missing'},
    comparisonRules:{compare:'observable results, ordering, errors, exports/engine identity within each process and request-denial ledger',
      diagnosticOnly:['internal require.cache entry count','module parent/children graphs','source/stack filenames'],
      unsupported:['full body decoding','file transfers','router exhaustion/timer behavior','production template engines','browser/Electron branches','universal Express/deep-import compatibility']},
    missingExecutionPrerequisites:clone(prerequisites)};
  const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};return freeze(result);
}
module.exports={plan,expected:clone(expected)};

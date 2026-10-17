// Fixture-only archival accounting. Never stages, admits, compiles or loads code.
const crypto=require('node:crypto');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const {verifyCatalog,observeCatalogFiles}=require('../../../scripts/payload-byte-catalog.cjs');
const {matchActualCompilerGraph,specs}=require('./dependency_guard_descriptors.cjs');
const iconv=require('./iconv_artifact_metadata.cjs');
const profile='whole-backend-consolidation-plan-v1',used=new WeakSet();
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function createPlanAssessment({profile:requested,evidence,baseline,proposals,plan}){
  const reject=reason=>{throw Object.assign(Error(reason),{code:'CONSOLIDATION_PLAN_DENIED',reason});};
  if(requested!==profile)reject('plan-opt-in');
  if(!plan||typeof plan!=='object'||used.has(plan))reject('plan-owner-reuse');used.add(plan);
  let snapshot;try{snapshot=hash({evidence,baseline,proposals,plan});}catch{reject('plan-metadata');}
  let terminal=false;
  return Object.freeze({assess(){
    const deny=reason=>{terminal=true;return freeze({version:1,profile,status:'denied',reason,executionAuthority:false,productionReady:false,productionAuthority:false});};
    if(terminal)return deny('plan-sticky-denial');
    try{
      const check=(ok,reason)=>{if(!ok)reject(reason);};
      const same=(a,b)=>hash(a)===hash(b);
      const keys=(v,n)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),n.split(' ').sort()),'plan-shape');
      const validPath=p=>check(typeof p==='string'&&p===p.normalize('NFC')&&!/[\\\x00-\x1f<>:"|?*]/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/[. ]$/.test(s)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)),'plan-path');
      check(hash({evidence,baseline,proposals,plan})===snapshot,'plan-record-changed');
      verifyCatalog(evidence.catalog,evidence.roots);
      check(same(observeCatalogFiles(evidence.roots,evidence.observations.map(({root,path})=>({root,path}))),evidence.observations),'plan-evidence-identity');
      // Canonical fixture snapshots are independently byte-cataloged; metadata
      // is historical evidence, not a live source/output identity or authority.
      for(const [name,value] of [['baseline.json',baseline],['proposals.json',proposals]]){
        const observed=evidence.observations.filter(f=>f.path===name&&f.root==='evidence');
        const bytes=Buffer.from(JSON.stringify(value));
        check(observed.length===1&&observed[0].size===bytes.length&&observed[0].sha256===crypto.createHash('sha256').update(bytes).digest('hex'),'plan-evidence-bytes');
      }
      keys(plan,'version scope baselineSha256 unresolved dispositions outputs assumptions');
      check(plan.version===1&&plan.scope==='entire-recorded-backend'&&plan.baselineSha256===hash(baseline),'plan-baseline-reference');
      const {manifest,inventory,catalog,provenance}=baseline;
      check(manifest.productionAuthority===false&&manifest.completeClosure===false&&catalog.productionAuthority===false,'plan-baseline-authority');
      const candidates=manifest.candidates.filter(c=>c.output);
      check(candidates.length===825&&provenance.files.length===825,'plan-baseline-count');
      check(manifest.unresolved.length===4736&&same(plan.unresolved,manifest.unresolved)&&same(catalog.unresolved.staging,manifest.unresolved),'plan-unresolved-preservation');
      check(Array.isArray(inventory.unresolved)&&Array.isArray(inventory.references),'plan-inventory-evidence');
      check(Array.isArray(plan.dispositions)&&plan.dispositions.length===825,'plan-disposition-count');
      const original=new Map(),seen=new Set();
      for(const c of candidates){
        validPath(c.output);check(!original.has(c.output.toLowerCase()),'plan-baseline-alias');
        const p=provenance.files.filter(p=>p.output===c.output),m=catalog.entries.filter(f=>f.path===c.output&&f.root==='stage');
        check(p.length===1&&m.length===1&&p[0].outputSha256===m[0].sha256&&p[0].outputIdentity.bytes===m[0].size&&
          p[0].status===c.status&&p[0].source===c.source&&same(p[0].selectionReasons,c.selectionReasons),'plan-baseline-measurement');
        original.set(c.output.toLowerCase(),{candidate:c,provenance:p[0],measurement:m[0]});
      }
      check(Array.isArray(proposals)&&proposals.length===2&&new Set(proposals.map(p=>p.kind)).size===2,'plan-proposal-set');
      const incorporated=new Map(),selectedByProposal=new Map(),expectedOutputs=[],protectedPaths=new Set([...specs.filter(s=>s.target).map(s=>s.target),...iconv.unknown,...iconv.tables,...iconv.metadata]);
      const graphCounts={};
      for(const proposal of proposals){
        keys(proposal,'kind record review');const r=proposal.record;
        keys(proposal.review,'recordSha256 outputs');check(proposal.review.recordSha256===hash(r),'plan-independent-proposal-review');
        let sources,outputs;
        if(proposal.kind==='express'){
          check(r.productionAuthority===false&&r.executionAuthority===false&&r.actual.actualMetafileCorrespondence===true,'plan-express-provenance');
          check(r.compilerEvidence.version===1&&r.compilerEvidence.profile==='express-guard-actual-v1'&&r.compilerEvidence.kind==='fresh-esbuild-0.28.2'&&
            r.compilerEvidence.generator.sha256==='c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef'&&
            r.compilerEvidence.intent.sha256==='9a54893b61e1ae6d1d58174f99496aeda8d5103dd3058436024f198a7303bc77','plan-express-derivation');
          check(hash(r.descriptors)===r.compilerEvidence.descriptorSha256,'plan-guard-provenance');
          check(hash(r.sourceEdges)===r.descriptors.sourceEdgesSha256&&hash(r.sourceEdges)===r.compilerEvidence.sourceEdgesSha256,'plan-source-edge-provenance');
          check(same(r.actual.output,r.compilerEvidence.output)&&r.actual.output.path==='node_modules/express/lib/consolidated.cjs'&&
            r.actual.output.size===651753&&r.actual.output.sha256==='3327ef9e74137a5121da2f23bc23d394a42d85a9263286d5196b5c9a026707c5','plan-express-output');
          check(crypto.createHash('sha256').update(r.rawMetafile).digest('hex')===r.compilerEvidence.metafile.sha256,'plan-metafile-digest');
          const matched=matchActualCompilerGraph({graph:JSON.parse(r.rawMetafile),sourceEdges:r.sourceEdges,
            measurements:r.observations,descriptors:r.descriptors,sourceRoot:'sources',output:r.actual.output},check);
          check(same(matched.transformed,r.actual.transformed)&&matched.conditional.length===5&&matched.unresolvedComputed.length===1,'plan-express-correspondence');
          for(const s of specs){const ds=r.descriptors.descriptors.filter(d=>d.source.path===s.importer);
            check(ds.length===1&&ds[0].guard.expression===s.expression&&ds[0].guard.category===s.category&&ds[0].runtimeAdmission==='unadmitted'&&
              ds[0].closure==='unresolved'&&ds[0].possibleTargets===null&&(s.target?ds[0].target?.path===s.target:ds[0].target===null),'plan-conditional-or-computed-change');}
          sources=r.actual.incorporated.map(p=>r.observations.find(f=>f.root==='sources'&&f.path===p));outputs=[r.actual.output];
          selectedByProposal.set(proposal.kind,r.observations.filter(f=>f.root==='sources'&&f.path.startsWith('node_modules/')));
          graphCounts.express={incorporated:sources.length,transformed:matched.transformed.length,sourceOccurrences:r.sourceEdges.length,computed:1,unadmittedConditional:5};
        }else if(proposal.kind==='iconv'){
          check(r.report.productionAuthority===false&&r.report.equivalence===true&&r.report.universalPackageEquivalence===false,'plan-iconv-provenance');
          check(r.intent.treeShaking===false&&r.intent.toolIdentity.sha256==='c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef'&&
            same(r.intent.args.slice(0,8),[iconv.facade,'--bundle','--platform=node','--format=cjs','--target=node24','--tree-shaking=false','--external:safer-buffer','--external:./tables/*.json'])&&
            r.intent.args.length===11&&r.intent.args[8].replaceAll('\\','/').endsWith('/'+iconv.bundle)&&
            r.intent.args[9].replaceAll('\\','/').endsWith('/esbuild-metafile.json')&&r.intent.args[10]==='--log-level=warning','plan-iconv-derivation');
          const normalized=iconv.normalizeIconvMetafile(r.metafile,inventory,'payload','sources',check);
          check(normalized.sourceEdges.length===38&&normalized.runtimeEdges.length===16,'plan-iconv-correspondence');
          sources=iconv.incorporated.map(p=>{const f=r.intent.sourceInputs.find(f=>f.path===p);return f&&{path:p,size:Number(f.staged.identity.size),sha256:f.staged.sha256,identity:f.staged.identity};});
          check(r.intent.sourceInputs.length===33&&new Set(r.intent.sourceInputs.map(f=>f.path)).size===33,'plan-iconv-selection');
          selectedByProposal.set(proposal.kind,r.intent.sourceInputs.map(f=>({path:f.path,size:Number(f.staged.identity.size),sha256:f.staged.sha256})));
          outputs=[iconv.facade,iconv.bundle].map(p=>{const f=r.report.sourceMap.find(f=>f.path===p);return f&&{path:p,size:Number(f.copied.identity.size),sha256:f.copied.sha256,identity:f.copied.identity};});
          check(outputs[0]?.size===73&&outputs[0].sha256==='6f337c46a421eb2e3ca175624f6ffc81ab55cb04bee0a77b95af5ceb873fc7c5'&&
            outputs[1]?.size===126517&&outputs[1].sha256==='6880817d8741d1e77cf89dced6c4eaba6b0c7413f7800d4a400b18ae75116669','plan-iconv-output');
          graphCounts.iconv={incorporated:13,sourceOccurrences:38,runtimeTuples:16,retainedUnknown:9,externalTables:8};
        }else reject('plan-unsupported-proposal');
        for(const f of selectedByProposal.get(proposal.kind)){
          const b=original.get(f.path.toLowerCase());check(b&&b.candidate.output===f.path&&b.measurement.sha256===f.sha256&&b.measurement.size===f.size,'plan-proposal-selection-correspondence');
        }
        check(same(proposal.review.outputs,outputs),'plan-output-review');
        for(const f of sources){
          check(f&&f.identity&&original.has(f.path.toLowerCase()),'plan-source-missing');
          const b=original.get(f.path.toLowerCase());
          check(b.candidate.output===f.path&&b.measurement.sha256===f.sha256&&b.measurement.size===f.size,'plan-source-correspondence');
          if(!incorporated.has(f.path))incorporated.set(f.path,[]);incorporated.get(f.path).push(proposal.kind);
        }
        for(const f of outputs){validPath(f.path);check(f.identity&&Number.isSafeInteger(f.size)&&/^[a-f0-9]{64}$/.test(f.sha256),'plan-output-measurement');
          expectedOutputs.push({proposal:proposal.kind,file:f});}
      }
      check(same(plan.outputs,expectedOutputs),'plan-output-substitution');
      const destinations=new Set();for(const o of plan.outputs){check(!destinations.has(o.file.path.toLowerCase()),'plan-output-alias');destinations.add(o.file.path.toLowerCase());}
      let retained=0,sourceOnly=0,uncertainPhysical=0;const overlaps=[];
      for(const d of plan.dispositions){
        keys(d,'path role file disposition proposals provenanceRef');validPath(d.path);
        const b=original.get(d.path.toLowerCase());check(b&&b.candidate.output===d.path&&!seen.has(d.path.toLowerCase()),'plan-disposition-alias');seen.add(d.path.toLowerCase());
        check(same(d.file,b.provenance)&&d.provenanceRef===hash(b.provenance)&&['compiled-application','package','root-metadata','asset-helper-native'].includes(d.role),'plan-disposition-measurement');
        const expectedRole=b.candidate.status==='transpiled'?'compiled-application':d.path.startsWith('node_modules/')?'package':b.candidate.status==='generated-metadata'?'root-metadata':'asset-helper-native';
        check(d.role===expectedRole,'plan-role');
        const owners=incorporated.get(d.path)??[];
        check(Array.isArray(d.proposals)&&same(d.proposals,[...owners].sort()),'plan-incorporation-claims');
        if(owners.length>1)overlaps.push({path:d.path,proposals:[...owners]});
        check(['retained','incorporated-source-only','conditional-computed-unresolved','external-unknown-retained'].includes(d.disposition),'plan-unsupported-exclusion');
        if(d.disposition==='incorporated-source-only'){
          check(owners.length===1,'plan-conflicting-replacements');check(!protectedPaths.has(d.path),'plan-protected-dependency');
          sourceOnly++;
        }else {retained++;if(d.disposition!=='retained')uncertainPhysical++;check(!destinations.has(d.path.toLowerCase()),'plan-retained-output-collision');}
        if(protectedPaths.has(d.path))check(d.disposition==='conditional-computed-unresolved'||d.disposition==='external-unknown-retained','plan-protected-disposition');
      }
      check(seen.size===825,'plan-missing-disposition');
      for(const p of protectedPaths)check(original.has(p.toLowerCase())&&seen.has(p.toLowerCase()),'plan-protected-file-missing');
      const roles=Object.fromEntries(['compiled-application','package','root-metadata','asset-helper-native'].map(role=>[role,plan.dispositions.filter(d=>d.role===role).length]));
      check(same(roles,{'compiled-application':97,package:710,'root-metadata':1,'asset-helper-native':17}),'plan-category-count');
      check(same(plan.assumptions,['archival-bytes-not-live-admission','proposed-replacement-not-approved','runtime-resolution-not-closed','no-authoritative-selection-change']),'plan-assumptions');
      const arithmetic=retained+plan.outputs.length;
      const selectionOverlap=selectedByProposal.get('express').filter(f=>selectedByProposal.get('iconv').some(g=>g.path===f.path)).map(f=>f.path).sort();
      terminal=true;
      return freeze({version:1,profile,status:'blocked',executionAuthority:false,productionAuthority:false,productionReady:false,
        baselineCount:825,baselineCategories:roles,baselineSha256:plan.baselineSha256,planSha256:hash(plan),proposalSha256:hash(proposals),
        unresolved:clone(plan.unresolved),unresolvedRecords:4736,unresolvedSha256:hash(plan.unresolved),
        inventoryUnresolved:clone(inventory.unresolved),inventoryUnresolvedRecords:inventory.unresolved.length,
        proposedPhysicalCount:null,conditionalArithmeticCount:arithmetic,incorporatedSourceOnly:sourceOnly,retainedPhysical:retained,
        retainedUnresolvedConditionalUnknown:uncertainPhysical,generatedPhysicalOutputs:plan.outputs.length,overlappingIncorporation:overlaps,
        overlappingProposalSelections:selectionOverlap,conflictingReplacements:[],graphCounts,
        manifestCeiling:64,countAboveCeilingUnderAssumptions:Math.max(0,arithmetic-64),ceilingMet:false,
        blockers:[...(arithmetic>64?['physical-manifest-ceiling']:[]),'combined-runtime-layout-unverified','computed-and-conditional-closure-unresolved','independent-execution-admission-missing'],
        assumptions:clone(plan.assumptions),limitations:['Arithmetic is a hypothetical file-set projection, not a validated reduced payload.',
          'Archived identities belong to historical objects. Compiler authenticity, mapped-image binding, owned-consumer integration and release policy remain unproven.'],
        selectionAndAdmissionChanged:false});
    }catch(e){return deny(e.reason??e.code??'plan-invalid-metadata');}
  }});
}
module.exports={createPlanAssessment,profile};

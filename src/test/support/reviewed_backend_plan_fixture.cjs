// Shared archival fixture construction only. Reads explicit successful records.
const fs=require('node:fs'),path=require('node:path');
const {generatedArtifactContentHash:hash}=require('../../../scripts/stage-backend.cjs');
const iconv=require('./iconv_artifact_metadata.cjs'),{specs}=require('./dependency_guard_descriptors.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
function loadReviewedPlan(archive){
  const read=(root,p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
  const baseline={manifest:read(archive.backend,'before/stage-manifest.json'),inventory:read(archive.backend,'before/inventory.json'),catalog:read(archive.backend,'before-byte-catalog.json'),provenance:read(archive.backend,'selected-provenance.json')};
  const capture=read(archive.express,'express-compiler-correspondence.json'),original=read(archive.original,'express-contract-summary.json');
  capture.sourceEdges=original.sourceEdges.map((e,occurrence)=>({occurrence,source:{root:'sources',path:e.source},line:e.line,kind:'require',specifier:e.specifier,
    target:e.resolution==='node-builtin'?'node:'+e.specifier.replace(/^node:/,''):e.resolvedPath?{root:'sources',path:e.resolvedPath}:null}));
  const ir={intent:read(archive.iconv,'compile-intent.json'),report:read(archive.iconv,'consolidation-report.json'),metafile:read(archive.iconv,'esbuild-metafile.json')};
  const iconvOutputs=[iconv.facade,iconv.bundle].map(p=>{const f=ir.report.sourceMap.find(f=>f.path===p);return {path:p,size:Number(f.copied.identity.size),sha256:f.copied.sha256,identity:f.copied.identity};});
  const proposals=[{kind:'express',record:capture,review:{recordSha256:hash(capture),outputs:[capture.actual.output]}},{kind:'iconv',record:ir,review:{recordSha256:hash(ir),outputs:iconvOutputs}}];
  const protectedPaths=new Set([...specs.filter(s=>s.target).map(s=>s.target),...iconv.unknown,...iconv.tables,...iconv.metadata]);
  const dispositions=baseline.provenance.files.map(file=>{
    const owners=[...(capture.actual.incorporated.includes(file.output)?['express']:[]),...(iconv.incorporated.includes(file.output)?['iconv']:[])].sort();
    return {path:file.output,role:file.status==='transpiled'?'compiled-application':file.output.startsWith('node_modules/')?'package':file.status==='generated-metadata'?'root-metadata':'asset-helper-native',file:clone(file),
      disposition:protectedPaths.has(file.output)?'conditional-computed-unresolved':owners.length?'incorporated-source-only':file.output.startsWith('node_modules/')?'external-unknown-retained':'retained',proposals:owners,provenanceRef:hash(file)};
  });
  const plan={version:1,scope:'entire-recorded-backend',baselineSha256:hash(baseline),unresolved:clone(baseline.manifest.unresolved),dispositions,
    outputs:proposals.flatMap(p=>p.review.outputs.map(file=>({proposal:p.kind,file}))),assumptions:['archival-bytes-not-live-admission','proposed-replacement-not-approved','runtime-resolution-not-closed','no-authoritative-selection-change']};
  return {baseline,proposals,plan};
}
module.exports={loadReviewedPlan};

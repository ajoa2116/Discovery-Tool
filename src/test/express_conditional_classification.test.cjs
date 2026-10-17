// Non-executing source/metadata contract. No vendor body, compiler or probe runs.
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {observeCatalogFiles}=require('../../scripts/payload-byte-catalog.cjs');
const evidence=process.env.DISCOVERY_EXPRESS_CONTRACT,repo=path.resolve(__dirname,'../..');
let stopped=false;
const cases=[
  ...['body-parser','express','finalhandler','send'].map(owner=>({
    root:`node_modules/${owner}/node_modules/debug`,name:'src/browser.js',version:'2.6.9',origin:'src/index.js',
    sha256:'0144ab6a52b9330c567de11a5c3a4aea35cdac47a4c106482aa24ae8054cdc6f',size:4734,
  })),
  {root:'node_modules/inherits',name:'inherits_browser.js',version:'2.0.4',origin:'inherits.js',
    sha256:'ad322a7b1dec60f3d2ebda2091816469efb55b567d241cf3cf0fa4c5a4afe500',size:753},
];
const run=(label,callback)=>test('Express static classification: '+label,{skip:!evidence},t=>{
  if(stopped){t.skip('Stopped after source/metadata mismatch; no retry.');return;}
  try{
    assert.ok(path.isAbsolute(evidence));assert.equal(fs.realpathSync(evidence),evidence);
    const report=JSON.parse(fs.readFileSync(evidence,'utf8'));assert.equal(report.version,'4.22.2');
    assert.equal(report.resources.cleanupConfirmed,true);callback(report);
  }catch(error){stopped=true;throw error;}
});
function source(report,name){
  const row=report.sourceProvenance.find(p=>p.path===name);assert.ok(row,'Missing source provenance: '+name);
  const measure=()=>observeCatalogFiles([{id:'repository',path:repo}],[{root:'repository',path:name}])[0];
  assert.deepEqual(measure(),row.source);
  const text=fs.readFileSync(path.join(repo,name),'utf8');assert.deepEqual(measure(),row.source);
  const tree=name.endsWith('.json')?ts.parseJsonText(name,text):ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  assert.equal(tree.parseDiagnostics.length,0);
  return {text,tree,measurement:row.source};
}
function calls(tree){const result=[];const visit=node=>{
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='require')result.push(node);
  ts.forEachChild(node,visit);
};visit(tree);return result;}
const compact=node=>node.getText().replace(/\s/g,'');
for(const c of cases)run(c.root+'/'+c.name,report=>{
  const name=c.root+'/'+c.name,origin=c.root+'/'+c.origin;
  const leaf=source(report,name),entry=source(report,origin),meta=source(report,c.root+'/package.json');
  assert.equal(leaf.measurement.sha256,c.sha256);assert.equal(leaf.measurement.size,c.size);
  const pkg=JSON.parse(meta.text),record=report.packageMetadata.find(p=>p.location===c.root);
  assert.equal(pkg.version,c.version);assert.equal(record.version,c.version);assert.equal(record.lock.version,c.version);
  assert.ok(report.retainedUnadmitted.includes(name));
  assert.ok(report.results.every(r=>r.phases.every(p=>!p.cache.includes(name))),'Prior controls did not load this conditional');
  const edges=report.sourceEdges.filter(e=>e.source===origin&&e.resolvedPath===name);assert.equal(edges.length,1);
  assert.equal(edges[0].specifier,c.name.startsWith('src/')?'./browser.js':'./inherits_browser.js');
  if(c.version==='2.6.9'){
    assert.equal(pkg.name,'debug');assert.equal(pkg.main,'./src/index.js');assert.equal(pkg.browser,'./src/browser.js');
    const branch=entry.tree.statements[0];assert.ok(ts.isIfStatement(branch));
    assert.equal(compact(branch.expression),"typeofprocess!=='undefined'&&process.type==='renderer'");
    assert.equal(calls(branch.thenStatement)[0].arguments[0].text,'./browser.js');
    assert.equal(calls(branch.elseStatement)[0].arguments[0].text,'./node.js');
    assert.deepEqual(calls(leaf.tree).map(n=>n.arguments[0].text),['./debug']);
    assert.ok(report.sourceEdges.some(e=>e.resolvedPath===origin&&e.specifier==='debug'));
  }else{
    assert.equal(pkg.name,'inherits');assert.equal(pkg.main,'./inherits.js');assert.equal(pkg.browser,'./inherits_browser.js');
    const attempt=entry.tree.statements[0];assert.ok(ts.isTryStatement(attempt));assert.ok(attempt.catchClause);
    assert.equal(calls(attempt.tryBlock)[0].arguments[0].text,'util');
    const guard=attempt.tryBlock.statements.find(ts.isIfStatement);assert.equal(compact(guard.expression),"typeofutil.inherits!=='function'");
    assert.ok(ts.isThrowStatement(guard.thenStatement));assert.equal(calls(attempt.catchClause)[0].arguments[0].text,'./inherits_browser.js');
    assert.equal(calls(leaf.tree).length,0);
    assert.ok(report.sourceEdges.some(e=>e.source==='node_modules/http-errors/index.js'&&e.resolvedPath===origin));
  }
});
run('computed view engine remains separate and unresolved',report=>{
  const view=source(report,'node_modules/express/lib/view.js');
  const computed=calls(view.tree).filter(n=>!ts.isStringLiteral(n.arguments[0]));assert.equal(computed.length,1);
  assert.equal(computed[0].arguments[0].getText(),'mod');
  assert.equal(view.tree.getLineAndCharacterOfPosition(computed[0].getStart()).line+1,81);
  assert.match(view.text,/var mod = this\.ext\.slice\(1\)/);assert.match(view.text,/if \(!opts\.engines\[this\.ext\]\)/);
  assert.match(view.text,/if \(!this\.ext && !this\.defaultEngine\)/);assert.match(view.text,/typeof fn !== 'function'/);
  assert.equal(report.sourceEdges.filter(e=>e.source==='node_modules/express/lib/view.js'&&e.specifier==='<computed>').length,1);
  assert.equal(report.results.find(r=>r.mode==='core').resolutions.filter(r=>r.computed).length,0);
  assert.equal(report.results.find(r=>r.mode==='computed').resolutions.filter(r=>r.computed).length,1);
  assert.equal(report.results.find(r=>r.mode==='missing').violations[0].reason,'missing-dependency');
  assert.equal(report.results.find(r=>r.mode==='unexpected').violations[0].reason,'unexpected-computed-import');
});
run('reviewed compiler options do not specialize runtime guards',report=>{
  const experiment=fs.readFileSync(path.join(__dirname,'express_consolidation.test.cjs'),'utf8');
  assert.ok(experiment.includes("'--platform=node'"));assert.ok(experiment.includes("'--target=node24'"));
  assert.ok(experiment.includes("'--tree-shaking=false'"));assert.ok(experiment.includes("'--external:iconv-lite'"));
  assert.equal(experiment.includes('--define:'),false);assert.equal(experiment.includes('--alias:'),false);
  assert.equal(report.sourceEdges.length,347);assert.equal(report.originalBackend.selected,825);assert.equal(report.originalBackend.unresolved,4736);
  assert.equal(report.productionAuthority,false);assert.equal(report.completeClosure,false);
});

// Artifact-only experiment. Never invokes a backend, helper, package script or installer.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { inventory } = require('./dependency-inventory.cjs');

const within = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
function noLinks(target) {
  for (let current = target; ; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Linked paths are unsupported.');
    if (path.dirname(current) === current) break;
  }
}
const outputPath = name => /\.mts$/i.test(name) ? name.slice(0, -4) + '.mjs' : /\.cts$/i.test(name) ? name.slice(0, -4) + '.cjs' : name.replace(/\.tsx?$/i, '.js');

function dependencyEvidence(metadata, name) {
  const declarations = ['dependencies', 'optionalDependencies', 'peerDependencies'].filter(field => Object.hasOwn(metadata?.[field] ?? {}, name))
    .map(field => ({ field, range: metadata[field][name] }));
  const peerOptional = metadata?.peerDependenciesMeta?.[name]?.optional === true;
  const optional = Object.hasOwn(metadata?.optionalDependencies ?? {}, name) ||
    (peerOptional && !Object.hasOwn(metadata?.dependencies ?? {}, name));
  return { declarations, peerOptional, requirement: !declarations.length ? 'unknown' : optional ? 'optional' : 'required' };
}

// Narrow, static WS fallback observation. Does not establish fallback behavior/safety.
function wsFallback(root, location, name) {
  const specs = { bufferutil: { file: 'lib/buffer-util.js', properties: ['mask', 'unmask'] },
    'utf-8-validate': { file: 'lib/validation.js', properties: ['isValidUTF8'] } };
  const spec = specs[name]; if (!spec) return [];
  const full = path.resolve(root, location, spec.file);
  try {
    if (!within(root, full)) return []; noLinks(full);
    if (fs.statSync(full).size > 1024 * 1024) return [];
    const tree = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (tree.parseDiagnostics.length) return [];
    const nodes = [], pending = [tree];
    while (pending.length) { const node = pending.pop(); nodes.push(node); ts.forEachChild(node, child => { pending.push(child); }); }
    if (nodes.some(node => (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) &&
      node.name && ts.isIdentifier(node.name) && ['require', 'module'].includes(node.name.text))) return [];
    const line = node => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
    const defaults = [];
    for (const statement of tree.statements) {
      if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) continue;
      const expression = statement.expression;
      if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken || expression.left.getText(tree) !== 'module.exports' || !ts.isObjectLiteralExpression(expression.right)) continue;
      for (const property of expression.right.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || !ts.isIdentifier(property.initializer)) continue;
        const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === property.initializer.text);
        if (spec.properties.includes(property.name.text) && fn?.body) defaults.push({ property: property.name.text, function: fn.name.text,
          exportLine: line(property), functionLine: line(fn), end: statement.end });
      }
    }
    const found = [];
    for (const node of nodes) {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'require' ||
        node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]) || node.arguments[0].text !== name) continue;
      let parent = node.parent, attempt;
      while (parent && !ts.isSourceFile(parent)) {
        if (ts.isFunctionLike(parent)) break;
        if (ts.isTryStatement(parent) && node.pos >= parent.tryBlock.pos && node.end <= parent.tryBlock.end) { attempt = parent; break; }
        parent = parent.parent;
      }
      if (!attempt?.catchClause || attempt.finallyBlock || attempt.catchClause.block.statements.length !== 0) continue;
      const baseline = defaults.filter(item => item.end < attempt.pos);
      if (!spec.properties.every(property => baseline.some(item => item.property === property))) continue;
      const guards = [];
      for (let ancestor = attempt.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent)
        if (ts.isIfStatement(ancestor)) guards.push({ line: line(ancestor), expression: ancestor.expression.getText(tree).slice(0, 200) });
      found.push({ source: path.relative(root, full).split(path.sep).join('/'), requireLine: line(node), catchLine: line(attempt.catchClause),
        observation: 'empty-catch-with-preexisting-function-exports', guards,
        defaults: baseline.map(({ end, ...item }) => item), runtimeVerified: false, safetyVerified: false });
    }
    return found;
  } catch { return []; }
}

function summarizeLoading(manifest, runtimeSources) {
  const selected = new Set(manifest.candidates.filter(c => c.status !== 'unselected-unresolved').map(c => c.source));
  const unselected = new Set(manifest.candidates.filter(c => c.status === 'unselected-unresolved').map(c => c.source));
  const packages = new Set(manifest.packages.map(p => p.path));
  const groups = { loadingReview: [], unselectedInventory: [], otherInventory: [] };
  for (const record of manifest.unresolved) {
    if (['unknown-reachability-not-excluded', 'type-only-ancestry-not-runtime-proof'].includes(record.reason)) groups.unselectedInventory.push(record);
    else if (runtimeSources.has(record.source) || selected.has(record.source) || packages.has(record.source) ||
      [...packages].some(p => record.source?.startsWith(p + ':')) || record.reason === 'entrypoint-not-inventoried') groups.loadingReview.push(record);
    else if (unselected.has(record.source)) groups.unselectedInventory.push(record);
    else groups.otherInventory.push(record);
  }
  const summary = records => {
    const byCause = {}; for (const record of records) byCause[record.reason] = (byCause[record.reason] ?? 0) + 1;
    return { count: records.length, byCause, records };
  };
  return { basis: 'static-review-priorities-not-runtime-verification',
    loadingReview: summary(groups.loadingReview), unselectedInventory: summary(groups.unselectedInventory), otherInventory: summary(groups.otherInventory),
    requiredUnresolvedDependencies: manifest.dependencies.filter(d => d.declaredRequirement === 'required' && d.classification === 'unresolved').map(d => d.parent + ':' + d.name),
    optionalWithObservedFallback: manifest.dependencies.filter(d => d.classification === 'optional-with-observed-fallback').map(d => d.parent + ':' + d.name),
    failedOutputs: manifest.candidates.filter(c => c.status === 'failed').map(c => c.source),
    pending: ['No approved/included Node runtime or runtime compatibility validation.',
      'Computed/conditional module loading and package export conditions remain unresolved.',
      'Native/.NET/WebView2 loading and OS/PowerShell helper resolution remain unverified.',
      'Optional metadata and static fallback observations do not prove safety, successful loading or complete closure.'] };
}

function stageBackend(root, out, options = {}) {
  root = path.resolve(root); out = path.resolve(out);
  // A fresh sibling/temporary directory only; never overwrite a checkout or prior stage.
  if (within(root, out) || within(out, root) || fs.existsSync(out)) throw Error('Stage must be a new directory outside the checkout.');
  noLinks(root); noLinks(path.dirname(out));
  noLinks(path.join(root, 'package-lock.json')); noLinks(path.join(root, 'package.json'));
  const entries = options.entrypoints ?? ['src/server/index.ts'];
  const report = inventory(root, { entrypoints: entries.map(name => ({ role: 'backend-stage', path: name })) });
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const records = new Map(), selectedPackages = new Map(), issues = [], dependencies = [];
  const runtimeSources = new Set(report.files.filter(file => file.annotation.reachability.evidence.some(e => e.dependencyUse === 'runtime-candidate')).map(file => file.path));
  const normalized = file => path.relative(root, file).split(path.sep).join('/');
  const lockPackages = Object.entries(lock.packages ?? {}).filter(([name]) => name.startsWith('node_modules/'));
  const owner = name => lockPackages.map(([p]) => p).filter(p => name.startsWith(p + '/')).sort((a, b) => b.length - a.length)[0];
  const issue = (source, reason) => issues.push({ source, reason });
  function select(name, reason) {
    const full = path.resolve(root, name);
    if (!within(root, full)) { issue(name, 'selection-outside-checkout'); return; }
    name = normalized(full);
    if (!records.has(name) && records.size >= 20000) { issue(name, 'staging-selection-file-limit'); return; }
    const record = records.get(name) ?? { source: name, selectionReasons: [], status: 'selected-candidate' };
    if (!record.selectionReasons.includes(reason)) record.selectionReasons.push(reason);
    records.set(name, record);
  }
  function directory(full, reason) {
    try {
      if (!within(root, full)) throw Error(); noLinks(full);
      for (const entry of fs.readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const child = path.join(full, entry.name);
        if (entry.isSymbolicLink()) { issue(normalized(child), 'linked-asset-not-staged'); continue; }
        if (entry.isDirectory()) directory(child, reason); else select(normalized(child), reason);
      }
    } catch { issue(normalized(full), 'asset-directory-unreadable-or-unsupported'); }
  }
  function packageCandidate(location, reason) {
    const existing = selectedPackages.get(location);
    if (existing) { if (!existing.selectionReasons.includes(reason)) existing.selectionReasons.push(reason); return; }
    const pkg = lock.packages?.[location];
    if (!pkg) { issue(location, 'package-not-in-lock'); return; }
    const record = { path: location, version: pkg.version ?? null, selectionReasons: [reason], status: 'candidate-not-verified' };
    selectedPackages.set(location, record);
    if (pkg.hasInstallScript) issue(location, 'installed-generated-inputs-not-verified');
    let installed;
    try {
      const full = path.join(root, location, 'package.json'); noLinks(full);
      installed = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (installed.version !== pkg.version) issue(location, 'installed-version-differs-from-lock');
    } catch { issue(location, 'installed-package-metadata-unavailable'); }
    // Copy inventoried package files, including assets/metadata. Membership is not reachability proof.
    for (const file of report.files) if (owner(file.path) === location) select(file.path, 'member-of-selected-lock-package:' + location);
    select(location + '/package.json', 'selected-package-resolution-metadata');
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies,
      ...installed?.dependencies, ...installed?.optionalDependencies, ...installed?.peerDependencies };
    for (const name of Object.keys(deps).sort()) {
      let parent = location, resolved;
      for (;;) {
        const candidate = (parent ? parent + '/' : '') + 'node_modules/' + name;
        if (lock.packages?.[candidate]) { resolved = candidate; break; }
        if (!parent) break;
        const index = parent.lastIndexOf('/node_modules/'); parent = index < 0 ? '' : parent.slice(0, index);
      }
      const lockEvidence = dependencyEvidence(pkg, name), packageEvidence = dependencyEvidence(installed, name);
      const consistent = lockEvidence.requirement === packageEvidence.requirement && lockEvidence.requirement !== 'unknown' &&
        JSON.stringify(lockEvidence.declarations) === JSON.stringify(packageEvidence.declarations) && installed?.version === pkg.version;
      const fallback = installed?.name === 'ws' && lockEvidence.requirement === 'optional' ? wsFallback(root, location, name) : [];
      const declaredRequirement = consistent ? lockEvidence.requirement : 'conflicting-or-unknown';
      dependencies.push({ parent: location, name, declaredRequirement,
        classification: consistent && declaredRequirement === 'required' && resolved ? 'required' :
          consistent && declaredRequirement === 'optional' && fallback.length ? 'optional-with-observed-fallback' : 'unresolved',
        resolution: resolved ? { status: 'lock-candidate', path: resolved } : { status: 'missing-from-lock' },
        evidence: { lockfile: { source: 'package-lock.json', packageLocation: location, version: pkg.version ?? null,
          integrity: pkg.integrity ?? null, ...lockEvidence },
          package: { source: location + '/package.json', name: installed?.name ?? null, version: installed?.version ?? null, ...packageEvidence } }, fallback,
        runtimeVerified: false, safetyVerified: false });
      if (!consistent) issue(location + ':' + name, 'dependency-metadata-inconsistent-or-unavailable');
      if (declaredRequirement === 'optional' && !fallback.length) issue(location + ':' + name, 'optional-dependency-fallback-not-established');
      if (resolved) packageCandidate(resolved, 'lock-dependency-of:' + location);
      else issue(location + ':' + name, 'dependency-resolution-missing-from-lock');
    }
  }
  for (const file of report.files) {
    if (!runtimeSources.has(file.path)) continue;
    if (file.path.startsWith('node_modules/')) {
      const location = owner(file.path);
      if (location) packageCandidate(location, 'observed-backend-reference');
      else issue(file.path, 'observed-package-input-not-in-lock');
    } else select(file.path, 'observed-backend-reference');
  }
  // Existing inventory cannot resolve directory URL references; retain its flag and stage explicit candidates.
  for (const ref of report.references) {
    if (ref.kind !== 'module-url' || !runtimeSources.has(ref.source) || !ref.specifier.startsWith('.')) continue;
    const full = path.resolve(root, path.dirname(ref.source), ref.specifier);
    try {
      if (!within(root, full)) throw Error(); noLinks(full);
      if (fs.statSync(full).isDirectory()) directory(full, 'observed-module-url-directory:' + ref.source);
      else {
        select(normalized(full), 'observed-module-url:' + ref.source);
        if (/\.(exe|node)$/i.test(full)) {
          directory(path.dirname(full), 'native-host-neighbor-candidates:' + ref.source);
          issue(normalized(full), 'native-host-loading-closure-unverified');
        }
      }
    } catch { issue(normalized(full), 'module-url-selection-unresolved'); }
  }
  // Every inventoried candidate remains visible, including unselected type-only/unknown inputs.
  for (const file of report.files) {
    if (records.has(file.path)) continue;
    const reason = file.annotation.reachability.status === 'unknown' ? 'unknown-reachability-not-excluded' : 'type-only-ancestry-not-runtime-proof';
    records.set(file.path, { source: file.path, status: 'unselected-unresolved', selectionReasons: [reason] });
    issue(file.path, reason);
  }
  const manifest = {
    schemaVersion: 1, purpose: 'isolated-backend-staging', informationalOnly: true,
    productionAuthority: false, completeClosure: false, runtimeValidated: false,
    compiler: { name: 'typescript', version: ts.version, typeChecked: false },
    runtime: { included: false, approved: false }, entrypoints: report.entrypoints,
    limits: [...report.limits, ...report.annotationLimits,
      'Transpilation is not type checking or runtime validation; emitted layout/import behavior needs later isolated validation.',
      'Selected package membership, lock records and native neighboring files are candidates, not integrity or loading verification.',
      'No runtime executable is packaged. No inspected code, helper, backend, install script or package lifecycle command is executed.',
      'Inventory bounds and incomplete native/asset analysis can leave additional files unresolved. Unknown candidates are not excluded.',
      'Inputs may change while read; this staging output has no signed approval, immutable loading or provenance guarantee.'],
    bounds: { selectedFileLimit: 20000, perFileBytes: 128 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 },
    packages: [...selectedPackages.values()], dependencies, candidates: [...records.values()],
    unresolved: [...report.unresolved, ...report.annotationIssues, ...issues],
  };
  fs.mkdirSync(out); // Exclusive: parent exists, stage itself must not exist.
  const destinations = new Map();
  let copiedBytes = 0;
  for (const record of manifest.candidates) {
    if (record.status !== 'selected-candidate' || record.source === 'package.json') continue;
    const projectTs = !record.source.startsWith('node_modules/') && /\.(tsx?|mts|cts)$/i.test(record.source) && !/\.d\.(ts|mts|cts)$/i.test(record.source);
    record.output = projectTs ? outputPath(record.source) : record.source;
    if (['inventory.json', 'stage-manifest.json'].includes(record.output)) {
      record.status = 'failed'; manifest.unresolved.push({ source: record.source, reason: 'reserved-output-path' }); continue;
    }
    if (destinations.has(record.output)) {
      record.status = 'failed'; manifest.unresolved.push({ source: record.source, reason: 'output-path-collision' }); continue;
    }
    destinations.set(record.output, record.source);
    try {
      const source = path.resolve(root, record.source), target = path.resolve(out, record.output);
      if (!within(root, source) || !within(out, target)) throw Error(); noLinks(source); noLinks(path.dirname(target));
      const bytes = fs.statSync(source).size;
      if (bytes > manifest.bounds.perFileBytes || copiedBytes + bytes > manifest.bounds.totalBytes) {
        record.status = 'failed'; manifest.unresolved.push({ source: record.source, reason: 'staging-byte-limit' }); continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (projectTs) {
        const result = ts.transpileModule(fs.readFileSync(source, 'utf8'), { fileName: source, reportDiagnostics: true,
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: /\.cts$/i.test(source) ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX, rewriteRelativeImportExtensions: true } });
        if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw Error();
        fs.writeFileSync(target, result.outputText, { flag: 'wx' }); record.status = 'transpiled';
      } else { fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); record.status = 'copied-candidate'; }
      copiedBytes += bytes;
    } catch { record.status = 'failed'; manifest.unresolved.push({ source: record.source, reason: 'copy-or-transpile-failed' }); }
  }
  // Minimal ESM boundary; no npm scripts, launcher or project startup configuration is copied.
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: 'isolated-backend-stage', private: true, type: 'module', version: sourcePackage.version ?? '0.0.0' }, null, 2) + '\n', { flag: 'wx' });
  const rootRecord = records.get('package.json');
  if (rootRecord) { rootRecord.status = 'generated-metadata'; rootRecord.output = 'package.json'; rootRecord.selectionReasons.push('minimal-esm-boundary-no-startup-scripts'); }
  manifest.status = manifest.candidates.some(r => r.status === 'failed') ? 'partial-with-failures' : 'staged-with-unresolved-inputs';
  manifest.candidates.sort((a, b) => a.source.localeCompare(b.source));
  manifest.loadingSummary = summarizeLoading(manifest, runtimeSources);
  fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(out, 'stage-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}
// Pure, opt-in fixture descriptions. No compiler invocation, copying, default
// selection change or authority follows from constructing these records.
function generatedArtifactContentHash(content) {
  const json=JSON.stringify(content);
  if(!json||Buffer.byteLength(json)>32*1024*1024)throw Error('Generated metadata limit.');
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  return require('node:crypto').createHash('sha256').update(JSON.stringify(canonical(JSON.parse(json)))).digest('hex');
}
function createGeneratedArtifactRecord(content, observations,variant='synthetic-generated-v1') {
  if(!['synthetic-generated-v1','iconv-esbuild-0.28.2-v1'].includes(variant))throw Error('Unknown generated-artifact profile.');
  return JSON.parse(JSON.stringify({version:1,purpose:variant==='synthetic-generated-v1'?'synthetic-generated-artifact':'fixture-generated-artifact',productionAuthority:false,completeClosure:false,
    content,contentSha256:generatedArtifactContentHash(content),observations}));
}
function createGeneratedArtifactManifest(base, record) {
  if(base.generatedArtifact||!Array.isArray(base.candidates)||!Array.isArray(base.unresolved)||!Array.isArray(record?.content?.outputs))
    throw Error('Generated manifest shape.');
  const result=JSON.parse(JSON.stringify(base)), destinations=new Set();
  for(const c of result.candidates)if(c.output){const key=c.output.normalize('NFC').toLowerCase();if(destinations.has(key))throw Error('Output collision.');destinations.add(key);}
  for(const output of record.content.outputs){
    if(typeof output.path!=='string')throw Error('Generated output path.');
    const key=output.path.normalize('NFC').toLowerCase();if(destinations.has(key))throw Error('Output collision.');destinations.add(key);
    result.candidates.push({source:null,output:output.path,status:'generated-artifact',role:output.role,
      provenanceRef:record.contentSha256,selectionReasons:['explicit-synthetic-generated-output']});
  }
  result.generatedArtifact=JSON.parse(JSON.stringify(record));
  result.informationalOnly=true;result.productionAuthority=false;result.completeClosure=false;result.runtimeValidated=false;
  return result;
}
// Explicit fixture-only metadata entry. Default staging never calls this.
function normalizeDependencyGuardDescriptors(input,check) {
  try{return require('../src/test/support/dependency_guard_descriptors.cjs').normalize(input,check);}
  catch(error){
    if(error.code==='GENERATED_ARTIFACT_DENIED')throw error;
    if(check)return check(false,'guard-invalid-metadata');
    throw Object.assign(Error('guard-invalid-metadata'),{code:'GENERATED_ARTIFACT_DENIED',reason:'guard-invalid-metadata'});
  }
}
function normalizeDependencyGuardCompilerCorrespondence(input,check) {
  try{return require('../src/test/support/dependency_guard_descriptors.cjs').normalizeCompilerCorrespondence(input,check);}
  catch(error){
    if(error.code==='GENERATED_ARTIFACT_DENIED')throw error;
    if(check)return check(false,'compiler-guard-invalid-metadata');
    throw Object.assign(Error('compiler-guard-invalid-metadata'),{code:'GENERATED_ARTIFACT_DENIED',reason:'compiler-guard-invalid-metadata'});
  }
}
module.exports = { stageBackend, generatedArtifactContentHash, createGeneratedArtifactRecord, createGeneratedArtifactManifest, normalizeDependencyGuardDescriptors, normalizeDependencyGuardCompilerCorrespondence };
if (require.main === module) {
  try {
    const args = process.argv.slice(2); let root = path.resolve(__dirname, '..'), out; const entrypoints = [];
    while (args.length) {
      const arg = args.shift();
      if (arg === '--out') out = args.shift();
      else if (arg === '--entry') entrypoints.push(args.shift());
      else if (arg === '--root') root = args.shift();
      else throw Error();
    }
    if (!out) throw Error();
    const result = stageBackend(root, out, entrypoints.length ? { entrypoints } : {});
    console.log(JSON.stringify({ status: result.status, productionAuthority: false, unresolved: result.unresolved.length }));
  } catch { console.error('Staging unavailable. Use --out NEW_EXTERNAL_DIRECTORY [--root CHECKOUT] [--entry RELATIVE_PATH ...].'); process.exitCode = 1; }
}

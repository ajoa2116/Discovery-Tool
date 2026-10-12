// Informational static inventory only. Never loads inspected modules or starts processes.
const fs = require('node:fs');
const path = require('node:path');
const { isBuiltin, createRequire } = require('node:module');
const ts = require('typescript');

const CHILD_METHODS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork', 'exec', 'execSync']);
const childModule = value => value === 'child_process' || value === 'node:child_process';

// Resolve local lexical symbols only. No inspected imports are loaded by the checker.
function childProcessBindings(tree) {
  const host = { getSourceFile: name => name === tree.fileName ? tree : undefined,
    getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: name => name === tree.fileName, readFile: () => undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n' };
  const checker = ts.createProgram([tree.fileName], { noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.Latest }, host).getTypeChecker();
  const written = new Set(), pending = [tree];
  function invalidate(node) {
    if (ts.isIdentifier(node)) { const symbol = checker.getSymbolAtLocation(node); if (symbol) written.add(symbol); }
    else if (ts.isParenthesizedExpression(node) || ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) invalidate(node.expression);
    else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) invalidate(node.expression);
    else if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) ts.forEachChild(node, invalidate);
    else if (ts.isPropertyAssignment(node)) invalidate(node.initializer);
    else if (ts.isShorthandPropertyAssignment(node)) {
      const symbol = checker.getShorthandAssignmentValueSymbol(node); if (symbol) written.add(symbol);
    }
  }
  while (pending.length) {
    const node = pending.pop();
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) invalidate(node.left);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) invalidate(node.operand);
    if (ts.isDeleteExpression(node)) invalidate(node.expression);
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) invalidate(node.initializer);
    ts.forEachChild(node, child => { pending.push(child); });
  }
  const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  function value(node, visiting = new Set(), depth = 0) {
    if (!node || depth > 32) return null;
    const string = literal(node); if (string !== null) return { kind: 'string', value: string };
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return value(node.expression, visiting, depth + 1);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = value(node.left, visiting, depth + 1), right = value(node.right, visiting, depth + 1);
      if (left?.kind === 'string' && right?.kind === 'string' && left.value.length + right.value.length <= 4096) return { kind: 'string', value: left.value + right.value };
      return null;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      // JS binding creates a synthetic CommonJS require symbol without declarations.
      const requireSymbol = checker.getSymbolAtLocation(node.expression);
      if (!requireSymbol?.declarations?.length && !written.has(requireSymbol) && childModule(literal(node.arguments[0]))) return { kind: 'module' };
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const base = value(node.expression, visiting, depth + 1);
      const member = ts.isPropertyAccessExpression(node) ? node.name.text : literal(node.argumentExpression);
      if (base?.kind === 'module' && CHILD_METHODS.has(member)) return { kind: 'method', method: member };
      return null;
    }
    if (!ts.isIdentifier(node)) return null;
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || written.has(symbol) || visiting.has(symbol)) return null;
    const next = new Set(visiting); next.add(symbol);
    for (const decl of symbol.declarations ?? []) {
      if (ts.isImportSpecifier(decl)) {
        const clause = decl.parent.parent;
        if (!decl.isTypeOnly && !clause.isTypeOnly && childModule(literal(clause.parent.moduleSpecifier))) {
          const method = (decl.propertyName ?? decl.name).text;
          if (CHILD_METHODS.has(method)) return { kind: 'method', method };
        }
      } else if (ts.isNamespaceImport(decl) || ts.isImportClause(decl)) {
        const clause = ts.isNamespaceImport(decl) ? decl.parent : decl;
        if (!clause.isTypeOnly && childModule(literal(clause.parent.moduleSpecifier))) return { kind: 'module' };
      } else if (ts.isVariableDeclaration(decl)) {
        const result = value(decl.initializer, next, depth + 1);
        if (result?.kind === 'string' && !(decl.parent.flags & ts.NodeFlags.Const)) return null;
        if (result) return result;
      } else if (ts.isBindingElement(decl) && ts.isObjectBindingPattern(decl.parent) && ts.isVariableDeclaration(decl.parent.parent)) {
        const declaration = decl.parent.parent;
        const base = value(declaration.initializer, next, depth + 1);
        const member = decl.propertyName ? (ts.isIdentifier(decl.propertyName) ? decl.propertyName.text : literal(decl.propertyName)) : decl.name.text;
        if (!decl.dotDotDotToken && base?.kind === 'module' && CHILD_METHODS.has(member)) return { kind: 'method', method: member };
      }
    }
    return null;
  }
  // Keep alias-named calls visible even when the current lexical binding is shadowed.
  const aliasHints = new Set(), declarations = [tree];
  while (declarations.length) {
    const node = declarations.pop(); let method;
    if (ts.isImportSpecifier(node) && childModule(literal(node.parent.parent.parent.moduleSpecifier))) {
      const name = (node.propertyName ?? node.name).text;
      if (CHILD_METHODS.has(name)) aliasHints.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) method = value(node.initializer);
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && ts.isObjectBindingPattern(node.parent) && ts.isVariableDeclaration(node.parent.parent)) {
      const base = value(node.parent.parent.initializer);
      const member = node.propertyName ? (ts.isIdentifier(node.propertyName) ? node.propertyName.text : literal(node.propertyName)) : node.name.text;
      if (base?.kind === 'module' && CHILD_METHODS.has(member)) method = { kind: 'method' };
    }
    if (method?.kind === 'method') aliasHints.add(node.name.text);
    ts.forEachChild(node, child => { declarations.push(child); });
  }
  return call => {
    const bound = value(call.expression);
    const argument = value(call.arguments[0]);
    return { aliasHint: ts.isIdentifier(call.expression) && aliasHints.has(call.expression.text),
      binding: bound?.kind === 'method' ? { status: 'confirmed', module: 'node:child_process', method: bound.method } : { status: 'ambiguous' },
      executableArgument: argument?.kind === 'string' ? { status: 'constant', value: argument.value } : { status: 'computed' } };
  };
}

// Declared analysis roots, not detected execution or production authorization.
const DEFAULT_ENTRYPOINTS = [
  { role: 'production-backend', path: 'scripts/start-production.cjs' },
  { role: 'production-backend', path: 'src/server/index.ts' },
  { role: 'production-frontend', path: 'src/main.tsx' },
  { role: 'build', path: 'scripts/build-identity.cjs' },
  { role: 'development', path: 'scripts/dependency-inventory.cjs' },
  { role: 'test', path: 'scripts/smoke-production.cjs' },
  { role: 'test', path: 'scripts/run-receive-matrix.ts' },
  { role: 'test', path: 'scripts/receive-dotnet-control.ps1' },
];

function annotateReachability(report, entrypoints = DEFAULT_ENTRYPOINTS) {
  const byPath = new Map(report.files.map(file => [file.path, file]));
  const edges = new Map();
  for (const ref of report.references) {
    if (ref.resolution !== 'local-candidate' || !ref.resolvedPath || !byPath.has(ref.resolvedPath)) continue;
    const list = edges.get(ref.source) ?? []; list.push(ref); edges.set(ref.source, list);
  }
  const evidence = new Map();
  const roots = new Map();
  for (const entry of entrypoints) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.role !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(entry.role)) throw new TypeError('Invalid entrypoint declaration.');
    const normalized = path.posix.normalize(entry.path.replaceAll('\\', '/'));
    if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized) || normalized.includes(':')) throw new TypeError('Entrypoints must be root-relative.');
    roots.set(entry.role + ':' + normalized, { role: entry.role, path: normalized });
  }
  const annotationIssues = [];
  for (const [id, entry] of roots) {
    if (!byPath.has(entry.path)) {
      annotationIssues.push({ entrypoint: id, reason: 'entrypoint-not-inventoried', status: 'unknown' }); continue;
    }
    const seen = new Set(), pending = [{ path: entry.path, dependencyUse: 'runtime-candidate', via: 'entrypoint' }];
    while (pending.length) {
      const current = pending.pop();
      const key = current.path + ':' + current.dependencyUse;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = evidence.get(current.path) ?? [];
      list.push({ entrypoint: id, role: entry.role, dependencyUse: current.dependencyUse, via: current.via,
        ...(current.from ? { from: current.from, line: current.line } : {}) });
      evidence.set(current.path, list);
      // Sorting makes the representative evidence path deterministic in cycles/diamonds.
      for (const ref of [...(edges.get(current.path) ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) {
        pending.push({ path: ref.resolvedPath, dependencyUse: current.dependencyUse === 'type-only' || ref.typeOnly ? 'type-only' : 'runtime-candidate',
          via: ref.kind, from: current.path, line: ref.line });
      }
    }
  }
  function annotation(name) {
    const observed = [...(evidence.get(name) ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { provisional: true, roles: [...new Set(observed.map(item => item.role))].sort(),
      reachability: { status: observed.length ? 'observed' : 'unknown', basis: 'static-reference-paths-not-execution', evidence: observed } };
  }
  return { ...report,
    entrypoints: [...roots.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    annotationIssues,
    annotationLimits: [
      'Roles come only from explicitly declared roots and resolved reference paths; mixed roles are allowed.',
      'Observed means a static candidate reference path, not execution, runtime loading or complete reachability.',
      'Dynamic imports/module URLs can be conditional or refer to data; CommonJS resolution remains a hint.',
      'Type-only paths are recorded separately and are not runtime execution evidence.',
      'No path observed means unknown, never excluded; filenames and package installation do not establish roles.',
      'Entrypoints absent from the candidate inventory remain unknown; annotation does not expand the existing scan.',
      'No shell-command, computed subprocess, native project or metadata-to-code edges are invented.',
    ],
    files: report.files.map(file => ({ ...file, annotation: annotation(file.path) })),
    references: report.references.map(ref => ({ ...ref, sourceAnnotation: annotation(ref.source) })),
    unresolved: report.unresolved.map(flag => ({ ...flag, sourceAnnotation: annotation(flag.source) })),
  };
}

function inventory(root = path.resolve(__dirname, '..'), options = {}) {
  root = path.resolve(root);
  const maxFiles = options.maxFiles ?? 20000;
  const maxTextBytes = options.maxTextBytes ?? 2 * 1024 * 1024;
  const files = new Map(), references = [], unresolved = [], packages = [];
  const scanned = new Set();
  const limits = [
    'Static candidate inventory, not verification, attestation, approval or a complete execution closure.',
    'Scans src (excluding tests), scripts, native and installed non-dev lockfile package directories; candidates may be unreachable.',
    'No inspected module, package script, native binary or subprocess is executed. No downloads or installs.',
    'Package resolution uses Node CommonJS resolution as a hint; ESM conditions, custom loaders and target runtime may differ.',
    'Computed imports, aliases/wrappers, eval, generated code and runtime configuration can hide additional inputs.',
    'Native analysis is heuristic; DLL/.NET/WebView2/system runtime loading and subprocess arguments are not fully resolved.',
    'Files may change during inspection; no hashes, signatures, provenance, ACL or race protections are verified.',
    'Current Node executable is diagnostic only; no production runtime version or digest is approved.',
    'Child-process confirmation is lexical import/require provenance, not executed behavior. Indirect mutation, module monkey-patching, eval, wrappers and inter-file aliases remain unverified; exec/execSync arguments are shell command text, not verified executable paths.',
  ];
  const rel = p => path.relative(root, p).split(path.sep).join('/');
  const inside = p => { const r = path.relative(root, p); return r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
  const issue = (source, kind, reason, line) => unresolved.push({ source, kind, reason, ...(line ? { line } : {}) });
  function safe(p) {
    if (!inside(p)) return false;
    for (let current = p; current !== root; current = path.dirname(current)) {
      if (fs.lstatSync(current).isSymbolicLink()) return false;
    }
    return !fs.lstatSync(root).isSymbolicLink();
  }
  function add(p, scope) {
    const name = rel(p);
    if (files.has(name)) return true;
    if (files.size >= maxFiles) { issue(name, 'scan', 'file-limit'); return false; }
    try {
      if (!safe(p)) { issue(name, 'scan', 'external-or-symlink'); return false; }
      const stat = fs.statSync(p);
      if (!stat.isFile()) return false;
      const ext = path.extname(p).toLowerCase();
      const kind = /\.(exe|dll|node)$/.test(ext) ? 'native-asset' : ext === '.wasm' ? 'wasm-asset' :
        /\.(ps1|cmd|bat|sh)$/.test(ext) ? 'subprocess-script' : /\.(ts|tsx|js|jsx|cjs|mjs|cs)$/.test(ext) ? 'code' : 'metadata-or-data';
      files.set(name, { path: name, kind, scope, bytes: stat.size }); return true;
    } catch { issue(name, 'scan', 'missing-or-unreadable'); return false; }
  }
  function walk(p, scope) {
    try {
      if (!safe(p)) { issue(rel(p), 'scan', 'external-or-symlink'); return; }
      for (const entry of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (files.size >= maxFiles) { issue(rel(p), 'scan', 'file-limit'); return; }
        const child = path.join(p, entry.name);
        if (entry.isSymbolicLink()) { issue(rel(child), 'scan', 'symlink-not-followed'); continue; }
        if (entry.isDirectory()) {
          if (['test', 'tests', 'obj', '.git', 'node_modules'].includes(entry.name.toLowerCase())) continue;
          walk(child, scope);
        } else add(child, scope);
      }
    } catch { issue(rel(p), 'scan', 'missing-or-unreadable'); }
  }
  function json(p) {
    try {
      if (!safe(p) || fs.statSync(p).size > maxTextBytes) throw Error();
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { issue(rel(p), 'metadata', 'missing-unreadable-or-invalid'); return null; }
  }
  for (const dir of ['src', 'scripts', 'native']) walk(path.join(root, dir), 'project-candidate');
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json']) add(path.join(root, name), 'resolution-metadata');
  const manifest = json(path.join(root, 'package.json'));
  const lock = json(path.join(root, 'package-lock.json'));
  if (!lock?.packages) issue('package-lock.json', 'closure', 'lockfile-packages-unavailable');
  for (const [location, pkg] of Object.entries(lock?.packages ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!location || pkg.dev) continue;
    if (!location.startsWith('node_modules/') || location.includes('..') || path.isAbsolute(location)) {
      issue('package-lock.json', 'package', 'unsupported-package-location'); continue;
    }
    packages.push({ path: location, version: pkg.version ?? null, optional: Boolean(pkg.optional), hasInstallScript: Boolean(pkg.hasInstallScript) });
    if (pkg.hasInstallScript) issue(location, 'package', 'install-script-generated-inputs-not-verified');
    walk(path.resolve(root, location), 'runtime-package-candidate');
  }
  for (const name of Object.keys(manifest?.dependencies ?? {}).sort()) {
    if (!packages.some(p => p.path === 'node_modules/' + name)) issue('package.json', 'package', 'direct-dependency-missing-from-lock: ' + name);
  }
  function resolveFile(base) {
    for (const candidate of [base, ...['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json'].map(e => base + e),
      ...['index.ts', 'index.tsx', 'index.js'].map(n => path.join(base, n))]) {
      try { if (safe(candidate) && fs.statSync(candidate).isFile()) return candidate; } catch { /* try next */ }
    }
    return null;
  }
  function reference(source, line, kind, specifier, typeOnly = false) {
    const record = { source: rel(source), line, kind, specifier: specifier ?? '<computed>', typeOnly };
    references.push(record);
    if (specifier === null) { issue(record.source, kind, 'computed-input', line); return; }
    if (kind === 'subprocess' || kind === 'native-library') {
      issue(record.source, kind, 'executable-or-library-search-and-arguments-not-resolved', line); return;
    }
    if (kind === 'file-input') {
      issue(record.source, kind, 'file-input-base-and-runtime-value-not-resolved', line); return;
    }
    if (isBuiltin(specifier)) { record.resolution = 'node-builtin'; return; }
    let resolved = null;
    if (specifier.startsWith('.') || path.isAbsolute(specifier)) resolved = resolveFile(path.resolve(path.dirname(source), specifier));
    else if (kind === 'module-url') { issue(record.source, kind, 'non-relative-url', line); return; }
    else {
      try { resolved = createRequire(source).resolve(specifier); } catch { /* reported below */ }
      issue(record.source, kind, 'package-conditions-and-runtime-resolution-unverified', line);
    }
    if (!resolved) { issue(record.source, kind, 'path-not-resolved', line); return; }
    if (!inside(resolved)) { issue(record.source, kind, 'resolved-outside-inventory-root', line); return; }
    record.resolvedPath = rel(resolved);
    if (add(resolved, typeOnly ? 'type-only-reference' : 'referenced-candidate')) record.resolution = 'local-candidate';
  }
  for (const [name, info] of files) {
    if (scanned.has(name)) continue;
    scanned.add(name);
    const full = path.join(root, name);
    if (!/\.(tsx?|jsx?|cjs|mjs|cs|csproj|ps1)$/i.test(name)) continue;
    if (info.bytes > maxTextBytes) { issue(name, 'analysis', 'text-size-limit'); continue; }
    let text;
    try { if (!safe(full)) throw Error(); text = fs.readFileSync(full, 'utf8'); } catch { issue(name, 'analysis', 'unreadable'); continue; }
    if (/\.(cs|csproj|ps1)$/i.test(name)) {
      for (const match of text.matchAll(/\bDllImport\(\s*"([^"]+)"/g)) reference(full, text.slice(0, match.index).split('\n').length, 'native-library', match[1]);
      for (const match of text.matchAll(/<(PackageReference|ProjectReference)\s+Include="([^"]+)"/g)) {
        references.push({ source: name, kind: 'native-project-reference', specifier: match[2] });
        issue(name, 'native-project-reference', 'restore-and-framework-closure-unverified');
      }
      if (/Process(StartInfo|\.Start)|CreateProcess|Start-Process|Invoke-Expression|\&\s*\$/.test(text)) issue(name, 'native-or-script-subprocess', 'heuristic-callsite-needs-manual-review');
      continue;
    }
    let tree;
    try {
      tree = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, /\.tsx$/i.test(name) ? ts.ScriptKind.TSX : /\.jsx$/i.test(name) ? ts.ScriptKind.JSX : /\.(js|cjs|mjs)$/i.test(name) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    } catch { issue(name, 'analysis', 'parser-failure-partial-analysis'); continue; }
    if (tree.parseDiagnostics.length) issue(name, 'analysis', 'parse-diagnostics-partial-analysis');
    let childCalls;
    try { childCalls = childProcessBindings(tree); }
    catch { issue(name, 'analysis', 'binding-analysis-failed'); childCalls = () => ({ binding: { status: 'ambiguous' }, executableArgument: { status: 'computed' } }); }
    const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
    const pending = [tree];
    while (pending.length) {
      const node = pending.pop();
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        reference(full, line, 'static-import', literal(node.moduleSpecifier), Boolean(node.isTypeOnly || node.importClause?.isTypeOnly));
      }
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const name = ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text : '';
        const childCall = childCalls(node);
        if (expression.kind === ts.SyntaxKind.ImportKeyword) reference(full, line, 'dynamic-import', literal(node.arguments[0]));
        else if (childCall.binding.status === 'confirmed' || childCall.aliasHint || CHILD_METHODS.has(name)) {
          reference(full, line, 'subprocess', literal(node.arguments[0]));
          Object.assign(references[references.length - 1], { childProcessBinding: childCall.binding,
            executableArgument: childCall.executableArgument,
            argumentMeaning: ['exec', 'execSync'].includes(childCall.binding.method ?? name) ? 'shell-command-text' : childCall.binding.method === 'fork' ? 'module-input' : 'executable-candidate' });
          if (childCall.binding.status !== 'confirmed') issue(rel(full), 'subprocess', 'ambiguous-child-process-binding', line);
        }
        else if (name === 'require') reference(full, line, 'require', literal(node.arguments[0]));
        else if (['readFile', 'readFileSync', 'createReadStream', 'open', 'openSync', 'readFileAsync'].includes(name)) reference(full, line, 'file-input', literal(node.arguments[0]));
        else if (['eval', 'runInContext', 'runInNewContext', 'compileFunction'].includes(name)) issue(rel(full), 'generated-code', 'runtime-code-not-analyzed', line);
      }
      if (ts.isNewExpression(node)) {
        const name = ts.isIdentifier(node.expression) ? node.expression.text : '';
        if (name === 'URL') {
          const base = node.arguments?.[1];
          if (base && ts.isPropertyAccessExpression(base) && base.name.text === 'url' && ts.isMetaProperty(base.expression)) reference(full, line, 'module-url', literal(node.arguments?.[0]));
          else issue(rel(full), 'url-input', 'url-base-not-analyzed', line);
        }
        if (['Worker', 'Function'].includes(name)) issue(rel(full), 'runtime-code', 'worker-or-generated-code-needs-manual-review', line);
      }
      ts.forEachChild(node, child => { pending.push(child); });
    }
  }
  const sort = items => items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return annotateReachability({
    schemaVersion: 1, informationalOnly: true, productionAuthority: false, completeVerification: false,
    runtime: { executable: process.execPath, version: process.version, approved: false },
    entryCandidates: ['scripts/start-production.cjs', 'src/server/index.ts'],
    limits, bounds: { maxFiles, maxTextBytes },
    files: sort([...files.values()]), packages: sort(packages), references: sort(references),
    unresolved: sort([...new Map(unresolved.map(x => [JSON.stringify(x), x])).values()]),
  }, options.entrypoints ?? DEFAULT_ENTRYPOINTS);
}
module.exports = { inventory, annotateReachability, DEFAULT_ENTRYPOINTS };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), entries = []; let root;
    while (args.length) {
      const arg = args.shift();
      if (arg === '--entry') {
        const value = args.shift(); const colon = value?.indexOf(':') ?? -1;
        if (colon <= 0) throw Error();
        entries.push({ role: value.slice(0, colon), path: value.slice(colon + 1) });
      } else if (root === undefined && !arg.startsWith('--')) root = arg;
      else throw Error();
    }
    process.stdout.write(JSON.stringify(inventory(root, entries.length ? { entrypoints: entries } : {}), null, 2) + '\n');
  } catch { console.error('Inventory unavailable. Usage: node scripts/dependency-inventory.cjs [root] [--entry role:relative-path ...]'); process.exitCode = 1; }
}

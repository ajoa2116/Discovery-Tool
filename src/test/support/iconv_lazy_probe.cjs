// Read-only encoding fixture. No backend, HTTP request, provider or vendor edit.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { createRequire, registerHooks, syncBuiltinESMExports } = require('node:module');

const javascript = [
  'lib/index.js', 'lib/bom-handling.js', 'lib/streams.js', 'lib/extend-node.js',
  'encodings/index.js', 'encodings/internal.js', 'encodings/utf16.js', 'encodings/utf7.js',
  'encodings/sbcs-codec.js', 'encodings/sbcs-data.js', 'encodings/sbcs-data-generated.js',
  'encodings/dbcs-codec.js', 'encodings/dbcs-data.js',
].map(name => 'node_modules/iconv-lite/' + name).concat('node_modules/safer-buffer/safer.js');
const tables = ['shiftjis', 'eucjp', 'cp936', 'gbk-added', 'gb18030-ranges', 'cp949', 'cp950', 'big5-added']
  .map(name => 'node_modules/iconv-lite/encodings/tables/' + name + '.json');
const metadata = ['node_modules/iconv-lite/package.json', 'node_modules/safer-buffer/package.json'];
const modes = ['ordinary', 'single-byte', 'shiftjis', 'eucjp', 'gb18030', 'korean', 'big5', 'unicode', 'unsupported'];
const reviews = [...javascript, ...tables, ...metadata].map(path => ({ path,
  reason: 'Explicit harmless iconv lookup fixture review; literal modules/tables and resolution metadata only, no production authority.' }));
module.exports = { javascript, tables, metadata, modes, reviews };
let failureEvidence;

async function main() {
  const [configPath, mode] = process.argv.slice(2);
  assert.ok(modes.includes(mode));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  // Variant changes are explicit fixture admission/expectations, never inferred
  // from observed loads. Original physical topology remains a strict regression.
  const bundle = 'node_modules/iconv-lite/encodings/consolidated.cjs';
  if (config.consolidation !== undefined) assert.equal(config.consolidation, 'external-tables-cjs-facade-v1');
  const activeJavascript = config.consolidation ? ['node_modules/iconv-lite/lib/index.js', bundle, 'node_modules/safer-buffer/safer.js'] : javascript;
  const variant = config.consolidation ? 'consolidated' : 'original';
  const activeReviews = [...activeJavascript,...tables,...metadata].map(path => ({path,reason:'Exact fixture-only compile experiment input; no production authority.'}));
  const root = fs.realpathSync(__dirname);
  assert.equal(root, config.stage);
  const { buildPackageAdmission, installPackageAdmissionHooks } = require(path.join(path.dirname(configPath), 'review.cjs'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'stage-manifest.json'), 'utf8'));
  const admission = buildPackageAdmission(manifest, activeReviews);
  assert.equal(admission.admitted.length, activeReviews.length);
  assert.ok(activeReviews.every(r => admission.admitted.some(a => a.path === r.path)));
  assert.equal(admission.productionAuthority, false);
  assert.equal(process.permission.has('fs.write'), false);
  assert.equal(process.permission.has('child'), false);
  assert.equal(process.permission.has('addons'), false);
  assert.equal(process.permission.has('worker'), false);
  for (const key of ['NODE_OPTIONS','NODE_PATH','NODE_PRELOAD','NODE_LOADER','TSX_TSCONFIG_PATH','ESBUILD_BINARY_PATH'])
    assert.equal(process.env[key], undefined);
  assert.ok(!process.execArgv.some(arg => /^--(?:import|require|loader)(?:=|$)/.test(arg)));
  const violations = [], resolutions = [], loads = [], checks = [], phases = [];
  const behavior = {vectors:[],aliases:[],bom:null,unsupported:[],streaming:[]};
  let phase = 'entry';
  const fail = label => { violations.push({ phase, label }); throw Object.assign(Error(label), { code: 'ICONV_FIXTURE_DENIED' }); };
  const block = (object, keys, label) => { for (const key of keys) object[key] = () => fail(label + '.' + key); };
  // Same restrictive operation families as the existing staged probe. These are
  // fixture guards, not an adversarial-JavaScript sandbox or release authority.
  block(require('node:child_process'), ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'], 'child');
  const net = require('node:net'); block(net, ['connect','createConnection','createServer'], 'net');
  block(net.Socket.prototype, ['connect'], 'socket'); block(net.Server.prototype, ['listen'], 'server');
  for (const name of ['http','https']) block(require('node:' + name), ['request','get','createServer'], name);
  block(require('node:tls'), ['connect','createServer'], 'tls'); block(require('node:dgram'), ['createSocket'], 'dgram');
  block(require('node:os'), ['networkInterfaces'], 'os');
  block(require('node:timers'), ['setTimeout','setInterval','setImmediate'], 'timers');
  block(require('node:timers/promises'), ['setTimeout','setInterval','setImmediate'], 'timer-promises');
  block(globalThis, ['setTimeout','setInterval','setImmediate','fetch','WebSocket','EventSource'], 'global');
  syncBuiltinESMExports();
  const files = new Map(config.files.map(f => [f.path, f]));
  assert.equal(files.size,config.files.length,'Duplicate provenance paths denied.');
  const measured = new Set();
  function selected(url) {
    const full = fileURLToPath(url), name = path.relative(root, full).split(path.sep).join('/');
    if (!activeJavascript.includes(name) && !tables.includes(name) && !metadata.includes(name)) fail('unreviewed-module:' + name);
    if (fs.realpathSync(full) !== full) fail('redirected-module');
    const expected = files.get(name); if (!expected) fail('missing-byte-provenance');
    const fd = fs.openSync(full, 'r');
    try {
      const before = fs.fstatSync(fd, { bigint: true }), bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true });
      const same = stat => ['dev','ino','size','mtimeNs','ctimeNs'].every(k => String(stat[k]) === expected.identity[k]);
      if (!same(before) || !same(after) || before.nlink !== 1n ||
          crypto.createHash('sha256').update(bytes).digest('hex') !== expected.sha256) fail('changed-module:' + name);
      measured.add(name);
    } finally { fs.closeSync(fd); }
    return name;
  }
  registerHooks({
    resolve(specifier, context, next) {
      try {
        const result = next(specifier, context);
        if (result.url.startsWith('node:')) {
          if (context.parentURL?.includes('/node_modules/') && !['node:buffer','node:stream','node:string_decoder'].includes(result.url)) fail('unexpected-vendor-builtin:' + result.url);
        } else selected(result.url);
        if (config.consolidation && context.parentURL?.includes('/node_modules/')) {
          const from = path.relative(root,fileURLToPath(context.parentURL)).split(path.sep).join('/');
          const to = result.url.startsWith('node:') ? result.url : path.relative(root,fileURLToPath(result.url)).split(path.sep).join('/');
          if (!config.runtimeEdges?.some(e=>e.from===from&&e.specifier===specifier&&e.to===to)) fail('unreviewed-transformed-edge:'+from+':'+specifier);
        }
        resolutions.push({ phase, specifier, parentURL: context.parentURL ?? null, url: result.url }); return result;
      } catch (error) {
        if (error.code !== 'ICONV_FIXTURE_DENIED') violations.push({ phase, label: 'resolution-error', code: error.code, message: error.message });
        throw error;
      }
    },
    load(url, context, next) {
      try {
        if (!url.startsWith('node:')) loads.push({ phase, path: selected(url) });
        return next(url, context);
      } catch(error) {
        if(error.code!=='ICONV_FIXTURE_DENIED') violations.push({phase,label:'load-error',code:error.code,message:error.message});
        throw error;
      }
    },
  });
  installPackageAdmissionHooks(root, admission);
  // Metadata checks are fixture byte observations, not module-load events or
  // a claim that Node exposes every internal package.json read to these hooks.
  const packageMetadata = metadata.map(name=>{
    const url=pathToFileURL(path.join(root,name)).href;selected(url);
    const data=JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));selected(url);
    assert.equal(data.version,name.includes('/iconv-lite/')?'0.4.24':'2.1.2');
    assert.equal(data.main,name.includes('/iconv-lite/')?'./lib/index.js':'safer.js');
    return {path:name,data};
  });
  const check = (name, run) => { run(); checks.push(name); };
  const cache = () => Object.keys(require.cache).filter(full => full.startsWith(root + path.sep + 'node_modules' + path.sep))
    .map(full => path.relative(root, full).split(path.sep).join('/')).sort();
  const snapshot = (name, iconv) => phases.push({ phase: name, loaded: cache(), registryDeferred:iconv.encodings===null,codecCache: Object.keys(iconv._codecDataCache).sort() });
  assert.deepEqual(cache(), []);
  const primitives = [Buffer.from, Buffer.prototype.toString, Buffer.prototype.write, Buffer.isEncoding];
  const iconv = require('iconv-lite');
  failureEvidence = () => ({passed:false,mode,phase,checks,phases,resolutions,loads,measured:[...measured].sort(),
    loaded:cache(),encodingsNull:iconv.encodings===null,codecNames:Object.keys(iconv._codecDataCache).sort(),violations,
    productionAuthority:false,completeClosure:false});
  check('entry-has-no-lazy-registry-or-tables', () => {
    assert.equal(iconv.encodings, null);assert.deepEqual(Object.keys(iconv._codecDataCache),[]);
    assert.deepEqual(cache().filter(p=>p.includes('/tables/')),[]);
    if(variant==='original') {
      assert.deepEqual(cache().filter(p => p.includes('/encodings/')), []);
      assert.deepEqual(cache(), javascript.filter(p => p.includes('/lib/') || p.endsWith('/safer.js')).sort());
    } else assert.deepEqual(cache(),[...activeJavascript].sort());
  });
  snapshot('entry', iconv);
  const firstEntry = require.cache[require.resolve('iconv-lite')];
  const firstCodecCache=iconv._codecDataCache, firstEncode=iconv.encode, firstGetCodec=iconv.getCodec;
  const firstModules=new Map(cache().map(p=>[p,require.cache[path.join(root,p)]]));
  check('repeated-entry-and-module-identity',()=>{
    assert.equal(require.resolve('iconv-lite'),path.join(root,'node_modules/iconv-lite/lib/index.js'));
    assert.equal(firstEntry.exports,iconv);assert.equal(require('iconv-lite'),iconv);
    assert.equal(require.cache[require.resolve('iconv-lite')],firstEntry);
    for(const name of ['iconv-lite','safer-buffer'])assert.equal(require.resolve(name+'/package.json'),path.join(root,'node_modules',name,'package.json'));
  });
  phase = 'consumer-resolution';
  const consumers = ['node_modules/body-parser/lib/read.js', 'node_modules/raw-body/index.js'];
  for (const consumer of consumers) {
    const from = createRequire(path.join(root, consumer));
    check('consumer-reuses-entry:' + consumer, () => assert.equal(from('iconv-lite'), iconv));
  }
  phase = 'esm-interop';
  const esm = await import('iconv-lite');
  check('esm-and-commonjs-reuse-exact-module', () => {
    assert.equal(esm.default, iconv); assert.equal(require('iconv-lite'), iconv);
    assert.equal(require.cache[require.resolve('iconv-lite')], firstEntry);
  });
  snapshot('interop', iconv);
  check('interop-does-not-initialize-registry',()=>{
    assert.equal(iconv.encodings,null);assert.deepEqual(Object.keys(iconv._codecDataCache),[]);
    assert.deepEqual(cache(),phases[0].loaded);
  });
  function vector(name, text, hex) {
    phase = name;
    const encoded = iconv.encode(text, name);
    check('known-vector:' + name, () => {
      assert.equal(iconv.encodingExists(name),true);
      assert.equal(encoded.toString('hex'), hex); assert.equal(iconv.decode(Buffer.from(hex, 'hex'), name), text);
      const decoder = iconv.getDecoder(name), middle = Math.max(1, Math.floor(encoded.length / 2));
      const split=decoder.write(encoded.subarray(0, middle)) + decoder.write(encoded.subarray(middle)) + (decoder.end() || '');
      assert.equal(split,text);
      behavior.vectors.push({name,text,encoded:encoded.toString('hex'),decoded:iconv.decode(encoded,name),split,exists:iconv.encodingExists(name)});
    });
    snapshot(name, iconv);
  }
  function aliases(primary, names) {
    phase = 'aliases:' + primary; const before = cache(), codec = iconv.getCodec(primary);
    for (const alias of names) check('alias:' + alias, () => {
      assert.equal(iconv.getCodec(alias), codec);assert.equal(iconv.encodingExists(alias),true);
      behavior.aliases.push({primary,alias,sameCodec:iconv.getCodec(alias)===codec});
    });
    check('alias-cache-adds-no-files:' + primary, () => assert.deepEqual(cache(), before)); snapshot(phase, iconv);
  }
  switch (mode) {
    case 'ordinary':
      vector('utf-8', 'A€', '41e282ac'); aliases('utf8', ['UTF_8','unicode11utf8','UTF-8:2004']);
      vector('utf-16le', 'A€', '4100ac20'); aliases('ucs2', ['utf16le','ucs-2']);
      check('BOM-options', () => {
        assert.equal(iconv.encode('A','utf8',{addBOM:true}).toString('hex'), 'efbbbf41');
        assert.equal(iconv.decode(Buffer.from('efbbbf41','hex'),'utf8'), 'A');
        assert.equal(iconv.decode(Buffer.from('efbbbf41','hex'),'utf8',{stripBOM:false}), '\ufeffA');
        behavior.bom={encoded:iconv.encode('A','utf8',{addBOM:true}).toString('hex'),
          stripped:iconv.decode(Buffer.from('efbbbf41','hex'),'utf8'),retained:iconv.decode(Buffer.from('efbbbf41','hex'),'utf8',{stripBOM:false})};
      }); break;
    case 'single-byte': vector('windows-1252', '€', '80'); aliases('windows1252',['cp1252','win1252']); vector('latin1','é','e9'); break;
    case 'shiftjis': vector('shift_jis','あ','82a0'); aliases('shiftjis',['SJIS','cp932','windows31j']); break;
    case 'eucjp': vector('euc-jp','あ','a4a2'); break;
    case 'gb18030': vector('gb18030','中','d6d0'); aliases('gb18030',['chinese']); vector('gbk','中','d6d0'); vector('gb2312','中','d6d0'); break;
    case 'korean': vector('euc-kr','가','b0a1'); aliases('cp949',['korean','windows949']); break;
    case 'big5': vector('big5','中','a4a4'); aliases('big5hkscs',['big5','cnbig5']); vector('cp950','中','a4a4'); break;
    case 'unicode':
      vector('utf-16be','A€','004120ac'); vector('utf-7','£','2b414b4d2d'); vector('utf-7-imap','£','26414b4d2d');
      vector('cesu8','😀','eda0bdedb880');
      check('utf16-BOM-detection', () => assert.equal(iconv.decode(Buffer.from('feff0041','hex'),'utf-16'),'A')); break;
    case 'unsupported':
      for (const encoding of ['not-an-encoding','utf-32','../tables/shiftjis.json']) {
        phase = 'unsupported:' + encoding;
        check(phase, () => {
          assert.equal(iconv.encodingExists(encoding),false);
          let observed;
          assert.throws(()=>iconv.getDecoder(encoding),error=>{
            assert.equal(error.name,'Error');assert.match(error.message,/^Encoding not recognized:/);observed={name:error.name,message:error.message};return true;
          });
          behavior.unsupported.push({encoding,exists:false,error:observed});
          assert.deepEqual(violations,[],'Library return values cannot conceal a security violation.');
        });
      } snapshot('unsupported',iconv); break;
  }
  // Exercise real Transform APIs as well as the incremental decoder controls.
  // Await both readable end and writable finish; do not leave stream work live.
  async function transform(stream,chunks) {
    const output=[];
    await new Promise((resolve,reject)=>{
      let ended=false,finished=false,closed=false;
      const done=()=>{if(ended&&finished&&closed)resolve();};
      stream.on('data',chunk=>output.push(chunk));stream.once('error',reject);
      stream.once('end',()=>{ended=true;done();});stream.once('finish',()=>{finished=true;done();});
      stream.once('close',()=>{closed=true;done();});
      for(const chunk of chunks)stream.write(chunk);stream.end();
    });
    return output;
  }
  for(const v of behavior.vectors) {
    phase='streams:'+v.name;
    const middle=Math.max(1,Math.floor(v.text.length/2)), bytes=Buffer.from(v.encoded,'hex'), split=Math.max(1,Math.floor(bytes.length/2));
    const encoded=Buffer.concat(await transform(iconv.encodeStream(v.name),[v.text.slice(0,middle),v.text.slice(middle)])).toString('hex');
    const decoded=(await transform(iconv.decodeStream(v.name),[bytes.subarray(0,split),bytes.subarray(split)])).join('');
    check('transform-streams:'+v.name,()=>{assert.equal(encoded,v.encoded);assert.equal(decoded,v.text);});
    behavior.streaming.push({name:v.name,encoded,decoded,readableEnded:true,writableFinished:true,closed:true});
  }
  check('stable-exports-cache-and-entry-after-controls',()=>{
    assert.equal(require('iconv-lite'),iconv);assert.equal(require.cache[require.resolve('iconv-lite')],firstEntry);
    assert.equal(iconv._codecDataCache,firstCodecCache);assert.equal(iconv.encode,firstEncode);assert.equal(iconv.getCodec,firstGetCodec);
    for(const [name,module] of firstModules)assert.equal(require.cache[path.join(root,name)],module);
  });
  phase = 'repeat-cache'; const filesBeforeRepeat = cache(), codecNames = Object.keys(iconv._codecDataCache);
  for (const name of codecNames) assert.equal(iconv.getCodec(name), iconv.getCodec(name));
  check('repeat-cache-adds-no-files', () => assert.deepEqual(cache(),filesBeforeRepeat));
  check('no-primitive-extension-or-swallowed-load-denial', () => {
    assert.deepEqual([Buffer.from,Buffer.prototype.toString,Buffer.prototype.write,Buffer.isEncoding],primitives);
    assert.equal(iconv.supportsNodeEncodingsExtension,false); assert.deepEqual(violations,[]);
  });
  const expectedTables = { ordinary:[], 'single-byte':[], shiftjis:['shiftjis'], eucjp:['eucjp'],
    gb18030:['cp936','gbk-added','gb18030-ranges'], korean:['cp949'], big5:['cp950','big5-added'], unicode:[], unsupported:[] };
  check('exact-case-registry-and-table-loads', () => {
    assert.deepEqual(cache().filter(p => p.includes('/tables/')), expectedTables[mode].map(t=>'node_modules/iconv-lite/encodings/tables/'+t+'.json').sort());
    assert.ok(activeJavascript.every(p=>cache().includes(p)));
    assert.ok(cache().every(p=>activeJavascript.includes(p)||tables.includes(p)));
    assert.deepEqual(loads.filter(l=>l.path.includes('/tables/')).map(l=>l.path).sort(),cache().filter(p=>p.includes('/tables/')));
  });
  const describe=value=>typeof value==='function'?{kind:'function'}:Array.isArray(value)?value.map(describe):
    value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,describe(value[k])])):value;
  process.stdout.write(JSON.stringify({passed:true,variant,mode,checks,phases,resolutions,loads,measured:[...measured].sort(),behavior,packageMetadata,
    registry:describe(iconv.encodings),exportsShape:Object.keys(iconv).sort(),
    loaded:cache(),codecNames:Object.keys(iconv._codecDataCache).sort(),registryNames:Object.keys(iconv.encodings).sort(),violations,
    runtime:{node:process.version,architecture:process.arch,platform:process.platform},productionAuthority:false,
    completeClosure:false,scope:'library-controls-not-backend-execution',streamsExecuted:behavior.streaming.length>0,legacyPrimitiveExtensionExecuted:false}));
}
if (require.main === module) main().catch(error => {
  if (failureEvidence) process.stdout.write(JSON.stringify({...failureEvidence(),error:{name:error.name,message:error.message,code:error.code}}));
  console.error(error.stack); process.exitCode = 1;
});

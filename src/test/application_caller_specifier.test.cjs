// Pure path assertions, no inspected module or resolver executes.
const assert=require('node:assert/strict'),{test}=require('node:test');
const {relativeSpecifier}=require('./support/application_caller_mapping.cjs');
const target='src/shared/.consolidation/address-identity.generated.js';
test('dot-prefixed directory requires explicit ESM relative prefix',()=>{
  assert.equal(relativeSpecifier('src/shared/camera_access.js',target),'./.consolidation/address-identity.generated.js');
  assert.equal(relativeSpecifier('src/shared/network_match.js',target),'./.consolidation/address-identity.generated.js');
});
test('parent-relative backend mappings preserve canonical paths',()=>{
  assert.equal(relativeSpecifier('src/server/backend_application.js',target),'../shared/.consolidation/address-identity.generated.js');
  assert.equal(relativeSpecifier('src/core/network/pair_service.js',target),'../../shared/.consolidation/address-identity.generated.js');
});
test('encoded, redirected, absolute and noncanonical target requests deny',()=>{
  for(const invalid of ['src/shared/../other.js','src//other.js','/src/other.js','C:/other.js','src\\other.js',target+'?x',target+'#x','src/%2e/other.js'])
    assert.throws(()=>relativeSpecifier('src/shared/camera_access.js',invalid),e=>e.reason==='caller-target-ambiguity');
});

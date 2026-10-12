# Non-authorizing staged-payload byte catalog

`node scripts/payload-byte-catalog.cjs create CONFIG.json EXTERNAL_CATALOG.json`

`node scripts/payload-byte-catalog.cjs verify CONFIG.json EXTERNAL_CATALOG.json`

Creation writes a new file outside every cataloged payload root, never overwriting one. Verification only reads. Neither command imports payload code, launches helpers, signs a manifest or changes startup/security gates. JSON inputs/output are capped at 32 MiB.

Configuration explicitly names roots and an existing staging manifest:

```json
{
  "roots": [{"id":"stage","path":"C:/explicit/staged-payload"}],
  "staging": {"root":"stage","manifestFile":"C:/explicit/stage-manifest.json"},
  "overlays": [
    {"root":"stage","path":"src/server/backend_application.js","reason":"Current explicit compilation overlay","replacesStaged":true},
    {"root":"stage","path":"node-owner-bridge.node","reason":"Explicit addon build output"}
  ],
  "externalUnresolved": [{"source":"Windows/CLR/provider dependencies","reason":"Runtime closure unverified"}]
}
```

Each directory root covers **all regular files** beneath it, including metadata files: every file must have a successful staging selection or an explicit overlay. Unexpected files cause rejection rather than implicit selection. The staging root receives all recorded successful outputs using their original relative layout. Include staging metadata/result files as explicit overlays if they reside inside that root. Other nonoverlapping roots use explicit overlays for every included file. A replacement overlay must opt in with `replacesStaged`; both original selection and overlay evidence are retained. Repeated selections/overlays, case aliases and overlapping roots are denied. Source/evidence metadata is recorded, not authenticated.

A root may instead name one regular file, such as an explicitly selected `node.exe`. Its catalog entry uses that file's basename. Siblings and external dependencies are not scanned or verified; enumerate them separately or retain them as unresolved. Entire filesystem/Windows/system parent directories cannot be roots. No automatic system-directory discovery occurs.

The API exports `createCatalog(options)` (using `staging.manifest` as an already parsed object) and `verifyCatalog(catalog, roots)`. Canonical paths are relative, slash-separated NFC paths with Windows-safe components; traversal, ADS, absolute/alternate-separator paths, reserved names and trailing-dot/space aliases are rejected. Ancestor links/junctions, observed realpath escapes, hard links, nonregular inputs and mutation detected during hashing are denied. Verification compares the complete scoped file set and each length/SHA-256. It does not authenticate the catalog itself: changing both catalog and payload is outside this byte-correspondence claim.

Limits are 16 explicit roots, 20,000 files, 128 MiB per file, 256 MiB total bytes and 40,000 visited filesystem entries. These informational catalog bounds are separate from the unchanged **64-file signed fixture manifest**. Unknown/failed staging candidates, original unresolved records and caller-declared external gaps stay in separate unresolved sections. `productionAuthority`, `completeClosure` and `runtimeVerified` always remain false, even when bytes match.

Filesystem checks do not establish protected installation, complete Windows reparse/provider semantics, mapped-code integrity, ancestor-race freedom or complete runtime/dependency closure. This tool is not production release verification or authorization.

Focused checks: `node --test src/test/payload_byte_catalog.test.cjs`.

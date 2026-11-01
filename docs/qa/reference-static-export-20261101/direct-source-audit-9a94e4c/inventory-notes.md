# Direct static export inventory

Result: **PASS**. Read-only inspection; no browser, network, build or application edits.

- Application SHA declared by manifest: `9a94e4cfc5a043726f643d3a9c546f096007bd94` (matches expected).
- Exporter SHA declared by manifest: `281b85d6bf80eb9f564af987a1fd21b8fbcd1318` (matches expected).
- 82/82 manifest entries match the exported files by SHA256 and byte size.
- 83 regular files total: 82 listed files plus the manifest itself.
- 79/79 copied public assets match the supplied immutable build by SHA256 and byte size; no build public files are missing.
- All 6 JavaScript and 2 CSS files are byte-identical to the supplied original public build.
- 3 captured HTML route files are additional to public assets.
- No server/API/node_modules/environment/DB/config/source/key paths, symlinks or special files were found.
- Approved image matches the export, build, repository source and manifest: `0df3c229a570bc1b6f4fb6a0130e818ec68d4f921d98c065035542636d169cc9`.

Limits and remaining checks:

- Application/exporter SHAs are verified against the manifest values, not rebuilt here. Parent handles protected-source verification.
- This audit does not execute the app or infer absence of payment/API strings from the static file list. Dormant SDK/provider code can remain in client bundles.
- Parent handles CSP and HTTP behavior. The manifest requires hosting at the origin root with directory-index support; file:// and subpath hosting are unsupported.
- The exported public inventory also retains unused legacy images/models. They are static copied assets; this audit makes no claim that every asset is requested by the reference storefront.

Full file-by-file evidence: [inventory.json](inventory.json).

@govtechsg/jsonld
=========

Fork of https://github.com/digitalbazaar/jsonld.js

# Installation

```
npm install @govtechsg/jsonld
```

# Why forking?

The initial library uses an ESM only library which breaks in almost all our libraries:
- `open-attestation` requires a specific [mock for tests](https://github.com/Open-Attestation/open-attestation/blob/master/__mocks__/%40digitalbazaar/http-client.js). Same in other libraries.
- `open-attestation-cli` can't use [pkg](https://github.com/vercel/pkg), we had to [customise the build step](https://github.com/Open-Attestation/open-attestation-cli/pull/152).
- we faced another issue when using next.js + serverless build.
- there are probably more

Additional reads:
- https://github.com/digitalbazaar/jsonld.js/issues/451
- https://github.com/Nebulis/tech-stuff/issues/2

# Additional information

- the build is broken as it is broken on the original repository
- we plan to reuse back `jsonld` as soon as it's possible, i.e. when all the tooling works correctly
- we replaced `@digitalbazaar/http-client` by `cross-fetch`

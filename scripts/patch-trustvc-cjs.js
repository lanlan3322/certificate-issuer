const fs = require("fs");
const path = require("path");

function replaceOnce(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes(search)) {
    if (source.includes(replacement)) {
      return false;
    }
    console.warn(`Patch target not found in ${filePath}; skipping obsolete TrustVC patch.`);
    return false;
  }
  fs.writeFileSync(filePath, source.replace(search, replacement));
  return true;
}

function replaceEvery(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes(search)) {
    if (source.includes(replacement)) {
      return false;
    }
    console.warn(`Patch target not found in ${filePath}; skipping obsolete TrustVC patch.`);
    return false;
  }
  fs.writeFileSync(filePath, source.split(search).join(replacement));
  return true;
}

const root = process.cwd();
const w3cVcPath = path.join(
  root,
  "node_modules/@trustvc/w3c-vc/dist/lib/w3c-vc.js"
);
const w3cVcTypesPath = path.join(
  root,
  "node_modules/@trustvc/w3c-vc/dist/lib/types.js"
);
const w3cVcPresentationPath = path.join(
  root,
  "node_modules/@trustvc/w3c-vc/dist/lib/presentation/index.js"
);
const w3cIssuerEcdsaPath = path.join(
  root,
  "node_modules/@trustvc/w3c-issuer/dist/did-web/keyPair/ecdsaSd2023.js"
);
const w3cIssuerBbsPath = path.join(
  root,
  "node_modules/@trustvc/w3c-issuer/dist/did-web/keyPair/bbs2023.js"
);

if (fs.existsSync(w3cVcPath)) {
  replaceOnce(
    w3cVcPath,
    `var EcdsaMultikey = require('@digitalbazaar/ecdsa-multikey');
var ecdsaSd2023Cryptosuite = require('@digitalbazaar/ecdsa-sd-2023-cryptosuite');`,
    `var EcdsaMultikey;
var ecdsaSd2023Cryptosuite;`
  );
  replaceOnce(
    w3cVcPath,
    `var Bls12381Multikey = require('@digitalbazaar/bls12-381-multikey');
var bbs2023Cryptosuite = require('@digitalbazaar/bbs-2023-cryptosuite');`,
    `var Bls12381Multikey;
var bbs2023Cryptosuite;`
  );
  replaceOnce(
    w3cVcPath,
    `var dataIntegrity = require('@digitalbazaar/data-integrity');`,
    `var dataIntegrity;`
  );
  replaceOnce(
    w3cVcPath,
    `var EcdsaMultikey__namespace = /*#__PURE__*/_interopNamespace(EcdsaMultikey);
var ecdsaSd2023Cryptosuite__namespace = /*#__PURE__*/_interopNamespace(ecdsaSd2023Cryptosuite);
var Bls12381Multikey__namespace = /*#__PURE__*/_interopNamespace(Bls12381Multikey);
var bbs2023Cryptosuite__namespace = /*#__PURE__*/_interopNamespace(bbs2023Cryptosuite);`,
    `const loadEcdsaMultikey = async () => EcdsaMultikey ?? (EcdsaMultikey = _interopNamespace(await import('@digitalbazaar/ecdsa-multikey')));
const loadEcdsaSd2023Cryptosuite = async () => ecdsaSd2023Cryptosuite ?? (ecdsaSd2023Cryptosuite = _interopNamespace(await import('@digitalbazaar/ecdsa-sd-2023-cryptosuite')));
const loadBls12381Multikey = async () => Bls12381Multikey ?? (Bls12381Multikey = _interopNamespace(await import('@digitalbazaar/bls12-381-multikey')));
const loadBbs2023Cryptosuite = async () => bbs2023Cryptosuite ?? (bbs2023Cryptosuite = _interopNamespace(await import('@digitalbazaar/bbs-2023-cryptosuite')));`
  );
  replaceOnce(
    w3cVcPath,
    `const { createSignCryptosuite: createEcdsaSd2023SignCryptosuite, createDiscloseCryptosuite: createEcdsaSd2023DiscloseCryptosuite, createVerifyCryptosuite: createEcdsaSd2023VerifyCryptosuite } = ecdsaSd2023Cryptosuite__namespace;
const { createSignCryptosuite: createBbs2023SignCryptosuite, createDiscloseCryptosuite: createBbs2023DiscloseCryptosuite, createVerifyCryptosuite: createBbs2023VerifyCryptosuite } = bbs2023Cryptosuite__namespace;`,
    `const loadDataIntegrity = async () => dataIntegrity ?? (dataIntegrity = await import('@digitalbazaar/data-integrity'));`
  );
  replaceOnce(
    w3cVcPath,
    `      const keyPairInstance = cryptoSuite === "ecdsa-sd-2023" ? await EcdsaMultikey__namespace.from({
        ...keyPair
      }) : await Bls12381Multikey__namespace.from({
        ...keyPair
      });`,
    `      const keyPairInstance = cryptoSuite === "ecdsa-sd-2023" ? await (await loadEcdsaMultikey()).from({
        ...keyPair
      }) : await (await loadBls12381Multikey()).from({
        ...keyPair
      });`
  );
  replaceOnce(
    w3cVcPath,
    `      const cryptosuiteInstance = cryptoSuite === "ecdsa-sd-2023" ? createEcdsaSd2023SignCryptosuite({
        mandatoryPointers
      }) : createBbs2023SignCryptosuite({
        mandatoryPointers
      });`,
    `      const cryptosuiteInstance = cryptoSuite === "ecdsa-sd-2023" ? (await loadEcdsaSd2023Cryptosuite()).createSignCryptosuite({
        mandatoryPointers
      }) : (await loadBbs2023Cryptosuite()).createSignCryptosuite({
        mandatoryPointers
      });`
  );
  replaceOnce(
    w3cVcPath,
    `          const verifyCryptosuite = cryptosuite === "ecdsa-sd-2023" ? createEcdsaSd2023VerifyCryptosuite() : createBbs2023VerifyCryptosuite();`,
    `          const verifyCryptosuite = cryptosuite === "ecdsa-sd-2023" ? (await loadEcdsaSd2023Cryptosuite()).createVerifyCryptosuite() : (await loadBbs2023Cryptosuite()).createVerifyCryptosuite();`
  );
  replaceOnce(
    w3cVcPath,
    `        const cryptosuiteInstance = cryptosuite === "ecdsa-sd-2023" ? createEcdsaSd2023DiscloseCryptosuite({
          selectivePointers
        }) : createBbs2023DiscloseCryptosuite({
          selectivePointers
        });`,
    `        const cryptosuiteInstance = cryptosuite === "ecdsa-sd-2023" ? (await loadEcdsaSd2023Cryptosuite()).createDiscloseCryptosuite({
          selectivePointers
        }) : (await loadBbs2023Cryptosuite()).createDiscloseCryptosuite({
          selectivePointers
        });`
  );
  replaceEvery(
    w3cVcPath,
    `new dataIntegrity.DataIntegrityProof({`,
    `new (await loadDataIntegrity()).DataIntegrityProof({`
  );
}

if (fs.existsSync(w3cVcTypesPath)) {
  replaceOnce(
    w3cVcTypesPath,
    `var dataIntegrity = require('@digitalbazaar/data-integrity');
`,
    ``
  );
  replaceOnce(
    w3cVcTypesPath,
    `  DataIntegrityProof: dataIntegrity.DataIntegrityProof`,
    `  DataIntegrityProof: true`
  );
}

if (fs.existsSync(w3cVcPresentationPath)) {
  replaceOnce(
    w3cVcPresentationPath,
    `var EcdsaMultikey = require('@digitalbazaar/ecdsa-multikey');
var ecdsaRdfc2019Cryptosuite = require('@digitalbazaar/ecdsa-rdfc-2019-cryptosuite');
var dataIntegrity = require('@digitalbazaar/data-integrity');`,
    `var EcdsaMultikey;
var ecdsaRdfc2019Cryptosuite;
var dataIntegrity;`
  );
  replaceOnce(
    w3cVcPresentationPath,
    `var EcdsaMultikey__namespace = /*#__PURE__*/_interopNamespace(EcdsaMultikey);
var ecdsaRdfc2019Cryptosuite__namespace = /*#__PURE__*/_interopNamespace(ecdsaRdfc2019Cryptosuite);`,
    `const loadEcdsaMultikey = async () => EcdsaMultikey ?? (EcdsaMultikey = _interopNamespace(await import('@digitalbazaar/ecdsa-multikey')));
const loadEcdsaRdfc2019Cryptosuite = async () => ecdsaRdfc2019Cryptosuite ?? (ecdsaRdfc2019Cryptosuite = _interopNamespace(await import('@digitalbazaar/ecdsa-rdfc-2019-cryptosuite')));
const loadDataIntegrity = async () => dataIntegrity ?? (dataIntegrity = await import('@digitalbazaar/data-integrity'));`
  );
  replaceOnce(
    w3cVcPresentationPath,
    `      const keyPairInstance = await EcdsaMultikey__namespace.from({
        ...ecdsaKeyPair
      });`,
    `      const keyPairInstance = await (await loadEcdsaMultikey()).from({
        ...ecdsaKeyPair
      });`
  );
  replaceEvery(
    w3cVcPresentationPath,
    `new dataIntegrity.DataIntegrityProof({`,
    `new (await loadDataIntegrity()).DataIntegrityProof({`
  );
  replaceEvery(
    w3cVcPresentationPath,
    `ecdsaRdfc2019Cryptosuite__namespace.cryptosuite`,
    `(await loadEcdsaRdfc2019Cryptosuite()).cryptosuite`
  );
}

if (fs.existsSync(w3cIssuerEcdsaPath)) {
  replaceOnce(
    w3cIssuerEcdsaPath,
    `var EcdsaMultikey = require('@digitalbazaar/ecdsa-multikey');`,
    `var EcdsaMultikey;`
  );
  replaceOnce(
    w3cIssuerEcdsaPath,
    `var EcdsaMultikey__namespace = /*#__PURE__*/_interopNamespace(EcdsaMultikey);`,
    `const loadEcdsaMultikey = async () => EcdsaMultikey ?? (EcdsaMultikey = _interopNamespace(await import('@digitalbazaar/ecdsa-multikey')));`
  );
  replaceOnce(
    w3cIssuerEcdsaPath,
    `  const ecdsaKeyPair = await EcdsaMultikey__namespace.generate({
    curve: "P-256"
  });`,
    `  const ecdsaKeyPair = await (await loadEcdsaMultikey()).generate({
    curve: "P-256"
  });`
  );
}

if (fs.existsSync(w3cIssuerBbsPath)) {
  replaceOnce(
    w3cIssuerBbsPath,
    `var Bls12381Multikey = require('@digitalbazaar/bls12-381-multikey');`,
    `var Bls12381Multikey;`
  );
  replaceOnce(
    w3cIssuerBbsPath,
    `var Bls12381Multikey__namespace = /*#__PURE__*/_interopNamespace(Bls12381Multikey);`,
    `const loadBls12381Multikey = async () => Bls12381Multikey ?? (Bls12381Multikey = _interopNamespace(await import('@digitalbazaar/bls12-381-multikey')));`
  );
  replaceOnce(
    w3cIssuerBbsPath,
    `  const bbsKeyPair = await Bls12381Multikey__namespace.generateBbsKeyPair({
    algorithm: "BBS-BLS12-381-SHA-256",
    seed
  });`,
    `  const bbsKeyPair = await (await loadBls12381Multikey()).generateBbsKeyPair({
    algorithm: "BBS-BLS12-381-SHA-256",
    seed
  });`
  );
}

console.log("Patched TrustVC CJS modules for ESM-only Digital Bazaar dependencies.");

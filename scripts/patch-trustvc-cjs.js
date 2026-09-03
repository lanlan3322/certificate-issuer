const fs = require("fs");
const path = require("path");

function replaceOnce(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes(search)) {
    if (source.includes(replacement)) {
      return false;
    }
    throw new Error(`Patch target not found in ${filePath}`);
  }
  fs.writeFileSync(filePath, source.replace(search, replacement));
  return true;
}

const root = process.cwd();
const w3cVcPath = path.join(
  root,
  "node_modules/@trustvc/w3c-vc/dist/lib/w3c-vc.js"
);
const w3cIssuerBbsPath = path.join(
  root,
  "node_modules/@trustvc/w3c-issuer/dist/did-web/keyPair/bbs2023.js"
);

if (fs.existsSync(w3cVcPath)) {
  replaceOnce(
    w3cVcPath,
    `var Bls12381Multikey = require('@digitalbazaar/bls12-381-multikey');
var bbs2023Cryptosuite = require('@digitalbazaar/bbs-2023-cryptosuite');`,
    `var Bls12381Multikey;
var bbs2023Cryptosuite;`
  );
  replaceOnce(
    w3cVcPath,
    `var Bls12381Multikey__namespace = /*#__PURE__*/_interopNamespace(Bls12381Multikey);
var bbs2023Cryptosuite__namespace = /*#__PURE__*/_interopNamespace(bbs2023Cryptosuite);`,
    `const loadBls12381Multikey = async () => Bls12381Multikey ?? (Bls12381Multikey = _interopNamespace(await import('@digitalbazaar/bls12-381-multikey')));
const loadBbs2023Cryptosuite = async () => bbs2023Cryptosuite ?? (bbs2023Cryptosuite = _interopNamespace(await import('@digitalbazaar/bbs-2023-cryptosuite')));`
  );
  replaceOnce(
    w3cVcPath,
    `const { createSignCryptosuite: createEcdsaSd2023SignCryptosuite, createDiscloseCryptosuite: createEcdsaSd2023DiscloseCryptosuite, createVerifyCryptosuite: createEcdsaSd2023VerifyCryptosuite } = ecdsaSd2023Cryptosuite__namespace;
const { createSignCryptosuite: createBbs2023SignCryptosuite, createDiscloseCryptosuite: createBbs2023DiscloseCryptosuite, createVerifyCryptosuite: createBbs2023VerifyCryptosuite } = bbs2023Cryptosuite__namespace;`,
    `const { createSignCryptosuite: createEcdsaSd2023SignCryptosuite, createDiscloseCryptosuite: createEcdsaSd2023DiscloseCryptosuite, createVerifyCryptosuite: createEcdsaSd2023VerifyCryptosuite } = ecdsaSd2023Cryptosuite__namespace;`
  );
  replaceOnce(
    w3cVcPath,
    `      const keyPairInstance = cryptoSuite === "ecdsa-sd-2023" ? await EcdsaMultikey__namespace.from({
        ...keyPair
      }) : await Bls12381Multikey__namespace.from({
        ...keyPair
      });`,
    `      const keyPairInstance = cryptoSuite === "ecdsa-sd-2023" ? await EcdsaMultikey__namespace.from({
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
    `      const cryptosuiteInstance = cryptoSuite === "ecdsa-sd-2023" ? createEcdsaSd2023SignCryptosuite({
        mandatoryPointers
      }) : (await loadBbs2023Cryptosuite()).createSignCryptosuite({
        mandatoryPointers
      });`
  );
  replaceOnce(
    w3cVcPath,
    `          const verifyCryptosuite = cryptosuite === "ecdsa-sd-2023" ? createEcdsaSd2023VerifyCryptosuite() : createBbs2023VerifyCryptosuite();`,
    `          const verifyCryptosuite = cryptosuite === "ecdsa-sd-2023" ? createEcdsaSd2023VerifyCryptosuite() : (await loadBbs2023Cryptosuite()).createVerifyCryptosuite();`
  );
  replaceOnce(
    w3cVcPath,
    `        const cryptosuiteInstance = cryptosuite === "ecdsa-sd-2023" ? createEcdsaSd2023DiscloseCryptosuite({
          selectivePointers
        }) : createBbs2023DiscloseCryptosuite({
          selectivePointers
        });`,
    `        const cryptosuiteInstance = cryptosuite === "ecdsa-sd-2023" ? createEcdsaSd2023DiscloseCryptosuite({
          selectivePointers
        }) : (await loadBbs2023Cryptosuite()).createDiscloseCryptosuite({
          selectivePointers
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

console.log("Patched TrustVC CJS modules for ESM-only BBS dependencies.");

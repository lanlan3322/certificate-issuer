const fs = require('fs');
const { execSync } = require('child_process');

const filePath = 'node_modules/@trustvc/w3c-vc/dist/lib/w3c-vc.js';
let content = fs.readFileSync(filePath, 'utf8');

// Apply the fix to create patched version
const lines = content.split('\n');
let result = [];
let inInteropNamespace = false;
let namespaceBlockStarted = false;
let addedPatchedBlock = false;
let skipUntilBraceClose = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (!addedPatchedBlock && line.includes('function _interopNamespace(e)')) {
    inInteropNamespace = true;
    namespaceBlockStarted = true;
  }
  
  // Find the "if (e && e.__esModule) return e;" line within _interopNamespace
  if (inInteropNamespace && !skipUntilBraceClose && 
      line.trim() === 'if (e && e.__esModule) return e;' && !addedPatchedBlock) {
    
    // Replace with patched version
    const indent = line.match(/^(\s*)/)[1];
    result.push(`${indent}// Patched to handle native ESM modules that set __esModule - iterate keys`);
    result.push(`${indent}// so w3c-vc destructuring (createEcdsaSd2023VerifyCryptosuite, etc.) works`);
    result.push(`${indent}// correctly in both Node.js require() and bundled contexts.`);
    result.push(`${indent}if (e && e.__esModule) {`);
    result.push(`${indent}  var n = Object.create(null);`);
    result.push(`${indent}  if (e) {`);
    result.push(`${indent}    Object.keys(e).forEach(function (k) {`);
    result.push(`${indent}      if (k !== 'default') {`);
    result.push(`${indent}        var d = Object.getOwnPropertyDescriptor(e, k);`);
    result.push(`${indent}        Object.defineProperty(n, k, d.get ? d : {`);
    result.push(`${indent}          enumerable: true,`);
    result.push(`${indent}          get: function () { return e[k]; }`);
    result.push(`${indent}        });`);
    result.push(`${indent}      }`);
    result.push(`${indent}    });`);
    result.push(`${indent+''}  }`);
    result.push(`${indent}  n.default = e;`);
    result.push(`${indent}  return Object.freeze(n);`);
    result.push(`${indent}}`);
    addedPatchedBlock = true;
    skipUntilBraceClose = true;
    continue;
  }
  
  if (addedPatchedBlock && line.trim() === 'return Object.freeze(n);' && inInteropNamespace) {
    // This is the end of the function - change to return n;
    const indent = line.match(/^(\s*)/)[1];
    result.push(`${indent}return n;`);
    addedPatchedBlock = false;
    continue;
  }
  
  result.push(line);
}

const patchedContent = result.join('\n');
fs.writeFileSync('/tmp/w3c-vc-patched.js', patchedContent, 'utf8');

// Generate unified diff
const diff = execSync(`diff -u "${filePath}" /tmp/w3c-vc-patched.js`, { encoding: 'utf8' });
const lines2 = diff.split('\n');
const finalPatch = lines2.map(l => 
  l.replace(/^--- .*/, '--- a/dist/lib/w3c-vc.js')
   .replace(/^\+\+\+ .*/, '+++ b/dist/lib/w3c-vc.js')
).join('\n');

fs.writeFileSync('patches/@trustvc+w3c-vc+2.4.2.patch', finalPatch, 'utf8');
console.log('Patch created successfully!');
console.log(`Patch size: ${finalPatch.length} bytes`);


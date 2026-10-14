import { buildVCPayload, type CertificateData } from '../lib/trustvc';

const d: CertificateData = { id:'t1', recipientName:'A', recipientEmail:'a@b.c', certificateType:'Professional Certificate', templateId:'classic', issuerName:'T', issueDate:'2026-01-01', description:'Debug certificate modes', validFrom:'2026-01-01' };
const w = buildVCPayload(d, 'w3c');
const o = buildVCPayload(d, 'opencerts');

console.log('=== @context comparison ===');
for (let i = 0; i < Math.max(w['@context'].length, o['@context'].length); i++) {
  console.log(`  [${i}] w3c:`, w['@context'][i] ?? 'undefined', '| oc:', o['@context'][i] ?? 'undefined');
}

console.log('\n=== type comparison ===');
for (let i = 0; i < Math.max(w.type.length, o.type.length); i++) {
  console.log(`  [${i}] w3c:`, w.type[i], '| oc:', o.type[i]);
}

console.log('\n=== credentialSubject diff ===');
const wSubject: Record<string, unknown> = w.credentialSubject;
const oSubject: Record<string, unknown> = o.credentialSubject;
const wKeys = Object.keys(wSubject).sort();
const oKeys = Object.keys(oSubject).sort();
for (const k of [...new Set([...wKeys, ...oKeys])]) {
  if (JSON.stringify(wSubject[k]) !== JSON.stringify(oSubject[k])) {
    console.log(`  KEY: ${k}`);
    console.log(`    w3c:`, JSON.stringify(wSubject[k]));
    console.log(`    oc:`, JSON.stringify(oSubject[k]));
  }
}

console.log('\n=== issuingMethods comparison ===');
console.log('w3c:', JSON.stringify(w.issuingMethods));
console.log('oc:', JSON.stringify(o.issuingMethods));

console.log('\n=== Full key listing ===');
const wPayload: Record<string, unknown> = w;
const oPayload: Record<string, unknown> = o;
const allKeys = [...new Set([...Object.keys(w), ...Object.keys(o)])].sort();
for (const k of allKeys) {
  const wv = JSON.stringify(wPayload[k]);
  const ov = JSON.stringify(oPayload[k]);
  if (wv !== ov) {
    console.log(`KEY DIFF: ${k}`);
  }
}
console.log('\nDone');

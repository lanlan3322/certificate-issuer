// OpenCerts payload validation — programmatic check of buildVCPayload output
import { buildVCPayload, type CertificateData } from '../lib/trustvc';

const testData: CertificateData = {
  id: 'test-opencerts-001',
  recipientName: 'Alice Tan',
  recipientEmail: 'alice@test.sg',
  certificateType: 'Professional Certificate',
  templateId: 'classic',
  issuerName: 'TrustVC Issuer',
  issueDate: '2026-10-13',
  description: 'Test OpenCerts validation',
  validFrom: '2026-10-13',
};

// Build all four modes
const standard = buildVCPayload(testData, 'standard');
const opencerts = buildVCPayload(testData, 'opencerts');
const w3c = buildVCPayload(testData, 'w3c');
const v1 = buildVCPayload(testData, 'v1');

let passed = 0;
let failed = 0;

// ── Helpers ──
const check = (label: string, condition: boolean) => {
  console.log(`  ${condition ? '✅' : '❌'} ${label}`);
  if (condition) passed++; else failed++;
};

// Strip non-deterministic fields for payload comparison
function normPayload(obj: any): any {
  const copy = structuredClone(obj);
  if (copy.credentialSubject && typeof copy.credentialSubject === 'object') {
    delete copy.credentialSubject.id;
  }
  return copy;
}

// ── Test 1: w3c correctly generates OpenCerts payload (== opencerts) ──
console.log('\n=== TEST 1: w3c → OpenCerts alias ===');
const w3cNorm = normPayload(w3c);
const opcNorm = normPayload(opencerts);
check('w3c === opencerts payload', JSON.stringify(w3cNorm) === JSON.stringify(opcNorm));

// Both should have OA-specific context entries
const ctx = (opencerts as any)['@context'] as string[];
check('w3c @context length === 8 (OA extras)', ctx.length === 8);
check('w3c type includes OpenAttestationDocument2018', (w3c as any).type.includes('OpenAttestationDocument2018'));
check('w3c credentialSubject._type present', !!((w3c as any).credentialSubject?._type));

// ── Test 2: v1 correctly generates Standard payload (== standard) ──
console.log('\n=== TEST 2: v1 → Standard alias ===');
const v1Norm = normPayload(v1);
const stdNorm = normPayload(standard);
check('v1 === standard payload', JSON.stringify(v1Norm) === JSON.stringify(stdNorm));

// Both should have minimal context (no OA extras)
const stdCtx = (standard as any)['@context'] as string[];
check('standard @context length === 5 (base only)', stdCtx.length === 5);
check('standard type is [VerifiableCredential] only', JSON.stringify((standard as any).type) === '["VerifiableCredential"]');
check('standard credentialSubject._type absent', !((standard as any).credentialSubject?._type));

// ── Test 3: standard and opencerts produce DIFFERENT payloads (as expected) ──
console.log('\n=== TEST 3: standard ≠ opencerts (correct divergence) ===');
check('standard @context length ≠ opencerts @context length', stdCtx.length !== ctx.length);
check('standard type length ≠ opencerts type length',
  ((standard as any).type as string[]).length !== ((opencerts as any).type as string[]).length);

// ── Test 4: All payloads have required skeleton keys ──
console.log('\n=== TEST 4: Required payload skeleton ===');
const requiredKeys = ['@context', 'type', 'validFrom', 'issuer', 'credentialSubject', 'credentialStatus', 'issuingMethods'];
requiredKeys.forEach(key => {
  check(`standard has "${key}"`, key in standard);
});

// ── Test 5: OpenCerts mode adds _type to subject ──
console.log('\n=== TEST 5: OpenCerts subject fields ===');
check('opencerts subject._type == OpenAttestationCredentialSubject',
  (opencerts as any).credentialSubject?._type === 'OpenAttestationCredentialSubject');

// ── Summary ──
console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  console.log('❌ VALIDATION FAILED — alias propagation still broken');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED — alias propagation working correctly');
}

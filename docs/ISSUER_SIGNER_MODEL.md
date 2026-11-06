# Issuer-owned credential signing

## Architecture and signing flow

The Phase 3/4 foundation already replaced saved-template issuance's platform
signer with encrypted issuer-owned P-256 keys and retained DID verification
methods. This change completes explicit signed attribution and readable storage
fields; it does not introduce another key store or DID architecture.

1. Authenticate and resolve an active saved template within the caller's scope.
2. Resolve and authorize the template's issuer and active organization.
3. Load that issuer's active encrypted key, check it is not shared with another
   active issuer, and resolve the selected managed or validated customer DID.
4. Verify decrypted public material against stored public key/fingerprint.
5. Override all client-supplied identity metadata with the resolved owner/key.
6. Build/sign using the explicit key context. No manual key choice, environment-key
   fallback or legacy profile secret lookup occurs on this endpoint.
7. Persist the signed credential, template owner, signing-key FK, DID/method and
   immutable identity/key-version snapshot.

`signDocumentWithDID` retains its context-free legacy integration helper for
compatibility, but production issuance and status services always pass an explicit
owned context. An incomplete explicit context cannot fall back to environment
material and must match the credential's issuer DID/controller.

## Signed credential metadata

New credentials contain these public fields in `credentialSubject`, covered by
the proof, with explicit embedded JSON-LD definitions:

- `organization_id`
- `issuer_id`
- `issuer_name` (issuer display name at issuance)
- `did_used`
- `verification_method`
- `key_fingerprint` (SHA-256 public-key fingerprint)
- `key_version`

Existing `issuerDisplayName` and `organizationDisplayName` remain for renderers.
The standard top-level `issuer` remains a DID string and proof verification method
remains the issuer's method under the selected organization DID. Do not replace
the standard issuer with an application name or object: the installed TrustVC
identity verifier expects the DID. Attribution is included among mandatory
disclosure pointers. This does not claim all arbitrary partial-disclosure profiles
are interoperable with every external verifier.

The verification page already shows **Issued By** and **Organization** for both
uploaded files and identifier lookups. Presentation now also recognizes
`issuer_name`; it continues using signed labels rather than mutable directory names
or an unrelated database record's labels. Legacy missing labels remain “Not
recorded” rather than being invented.

## Schema and migration

Apply `020_credential_signer_attribution.sql` after migrations 017–019.
`organization_id`, `issuer_id`, `verification_method`, `signing_key_id` and immutable
`issuer_snapshot` already exist. Migration 020 adds stored generated columns:

| Column | Authoritative source |
|---|---|
| `issuer_name` | snapshot issuer display/name |
| `did_used` | snapshot DID, falling back to historical `issuer_did` |
| `key_fingerprint` | snapshot public-key fingerprint |
| `key_version` | snapshot key version |

Generated columns cannot be forged independently of the immutable snapshot.
Historical signed JSON is never rewritten or reissued. Unknown legacy key versions
remain null. Credential service records expose these fields and the signing-key FK.

Rehearse on staging and back up first; adding stored generated columns may rewrite
the database table and needs a maintenance window appropriate to its size.
No live migration, secret change or remote deployment is performed here.

Legacy platform-key imports can legitimately contain shared historical material.
Before new issuance, inventory active key fingerprints:

```sql
SELECT fingerprint, count(DISTINCT issuer_id) AS issuers
FROM public.issuer_keys
WHERE status = 'active'
GROUP BY fingerprint
HAVING count(DISTINCT issuer_id) > 1;
```

Rotate and explicitly activate a dedicated generated key for each affected issuer.
New issuance fails with an actionable conflict while duplicate active fingerprints
remain. Never delete the shared historical keys/public methods to fix this check.
Use existing operator-only import tooling for missing legacy keys, followed by
dedicated rotation; do not overwrite published legacy identities. For customer
DIDs, republish and revalidate the updated files before issuing.

## Rotation and compatibility

New credentials select the active version automatically; persisted records keep
the exact key ID, version, fingerprint, DID and verification method. Older public
assertion methods and encrypted status signers remain retained. Activation does not
re-sign or alter existing credentials.

The existing W3C/TrustVC ecdsa-sd-2023 suite, P-256 curve, standard/OpenCerts contexts,
document-store handling, managed/customer status URLs and legacy verification paths
remain. Local tests verify both credential modes with real encrypted A/B keys,
different fingerprints, historical methods after rotation and tamper rejection.
This is not independent external OpenCerts/TradeTrust viewer certification.

## Files and validation

Runtime changes: issuer key service, issuance route, credential service,
`lib/trustvc.ts` and issuer presentation helper. Schema: migration 020.
Tests cover route-owned metadata overriding hostile input, distinct real encrypted
keys, standard/OpenCerts proof verification, signed attribution tampering, rotation,
generated-column immutability and unchanged historical credential bytes.

Local results:

- Production build/type-check: passed.
- Targeted route/service/schema/presentation tests: 40 passed.
- Real encrypted-key and managed/customer DID crypto tests: 4 passed.
- Full suite: 444 tests, 429 passed, 15 failed. The complete failing-name set
  matches the preceding self-managed DID baseline; no new failures.
- Production browser-bundle scan: no issuer encryption-key variable, encrypted
  private-key field, secret Multikey field or private PEM marker matches.

Partial disclosure narrower than the complete credential subject was also tried
with the installed TrustVC verifier and returned an invalid signature; it is not
certified by these tests. Full-subject derived credentials verify in both modes.
The application verification flow and historical verification tests remain passing.

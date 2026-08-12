# Admin Manual

## 1. Purpose

This guide is for administrators and issuer operators who manage credentials, issuer records, templates, and access policies.

## 2. Admin capabilities

The platform supports the following admin tasks:

- create and manage issuer profiles
- enable or disable issuer status
- create and update brand or certificate templates
- approve or review issuance state
- revoke or suspend credentials
- export and review audit trail activity

## 3. Accessing admin features

Open the admin dashboard in the application. The admin experience allows you to:

- manage issuer records
- toggle live or disabled states
- review platform status
- maintain core issuance configuration

## 4. Managing issuer records

### 4.1 Create an issuer

1. Open the admin dashboard.
2. Enter issuer details.
3. Select the correct configured status.
4. Save the issuer record.

### 4.2 Update issuer status

Use the status controls to:

- enable active issuing
- suspend issuance temporarily
- review an issuer’s lifecycle state

This is useful if the issuer is under review, misconfigured, or waiting for DID or wallet setup.

## 5. Certificate templates

Templates define formal certificate presentation, labels, and content placeholders. Use the template builder to:

- create a new certificate layout
- edit field labels
- change the rendered order
- validate the output before issuance

Recommended process:

1. Create or select a template.
2. Edit the variable mapping.
3. Preview the template output.
4. Save the final definition.
5. Use the saved template in the issuance workflow.

## 6. Revocation and suspension

The platform supports lifecycle transitions for credential state:

- issue
- revoke
- suspend
- reinstate

Use revocation when:

- a certificate has been invalidated
- a recipient is no longer eligible
- a credential must be marked non-valid

Use suspension when you need a temporary hold before final revocation or restoration.

## 7. Audit and compliance

The audit layer records actions such as:

- credential issuance
- verification activity
- revoke or suspend actions
- operator review events

Review the audit panel to:

- confirm user actions
- investigate unusual issuance behavior
- produce compliance evidence for review

## 8. Bulk issuance

Bulk features are intended for operational scenarios where many certificates must be issued from a CSV or structured file input.

Recommended flow:

1. Prepare the CSV data.
2. Validate the file in the bulk issuance screen.
3. Review the summary before creating the batch.
4. Download the generated artifacts or store the records for follow-up.

## 9. Security and policy expectations

Administrators should follow these rules:

- never expose private DID keys in an app bundle or public repo
- keep signing keys in a secure backend or secret store
- validate revocation and DID records before publication
- verify issuance and revocation state before sending credentials externally
- review audit trails for suspicious activity

## 10. Troubleshooting

### Templates do not render as expected

Check:

- placeholder names
- template mapping
- field order
- missing values in the certificate payload

### Issuer cannot issue credentials

Check:

- issuer state is active
- DID is resolvable and valid
- required secrets are loaded
- wallet network or role is correct for Ethereum issuance

### Revocation status is inconsistent

Review:

- revocation record metadata
- resolver status
- credential lifecycle history
- associated audit events

## 11. Governance checklist

Before production rollout, complete:

- issuer onboarding
- DID document publication
- key control review
- template approval
- revocation policy confirmation
- audit access verification

## 12. Related guides

- [USER_MANUAL.md](USER_MANUAL.md)
- [OPERATOR_MANUAL.md](OPERATOR_MANUAL.md)

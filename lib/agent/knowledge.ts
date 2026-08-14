export interface KnowledgeArticle {
  title: string;
  keywords: string[];
  content: string;
}

export const knowledgeArticles: KnowledgeArticle[] = [
  { title: "TrustVC", keywords: ["trustvc", "w3c", "vc", "credential"], content: "TrustVC issues W3C Verifiable Credentials. A credential should contain issuer, subject, validity, and a cryptographic proof before it is treated as verifiable." },
  { title: "DID:web", keywords: ["did", "did:web", "identity", "key"], content: "DID:web binds an issuer identifier to a published DID document. Keep private DID keys on a server-side signing boundary; do not place them in static browser builds." },
  { title: "Issuance", keywords: ["issue", "issuance", "recipient", "certificate"], content: "Issuance collects recipient name, recipient email, certificate type, validity, then requires a final review before signing and issuing the credential." },
  { title: "Verification", keywords: ["verify", "verification", "proof", "signature"], content: "Verification checks the credential structure, proof, issuer identity, and where applicable the Ethereum Document Store registration or revocation state." },
  { title: "Revocation", keywords: ["revoke", "revocation", "ocsp", "document store"], content: "DID credentials use an OCSP responder path. Ethereum credentials use the configured Document Store. Revocation is operationally significant and should be confirmed before submission." },
];

export function retrieveKnowledge(query: string): KnowledgeArticle[] {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  return knowledgeArticles
    .map((article) => ({ article, score: article.keywords.filter((keyword) => terms.includes(keyword)).length }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map(({ article }) => article);
}
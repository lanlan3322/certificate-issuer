import { validateDid } from "./dnsDid";

describe("validateDid", () => {
  it("returns true for valid did", () => {
    expect(validateDid("did:github:gjgd")).toBe(true);
    expect(validateDid("did:jolo:1fb352353ff51248c5104b407f9c04c3666627fcf5a167d693c9fc84b75964e2")).toBe(true);
    expect(validateDid("did:schema:public-ipfs:xsd:QmUQAxKQ5sbWWrcBZzwkThktfUGZvuPQyTrqMzb3mZnLE5")).toBe(true);
    expect(validateDid("did:sov:builder:VbPQNHsvoLZdaNU7fTBeFx")).toBe(true);
    expect(validateDid("did:ethr:0xE6Fe788d8ca214A080b0f6aC7F48480b2AEfa9a6")).toBe(true);
  });

  it("returns false for invalid did", () => {
    expect(validateDid("DID:github:gjgd")).toBe(false);
    expect(validateDid("did:GITHUB:gjgd")).toBe(false);
    expect(validateDid("did::gjgd")).toBe(false);
  });
});

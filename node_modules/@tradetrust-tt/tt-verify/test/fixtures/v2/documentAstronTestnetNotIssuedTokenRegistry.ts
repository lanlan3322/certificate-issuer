import { SchemaId, v2, WrappedDocument } from "@tradetrust-tt/tradetrust";

interface CustomDocument extends v2.OpenAttestationDocument {
  recipient: {
    name: string;
  };
}

export const documentAstronNotIssuedTokenRegistry: WrappedDocument<CustomDocument> = {
  version: SchemaId.v2,
  data: {
    id: "77974d5a-c9fd-45ec-a47c-a3dd65727547:string:53b75bbe",
    $template: {
      name: "19329974-b4dd-45b5-b746-6c2c220ebe61:string:GOVTECH_DEMO",
      type: "f5fef017-0d78-4da9-bb1a-0c2f754c5376:string:EMBEDDED_RENDERER",
      url: "3718fee3-27bd-4eb3-ac6f-a922fc816b67:string:https://demo-renderer.opencerts.io",
    },
    issuers: [
      {
        name: "a2358720-29e4-4d8d-b8fd-17281ab3737f:string:caict astrontestnet",
        tokenRegistry: "1605e607-7017-4914-8d12-eddcbdc8cf84:string:0xb1Bf514b3893357813F366282E887eE221D5C2dA",
        identityProof: {
          type: "92c2fece-86e7-4615-9a50-a3c6f1e1b85a:string:DNS-TXT",
          location: "fc4e5072-d0af-422b-9ef3-852355b90a6d:string:dev-astronlayer2.bitfactory.cn",
        },
      },
    ],
    recipient: {
      name: "2aa6efa1-9487-497e-b398-6a54afd4cfe0:string:caict",
    },
  },
  signature: {
    type: "SHA3MerkleProof",
    targetHash: "38134e0d97d37c5b297f2ed0ffb6d2d54f97c1aa9cbb530d1c8c6171417daebc",
    proof: [],
    merkleRoot: "38134e0d97d37c5b297f2ed0ffb6d2d54f97c1aa9cbb530d1c8c6171417daebc",
  },
};

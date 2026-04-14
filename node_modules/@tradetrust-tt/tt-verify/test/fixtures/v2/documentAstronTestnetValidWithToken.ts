import { SchemaId, v2, WrappedDocument } from "@tradetrust-tt/tradetrust";

interface CustomDocument extends v2.OpenAttestationDocument {
  recipient: {
    name: string;
  };
}

export const documentAstronValidWithToken: WrappedDocument<CustomDocument> = {
  version: SchemaId.v2,
  data: {
    id: "39379be2-da20-4841-bab8-72b9ac7444ee:string:53b75bbe",
    $template: {
      name: "804ea4b6-b388-4c62-bda4-28c3e9a0547e:string:GOVTECH_DEMO",
      type: "e85c8eeb-316d-48d6-b7d8-7fda5f05a131:string:EMBEDDED_RENDERER",
      url: "a9bba2af-729a-4948-88a6-ec834e14f0fb:string:https://demo-renderer.opencerts.io",
    },
    issuers: [
      {
        name: "207020ad-d547-4526-bfc1-fb9982528e62:string:caict astrontestnet",
        tokenRegistry: "89ecb5d9-22ed-4298-902d-a0be46cacb45:string:0xb1Bf514b3893357813F366282E887eE221D5C2dA",
        identityProof: {
          type: "69bfc335-71e3-4c66-8778-c0480a1410a6:string:DNS-TXT",
          location: "c8e0c761-2ce3-42ce-8558-201fa4a8d122:string:dev-astronlayer2.bitfactory.cn",
        },
      },
    ],
    recipient: {
      name: "8b73a5aa-24cc-4bea-ae3d-ae56aef135cd:string:caict",
    },
  },
  signature: {
    type: "SHA3MerkleProof",
    targetHash: "d905f7d8c49efe2da142a8a93be07d9f8350f488f2648bad2ff7a3df5aadf352",
    proof: [],
    merkleRoot: "d905f7d8c49efe2da142a8a93be07d9f8350f488f2648bad2ff7a3df5aadf352",
  },
};

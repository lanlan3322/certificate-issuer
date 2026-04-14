import { SchemaId, v2, WrappedDocument } from "@tradetrust-tt/tradetrust";

interface CustomDocument extends v2.OpenAttestationDocument {
  recipient: {
    name: string;
  };
}

export const documentAstronValidWithToken: WrappedDocument<CustomDocument> = {
  version: SchemaId.v2,
  data: {
    id: "9f05889b-9f6d-4d27-b3ac-7524a21502d6:string:53b75bbe",
    $template: {
      name: "178f99a0-5cbb-4d94-955b-5e795522066e:string:GOVTECH_DEMO",
      type: "fd68ae42-c517-4d5a-9658-336a415a2234:string:EMBEDDED_RENDERER",
      url: "736cda67-f8de-4889-81a1-efd9ce3f0ed3:string:https://demo-renderer.opencerts.io",
    },
    issuers: [
      {
        name: "6136c081-ec24-4dec-a2ac-c9548e061b7f:string:caict astron",
        tokenRegistry: "18800cd1-9c58-4a8f-a79a-3ea57e7e94e8:string:0x18bc0127Ae33389cD96593a1a612774fD14c0737",
        identityProof: {
          type: "c62aa58e-6ae0-4025-b051-d41c09454ac8:string:DNS-TXT",
          location: "ac838cbe-4856-43d7-b5b6-46454e08ad1d:string:astronlayer2.bitfactory.cn",
        },
      },
    ],
    recipient: {
      name: "94d95237-d397-4113-b91e-0826c886f7b6:string:caict",
    },
  },
  signature: {
    type: "SHA3MerkleProof",
    targetHash: "68889ffc130ec3450e4c9bb8f62b84b708db6d74f75dbae08af016a6812082ac",
    proof: [],
    merkleRoot: "68889ffc130ec3450e4c9bb8f62b84b708db6d74f75dbae08af016a6812082ac",
  },
};

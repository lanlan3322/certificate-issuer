import { SchemaId, v2, WrappedDocument } from "@tradetrust-tt/tradetrust";

interface CustomDocument extends v2.OpenAttestationDocument {
  recipient: {
    name: string;
  };
}

export const documentAstronNotIssuedTokenRegistry: WrappedDocument<CustomDocument> = {
  version: SchemaId.v2,
  data: {
    id: "e5c04ef4-b42f-4251-ad18-6a0254f3495f:string:53b75bbe",
    $template: {
      name: "6a016890-7e4e-40e4-a533-d74fd0d44408:string:GOVTECH_DEMO",
      type: "793afd56-4fde-4bbf-a58f-c38f408229c7:string:EMBEDDED_RENDERER",
      url: "237c9e87-4da6-448e-98b9-9e566cda969b:string:https://demo-renderer.opencerts.io",
    },
    issuers: [
      {
        name: "71caafe0-a9f6-44fe-a94b-cd35ccbedfd8:string:caict astron",
        tokenRegistry: "ab135a62-6aaa-4278-8bf3-0c762a903ef2:string:0x18bc0127Ae33389cD96593a1a612774fD14c0737",
        identityProof: {
          type: "b46315f8-9bb9-42a0-8986-8cc2167e7d49:string:DNS-TXT",
          location: "3ad0c414-174f-416f-b889-f59a72cbf3cf:string:astronlayer2.bitfactory.cn",
        },
      },
    ],
    recipient: {
      name: "39526f35-2c57-44ac-81b5-a53e3aa4f0ce:string:caict",
    },
  },
  signature: {
    type: "SHA3MerkleProof",
    targetHash: "2aa34ea6672556041d802989ca5f39f92694716023bb272610ff68d0f54e4d92",
    proof: [],
    merkleRoot: "2aa34ea6672556041d802989ca5f39f92694716023bb272610ff68d0f54e4d92",
  },
};

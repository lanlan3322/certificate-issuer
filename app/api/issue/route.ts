import { NextResponse } from "next/server";
import { buildVCPayload, getDIDKeyPairFromEnv, signDocumentWithDID } from "../../../lib/trustvc";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      data?: Record<string, unknown>;
      type?: "did" | "ethereum";
    };

    const data = body.data;
    const type = body.type ?? "did";

    if (!data) {
      return NextResponse.json(
        { error: "Missing credential payload." },
        { status: 400 }
      );
    }

    if (type === "did") {
      const keyPair = getDIDKeyPairFromEnv();
      if (!keyPair) {
        return NextResponse.json(
          {
            signed: false,
            credential: buildVCPayload(data as any),
            error:
              "DID signing is not configured in the server environment. Set DID_KEY_ID, DID_CONTROLLER, DID_PUBLIC_KEY_MULTIBASE, and DID_PRIVATE_KEY_MULTIBASE.",
          },
          { status: 500 }
        );
      }

      const result = await signDocumentWithDID(buildVCPayload(data as any));
      if (!result.signed) {
        return NextResponse.json(
          {
            signed: false,
            credential: result.credential,
            error: result.error ?? "Signing failed.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        signed: true,
        credential: result.credential,
      });
    }

    return NextResponse.json(
      { error: "Only DID issuance is supported in the server-side phase 1 implementation." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        signed: false,
        error: error instanceof Error ? error.message : "Unknown server issue.",
      },
      { status: 500 }
    );
  }
}

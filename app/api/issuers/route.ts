import { NextResponse } from "next/server";
import {
  createDefaultPlatform,
  createIssuerRepository,
  getIssuerBySlug,
  type IssuerStatus,
  type PlatformState,
} from "../../../lib/platform";

let platformState: PlatformState = createDefaultPlatform();

function getRepository() {
  return createIssuerRepository(platformState);
}

export async function GET() {
  const issuers = getRepository().listIssuers();
  return NextResponse.json({ issuers });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      name?: string;
      slug?: string;
      contactEmail?: string;
    };

    const organizationId = body.organizationId?.trim();
    const name = body.name?.trim();
    const slug = body.slug?.trim();
    const contactEmail = body.contactEmail?.trim();

    if (!organizationId || !name || !slug || !contactEmail) {
      return NextResponse.json(
        {
          error: "organizationId, name, slug, and contactEmail are required.",
        },
        { status: 400 }
      );
    }

    if (getIssuerBySlug(platformState, slug)) {
      return NextResponse.json(
        {
          error: `Issuer slug already exists: ${slug}`,
        },
        { status: 409 }
      );
    }

    const issuer = getRepository().createIssuer({
      organizationId,
      name,
      slug,
      contactEmail,
    });

    return NextResponse.json({ issuer }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create issuer.",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      status?: IssuerStatus;
    };

    const id = body.id?.trim();
    const status = body.status;

    if (!id || !status) {
      return NextResponse.json(
        {
          error: "id and status are required.",
        },
        { status: 400 }
      );
    }

    const issuer = getRepository().updateIssuerStatus(id, status);

    return NextResponse.json({ issuer });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update issuer status.",
      },
      { status: 400 }
    );
  }
}

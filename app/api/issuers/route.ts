import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../lib/db";
import { IssuerService, type IssuerRecord } from "../../../services/IssuerService";

export async function GET() {
  try { return NextResponse.json({ issuers: await IssuerService.list() }); }
  catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to load issuers." }, { status: error instanceof DatabaseConfigurationError ? 503 : 500 }); }
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

    const issuer = await IssuerService.create({
      organizationId,
      name,
      slug,
      contactEmail,
    });

    return NextResponse.json({ issuer }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof DatabaseConfigurationError ? error.message : error instanceof Error ? error.message : "Unable to create issuer.",
      },
      { status: error instanceof DatabaseConfigurationError ? 503 : 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      status?: IssuerRecord["status"];
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

    const issuer = await IssuerService.updateStatus(id, status);

    return NextResponse.json({ issuer });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update issuer status.",
      },
      { status: error instanceof DatabaseConfigurationError ? 503 : 400 }
    );
  }
}

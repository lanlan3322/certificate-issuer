import { NextResponse } from "next/server";
import { getCurrentIssuerUser } from "../../../../lib/auth";
export async function POST() { return NextResponse.json({ user: await getCurrentIssuerUser() }); }
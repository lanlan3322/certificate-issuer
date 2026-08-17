import { NextResponse } from "next/server";
import { logoutIssuer } from "../../../../lib/auth";
export async function POST() { await logoutIssuer(); return NextResponse.json({ loggedOut: true }); }
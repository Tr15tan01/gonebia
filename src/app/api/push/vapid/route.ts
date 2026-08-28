import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ publicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? null });
}

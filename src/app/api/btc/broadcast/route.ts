import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!body) {
    return NextResponse.json({ error: "Missing raw tx" }, { status: 400 });
  }

  const res = await fetch("https://blockstream.info/api/tx", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }

  const txid = await res.text();
  return NextResponse.json({ txid });
}

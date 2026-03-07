import { NextRequest, NextResponse } from "next/server";

const baseUrl = "https://api.etherscan.io/v2/api";

const chainIds: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const network = searchParams.get("network") ?? "polygon";
  const chainid = chainIds[network] ?? 137;

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  const url = `${baseUrl}?chainid=${chainid}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  return NextResponse.json(data);
}

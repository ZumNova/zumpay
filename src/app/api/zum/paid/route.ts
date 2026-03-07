import { NextRequest, NextResponse } from "next/server";

const ZUM_ADDRESS = "0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5";
const ZUM_OWNER = "0x521125be95c5679539aB07582F55F0040975A047";
const ZUM_DECIMALS = BigInt(18);
const ZUM_PRICE = BigInt(10) * BigInt(10) ** ZUM_DECIMALS;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  const url = `https://api.etherscan.io/v2/api?chainid=137&module=account&action=tokentx&contractaddress=${ZUM_ADDRESS}&address=${address}&sort=desc&apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data?.status !== "1") {
    return NextResponse.json({ paid: false, total: "0" });
  }

  let total = 0n;
  for (const tx of data.result ?? []) {
    if (
      tx?.from?.toLowerCase() === address.toLowerCase() &&
      tx?.to?.toLowerCase() === ZUM_OWNER.toLowerCase()
    ) {
      total += BigInt(tx.value);
      if (total >= ZUM_PRICE) {
        break;
      }
    }
  }

  return NextResponse.json({
    paid: total >= ZUM_PRICE,
    total: total.toString()
  });
}

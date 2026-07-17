import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const ZUM_ADDRESS = "0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5";
const ZUM_OWNER = "0x521125be95c5679539aB07582F55F0040975A047";
const ZUM_PREMIUM_CONTRACT =
  process.env.ZUM_PREMIUM_CONTRACT ??
  process.env.NEXT_PUBLIC_ZUM_PREMIUM_CONTRACT ??
  "";
const ZUM_DECIMALS = BigInt(18);
const ZUM_PRICE = BigInt(100) * BigInt(10) ** ZUM_DECIMALS;
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PREMIUM_ACCESS_ABI = [
  "function hasPremium(address user) view returns (bool)",
  "function premiumPrice() view returns (uint256)"
];
const premiumAccessInterface = new ethers.Interface(PREMIUM_ACCESS_ABI);

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function topicAddress(address: string) {
  return `0x${normalizeAddress(address).replace(/^0x/, "").padStart(64, "0")}`;
}

function safeBigInt(value: unknown) {
  try {
    const text = String(value ?? "0");
    if (!text || text === "0x") {
      return BigInt(0);
    }
    return BigInt(text);
  } catch {
    return BigInt(0);
  }
}

function premiumAllowlist() {
  return (process.env.ZUM_PREMIUM_ADDRESSES ?? "")
    .split(",")
    .map((item) => normalizeAddress(item))
    .filter(Boolean);
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  const rpcUrl =
    process.env.POLYGON_RPC_URL ??
    process.env.NEXT_PUBLIC_POLYGON_RPC_URL ??
    "https://polygon-rpc.com";

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params
      }),
      cache: "no-store"
    });
    const data = await res.json();
    if (data?.error) {
      return null;
    }
    return data?.result ?? null;
  } catch {
    return null;
  }
}

async function readPaidByLogs(address: string) {
  const logs = await rpcCall<Array<{ data: string }>>("eth_getLogs", [
    {
      fromBlock: process.env.ZUM_DEPLOY_BLOCK ?? "0x0",
      toBlock: "latest",
      address: ZUM_ADDRESS,
      topics: [TRANSFER_TOPIC, topicAddress(address), topicAddress(ZUM_OWNER)]
    }
  ]);

  if (!logs) {
    return BigInt(0);
  }

  return logs.reduce((sum, log) => sum + safeBigInt(log.data), BigInt(0));
}

async function readPremiumByContract(address: string) {
  if (!ZUM_PREMIUM_CONTRACT) {
    return null;
  }

  const result = await rpcCall<string>("eth_call", [
    {
      to: ZUM_PREMIUM_CONTRACT,
      data: premiumAccessInterface.encodeFunctionData("hasPremium", [address])
    },
    "latest"
  ]);

  if (!result) {
    return null;
  }

  try {
    const [hasPremium] = premiumAccessInterface.decodeFunctionResult(
      "hasPremium",
      result
    );
    return Boolean(hasPremium);
  } catch {
    return null;
  }
}

async function readPremiumPrice() {
  if (!ZUM_PREMIUM_CONTRACT) {
    return ZUM_PRICE;
  }

  const result = await rpcCall<string>("eth_call", [
    {
      to: ZUM_PREMIUM_CONTRACT,
      data: premiumAccessInterface.encodeFunctionData("premiumPrice", [])
    },
    "latest"
  ]);

  if (!result) {
    return ZUM_PRICE;
  }

  try {
    const [premiumPrice] = premiumAccessInterface.decodeFunctionResult(
      "premiumPrice",
      result
    );
    return premiumPrice as bigint;
  } catch {
    return ZUM_PRICE;
  }
}

async function readPaidByExplorer(address: string) {
  const apiKey = process.env.ETHERSCAN_API_KEY ?? process.env.POLYGONSCAN_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = `https://api.etherscan.io/v2/api?chainid=137&module=account&action=tokentx&contractaddress=${ZUM_ADDRESS}&address=${address}&sort=desc&apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data?.status !== "1") {
    return BigInt(0);
  }

  let total = BigInt(0);
  for (const tx of data.result ?? []) {
    if (
      normalizeAddress(tx?.from ?? "") === normalizeAddress(address) &&
      normalizeAddress(tx?.to ?? "") === normalizeAddress(ZUM_OWNER)
    ) {
      total += safeBigInt(tx.value);
      if (total >= ZUM_PRICE) {
        break;
      }
    }
  }

  return total;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const normalized = normalizeAddress(address);
    const premiumPrice = await readPremiumPrice();
    if (
      normalized === normalizeAddress(ZUM_OWNER) ||
      premiumAllowlist().includes(normalized)
    ) {
      return NextResponse.json({
        paid: true,
        total: premiumPrice.toString(),
        source: "allowlist"
      });
    }

    const contractPaid = await readPremiumByContract(address);
    if (contractPaid === true) {
      return NextResponse.json({
        paid: true,
        total: premiumPrice.toString(),
        source: "contract",
        contract: ZUM_PREMIUM_CONTRACT
      });
    }

    const explorerPaid = await readPaidByExplorer(address);
    if (explorerPaid !== null) {
      return NextResponse.json({
        paid: explorerPaid >= ZUM_PRICE,
        total: explorerPaid.toString()
      });
    }

    const rpcPaid = await readPaidByLogs(address);

    return NextResponse.json({
      paid: rpcPaid >= ZUM_PRICE,
      total: rpcPaid.toString()
    });
  } catch (error) {
    console.error("ZUM paid check failed", error);
    return NextResponse.json({
      paid: false,
      total: "0",
      error: "ZUM paid check unavailable"
    });
  }
}

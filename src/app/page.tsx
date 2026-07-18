"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import QRCode from "qrcode";
import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { initEccLib, networks, payments, Psbt } from "bitcoinjs-lib";
import styles from "./page.module.css";

type Network = {
  key: string;
  name: string;
  chainId: number;
  symbol: string;
  rpcUrl: string;
};

type StoredWallet = {
  salt: string;
  iv: string;
  cipher: string;
};

type TokenMeta = {
  address: string;
  symbol: string;
  decimals: number;
};

type TxItem = {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
};

type EvmAsset = {
  key: string;
  type: "native" | "token";
  symbol: string;
  balance: string;
  decimals: number;
  address: string;
};

type V3ChainKey = "arbitrum" | "ethereum" | "polygon";
type V3EntryMode = "single" | "manual";

type V3Pool = {
  id: string;
  chain: V3ChainKey;
  label: string;
  fee: number;
  feeLabel: string;
  token0: string;
  token1: string;
  inputToken: string;
  price: number;
  tick: number;
  reserve: string;
  activity: string;
  allowCreate?: boolean;
};

type V3Position = {
  tokenId: string;
  chain: V3ChainKey;
  label: string;
  feeLabel: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  fees0?: string;
  fees1?: string;
  token0Symbol?: string;
  token1Symbol?: string;
};

type V3EntryEstimate = {
  amount0: number;
  amount1: number;
  swapAmount: number;
  minAfterSlippage: number;
};

type V3ScanResult = {
  status: "Saludable" | "Activa" | "Watch" | "No activa";
  poolAddress: string;
  tick: number;
  price: number;
  liquidity: string;
  reserve: string;
  swaps: number;
  token0Balance: string;
  token1Balance: string;
  checkedAt: string;
};

type InjectedEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const STORAGE_KEY = "zumpay_wallet_v1";
const TOKEN_KEY = "zumpay_tokens_v1";
const TX_KEY = "zumpay_txs_v1";
const V3_POSITION_KEY = "zumpay_v3_positions_v1";

const NETWORKS: Network[] = [
  {
    key: "ethereum",
    name: "Ethereum",
    chainId: 1,
    symbol: "ETH",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL ?? "https://rpc.ankr.com/eth"
  },
  {
    key: "polygon",
    name: "Polygon",
    chainId: 137,
    symbol: "POL",
    rpcUrl:
      process.env.NEXT_PUBLIC_POLYGON_RPC_URL ??
      "https://rpc.ankr.com/polygon"
  },
  {
    key: "arbitrum",
    name: "Arbitrum",
    chainId: 42161,
    symbol: "ETH",
    rpcUrl:
      process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL ??
      "https://arb1.arbitrum.io/rpc"
  }
];

const EXPLORERS: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  polygon: "https://polygonscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/"
};

const ZUM_ADDRESS = "0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5";
const ZUM_OWNER = "0x521125be95c5679539aB07582F55F0040975A047";
const POLYGON_USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const ZUM_PREMIUM_AMOUNT = "100";
const ZUM_PREMIUM_AMOUNT_RAW = ethers.parseUnits(ZUM_PREMIUM_AMOUNT, 18);
const ZUM_PREMIUM_CONTRACT =
  process.env.NEXT_PUBLIC_ZUM_PREMIUM_CONTRACT ?? "";
const ZUM_SWAP_URL = `https://app.uniswap.org/swap?chain=polygon&inputCurrency=${POLYGON_USDC_ADDRESS}&outputCurrency=${ZUM_ADDRESS}`;
const POLYGON_CHAIN_ID = 137;
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)"
];
const PREMIUM_ACCESS_ABI = [
  "function premiumPrice() view returns (uint256)",
  "function payPremium()"
];

const V3_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const V3_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const MAX_UINT128 = (BigInt(1) << BigInt(128)) - BigInt(1);
const SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_ADDRESS_TOPIC =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const V3_CHAIN_IDS: Record<V3ChainKey, number> = {
  ethereum: 1,
  arbitrum: 42161,
  polygon: 137
};

const V3_TOKENS: Record<
  V3ChainKey,
  Record<string, { address: string; decimals: number }>
> = {
  arbitrum: {
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6
    },
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18
    },
    WBTC: {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8
    },
    LINK: {
      address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      decimals: 18
    }
  },
  ethereum: {
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6
    },
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6
    },
    WETH: {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      decimals: 18
    },
    WBTC: {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      decimals: 8
    },
    XAUt: {
      address: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
      decimals: 6
    }
  },
  polygon: {
    USDC: {
      address: POLYGON_USDC_ADDRESS,
      decimals: 6
    },
    ZUM: {
      address: ZUM_ADDRESS,
      decimals: 18
    }
  }
};

const V3_POOLS: V3Pool[] = [
  {
    id: "poly-usdc-zum-10000",
    chain: "polygon",
    label: "ZUM/USDC",
    fee: 10000,
    feeLabel: "1.00%",
    token0: "USDC",
    token1: "ZUM",
    inputToken: "USDC",
    price: 10,
    tick: 299351,
    reserve: "Semilla 50 USDC + 500 ZUM",
    activity: "Seed",
    allowCreate: true
  },
  {
    id: "arb-weth-usdc-500",
    chain: "arbitrum",
    label: "WETH/USDC",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WETH",
    token1: "USDC",
    inputToken: "USDC",
    price: 1785.63,
    tick: -201445,
    reserve: "$8.85M",
    activity: "Activa"
  },
  {
    id: "arb-wbtc-usdc-500",
    chain: "arbitrum",
    label: "WBTC/USDC",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WBTC",
    token1: "USDC",
    inputToken: "USDC",
    price: 64276,
    tick: 64646,
    reserve: "$3.33M",
    activity: "Activa baja"
  },
  {
    id: "arb-usdc-link-3000",
    chain: "arbitrum",
    label: "USDC/LINK",
    fee: 3000,
    feeLabel: "0.30%",
    token0: "USDC",
    token1: "LINK",
    inputToken: "USDC",
    price: 0.1257,
    tick: 255619,
    reserve: "$3.7K",
    activity: "Watch"
  },
  {
    id: "eth-weth-usdt-500",
    chain: "ethereum",
    label: "WETH/USDT",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WETH",
    token1: "USDT",
    inputToken: "USDT",
    price: 1793.69,
    tick: -201400,
    reserve: "$6.14M",
    activity: "Saludable"
  },
  {
    id: "eth-weth-usdt-3000",
    chain: "ethereum",
    label: "WETH/USDT",
    fee: 3000,
    feeLabel: "0.30%",
    token0: "WETH",
    token1: "USDT",
    inputToken: "USDT",
    price: 1793.69,
    tick: -201400,
    reserve: "Scanner",
    activity: "Watch"
  },
  {
    id: "eth-wbtc-usdt-500",
    chain: "ethereum",
    label: "WBTC/USDT",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WBTC",
    token1: "USDT",
    inputToken: "USDT",
    price: 64051.78,
    tick: 64626,
    reserve: "Scanner",
    activity: "Watch"
  },
  {
    id: "eth-wbtc-usdt-3000",
    chain: "ethereum",
    label: "WBTC/USDT",
    fee: 3000,
    feeLabel: "0.30%",
    token0: "WBTC",
    token1: "USDT",
    inputToken: "USDT",
    price: 64051.78,
    tick: 64626,
    reserve: "Scanner",
    activity: "Watch"
  },
  {
    id: "eth-weth-usdc-500",
    chain: "ethereum",
    label: "WETH/USDC",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WETH",
    token1: "USDC",
    inputToken: "USDC",
    price: 1793.69,
    tick: -201400,
    reserve: "Scanner",
    activity: "Watch"
  },
  {
    id: "eth-weth-usdc-3000",
    chain: "ethereum",
    label: "WETH/USDC",
    fee: 3000,
    feeLabel: "0.30%",
    token0: "WETH",
    token1: "USDC",
    inputToken: "USDC",
    price: 1793.69,
    tick: -201400,
    reserve: "Scanner",
    activity: "Watch"
  },
  {
    id: "eth-wbtc-usdc-500",
    chain: "ethereum",
    label: "WBTC/USDC",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WBTC",
    token1: "USDC",
    inputToken: "USDC",
    price: 64051.78,
    tick: 64626,
    reserve: "$116K",
    activity: "Watch"
  },
  {
    id: "eth-wbtc-usdc-3000",
    chain: "ethereum",
    label: "WBTC/USDC",
    fee: 3000,
    feeLabel: "0.30%",
    token0: "WBTC",
    token1: "USDC",
    inputToken: "USDC",
    price: 64051.78,
    tick: 64626,
    reserve: "Scanner",
    activity: "Watch"
  },
  {
    id: "eth-xaut-usdt-500",
    chain: "ethereum",
    label: "XAUt/USDT",
    fee: 500,
    feeLabel: "0.05%",
    token0: "XAUt",
    token1: "USDT",
    inputToken: "USDT",
    price: 4091.16,
    tick: 83170,
    reserve: "$1.27M",
    activity: "Saludable"
  }
];

const V3_PROFILES = {
  conservative: { label: "Conservador", widthPct: 0.2 },
  moderate: { label: "Moderado", widthPct: 0.12 },
  aggressive: { label: "Riesgoso", widthPct: 0.08 }
};

const V3_POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
  "function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) payable returns (address pool)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) payable returns (uint256 amount0, uint256 amount1)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];

const V3_FACTORY_ABI = [
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)"
];

const V3_POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)"
];

const V3_SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"
];

const V3_QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOut)"
];

const DEFAULT_TOKENS: Record<string, TokenMeta[]> = {
  ethereum: [
    {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      decimals: 6
    }
  ],
  polygon: [
    {
      address: ZUM_ADDRESS,
      symbol: "ZUM",
      decimals: 18
    },
    {
      address: POLYGON_USDC_ADDRESS,
      symbol: "USDC",
      decimals: 6
    }
  ],
  arbitrum: [
    {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      symbol: "USDC",
      decimals: 6
    },
    {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      symbol: "WETH",
      decimals: 18
    }
  ]
};

initEccLib(ecc);
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

async function deriveKey(password: string, salt: ArrayBuffer) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufferToBase64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function v3TokenBySymbol(chain: V3ChainKey, symbol: string) {
  return V3_TOKENS[chain][symbol];
}

function v3TokenByAddress(chain: V3ChainKey, address: string) {
  const normalized = address.toLowerCase();
  const entry = Object.entries(V3_TOKENS[chain]).find(
    ([, token]) => token.address.toLowerCase() === normalized
  );
  if (!entry) {
    return { symbol: `${address.slice(0, 6)}...${address.slice(-4)}`, decimals: 18 };
  }
  return { symbol: entry[0], decimals: entry[1].decimals };
}

function matchV3Pool(
  chain: V3ChainKey,
  token0Address: string,
  token1Address: string,
  fee: number
) {
  const addresses = [token0Address.toLowerCase(), token1Address.toLowerCase()];
  return V3_POOLS.find((pool) => {
    if (pool.chain !== chain || pool.fee !== fee) {
      return false;
    }
    const first = v3TokenBySymbol(chain, pool.token0);
    const second = v3TokenBySymbol(chain, pool.token1);
    if (!first || !second) {
      return false;
    }
    return (
      addresses.includes(first.address.toLowerCase()) &&
      addresses.includes(second.address.toLowerCase())
    );
  });
}

function formatV3RawAmount(value: bigint, decimals: number) {
  return Number(ethers.formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: decimals <= 8 ? 6 : 8
  });
}

function formatZumAmount(value: bigint) {
  return ethers
    .formatUnits(value, 18)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function sqrtBigInt(value: bigint) {
  if (value < BigInt(0)) {
    throw new Error("sqrt only works on positive values");
  }
  if (value < BigInt(2)) {
    return value;
  }
  let x0 = value / BigInt(2);
  let x1 = (x0 + value / x0) / BigInt(2);
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) / BigInt(2);
  }
  return x0;
}

function initialSqrtPriceX96(amount0: bigint, amount1: bigint) {
  if (amount0 <= BigInt(0) || amount1 <= BigInt(0)) {
    throw new Error("Montos invalidos para inicializar la pool.");
  }
  return sqrtBigInt((amount1 << BigInt(192)) / amount0);
}

function v3Provider(chain: V3ChainKey) {
  const networkConfig = NETWORKS.find((item) => item.key === chain);
  return new ethers.JsonRpcProvider(
    networkConfig?.rpcUrl,
    V3_CHAIN_IDS[chain]
  );
}

function estimateV3ReserveUsd(pool: V3Pool, balance0: number, balance1: number) {
  if (pool.token0 === "USDC" || pool.token0 === "USDT") {
    return balance0 * 2;
  }
  if (pool.token1 === "USDC" || pool.token1 === "USDT") {
    return balance1 * 2;
  }
  return 0;
}

function classifyV3Pool(liquidity: bigint, reserveUsd: number, swaps: number) {
  if (liquidity <= BigInt(0) || reserveUsd < 1000) {
    return "No activa" as const;
  }
  if (reserveUsd >= 100000 && swaps >= 10) {
    return "Saludable" as const;
  }
  if (swaps > 0) {
    return "Activa" as const;
  }
  return "Watch" as const;
}

function deadlineSeconds() {
  return BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
}

function parseV3Amount(value: string, decimals: number) {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Monto inválido.");
  }
  return ethers.parseUnits(normalized, decimals);
}

function topicForAddress(address: string) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function extractMintedV3TokenId(
  receipt: ethers.TransactionReceipt | null,
  recipient: string
) {
  const recipientTopic = topicForAddress(recipient).toLowerCase();
  const transferLog = receipt?.logs.find((log) => {
    const topics = log.topics ?? [];
    return (
      log.address.toLowerCase() === V3_POSITION_MANAGER.toLowerCase() &&
      topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      topics[1]?.toLowerCase() === ZERO_ADDRESS_TOPIC &&
      topics[2]?.toLowerCase() === recipientTopic
    );
  });

  return transferLog?.topics[3] ? BigInt(transferLog.topics[3]).toString() : "";
}

async function encryptMnemonic(mnemonic: string, password: string) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt.buffer);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(mnemonic)
  );
  return {
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    cipher: bufferToBase64(cipher)
  };
}

async function decryptMnemonic(payload: StoredWallet, password: string) {
  const dec = new TextDecoder();
  const salt = base64ToBuffer(payload.salt);
  const iv = new Uint8Array(base64ToBuffer(payload.iv));
  const cipher = base64ToBuffer(payload.cipher);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return dec.decode(plain);
}

export default function Home() {
  const [networkKey, setNetworkKey] = useState("polygon");
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [password, setPassword] = useState("");
  const [walletMnemonic, setWalletMnemonic] = useState<string | null>(null);
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);
  const [seedConfirmed, setSeedConfirmed] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [btcBalance, setBtcBalance] = useState<string>("0");
  const [btcSendTo, setBtcSendTo] = useState("");
  const [btcAmount, setBtcAmount] = useState("");
  const [btcFeeRate, setBtcFeeRate] = useState("10");
  const [btcStatus, setBtcStatus] = useState("");
  const [evmRefreshTick, setEvmRefreshTick] = useState(0);
  const [evmMode, setEvmMode] = useState<"send" | "receive">("send");
  const [evmAssetKey, setEvmAssetKey] = useState<string>("native");
  const [btcMode, setBtcMode] = useState<"send" | "receive">("send");
  const [evmQr, setEvmQr] = useState<string | null>(null);
  const [btcQr, setBtcQr] = useState<string | null>(null);
  const [premiumPaid, setPremiumPaid] = useState(false);
  const [premiumStatus, setPremiumStatus] = useState("");
  const [checkingPremium, setCheckingPremium] = useState(false);
  const [payingPremium, setPayingPremium] = useState(false);
  const [payerAddress, setPayerAddress] = useState<string | null>(null);
  const [premiumAmount, setPremiumAmount] = useState(ZUM_PREMIUM_AMOUNT);
  const [premiumAmountRaw, setPremiumAmountRaw] = useState(
    ZUM_PREMIUM_AMOUNT_RAW
  );
  const [v3Chain, setV3Chain] = useState<V3ChainKey>("arbitrum");
  const [v3PoolId, setV3PoolId] = useState("arb-weth-usdc-500");
  const [v3Profile, setV3Profile] =
    useState<keyof typeof V3_PROFILES>("conservative");
  const [v3EntryMode, setV3EntryMode] = useState<V3EntryMode>("single");
  const [v3EntryAmount, setV3EntryAmount] = useState("100");
  const [v3ManualAmount0, setV3ManualAmount0] = useState("");
  const [v3ManualAmount1, setV3ManualAmount1] = useState("");
  const [v3Slippage, setV3Slippage] = useState("1");
  const [v3Wallet, setV3Wallet] = useState<string | null>(null);
  const [v3TokenId, setV3TokenId] = useState("");
  const [v3Positions, setV3Positions] = useState<V3Position[]>([]);
  const [v3Scans, setV3Scans] = useState<Record<string, V3ScanResult>>({});
  const [v3Scanning, setV3Scanning] = useState(false);
  const [v3Executing, setV3Executing] = useState(false);
  const [v3Status, setV3Status] = useState("");

  const network = useMemo(
    () => NETWORKS.find((item) => item.key === networkKey) ?? NETWORKS[0],
    [networkKey]
  );

  const provider = useMemo(
    () => new ethers.JsonRpcProvider(network.rpcUrl, network.chainId),
    [network]
  );

  useEffect(() => {
    if (!ZUM_PREMIUM_CONTRACT) {
      return;
    }

    const loadPremiumPrice = async () => {
      try {
        const polygonRpc =
          process.env.NEXT_PUBLIC_POLYGON_RPC_URL ?? "https://polygon-rpc.com";
        const polygonProvider = new ethers.JsonRpcProvider(
          polygonRpc,
          POLYGON_CHAIN_ID
        );
        const premium = new ethers.Contract(
          ZUM_PREMIUM_CONTRACT,
          PREMIUM_ACCESS_ABI,
          polygonProvider
        );
        const price = (await premium.premiumPrice()) as bigint;
        setPremiumAmountRaw(price);
        setPremiumAmount(formatZumAmount(price));
      } catch {
        setPremiumAmount(ZUM_PREMIUM_AMOUNT);
        setPremiumAmountRaw(ZUM_PREMIUM_AMOUNT_RAW);
      }
    };

    loadPremiumPrice();
  }, []);

  const explorerBase = EXPLORERS[networkKey] ?? EXPLORERS.polygon;
  const isLocked = !premiumPaid;
  const premiumDestination = ZUM_PREMIUM_CONTRACT || ZUM_OWNER;

  const evmAssets = useMemo<EvmAsset[]>(() => {
    const list: EvmAsset[] = [
      {
        key: "native",
        type: "native" as const,
        symbol: network.symbol,
        balance,
        decimals: 18,
        address: ""
      }
    ];
    for (const token of tokens) {
      list.push({
        key: token.address.toLowerCase(),
        type: "token" as const,
        symbol: token.symbol,
        balance: tokenBalances[token.address] ?? "0",
        decimals: token.decimals,
        address: token.address
      });
    }
    return list;
  }, [tokens, tokenBalances, network.symbol, balance]);

  const selectedAsset =
    evmAssets.find((asset) => asset.key === evmAssetKey) ?? evmAssets[0];
  const v3PoolsForChain = useMemo(
    () => V3_POOLS.filter((pool) => pool.chain === v3Chain),
    [v3Chain]
  );
  const selectedV3Pool =
    V3_POOLS.find((pool) => pool.id === v3PoolId) ??
    v3PoolsForChain[0] ??
    V3_POOLS[0];
  const selectedV3Scan = v3Scans[selectedV3Pool.id];
  const canOperateV3 =
    Boolean(selectedV3Scan) &&
    (selectedV3Scan?.status !== "No activa" ||
      (selectedV3Pool.allowCreate && v3EntryMode === "manual"));
  const effectiveV3Price = selectedV3Scan?.price ?? selectedV3Pool.price;
  const effectiveV3Tick = selectedV3Scan?.tick ?? selectedV3Pool.tick;
  const selectedV3Profile = V3_PROFILES[v3Profile];
  const v3Range = useMemo(() => {
    const spacing =
      selectedV3Pool.fee === 100
        ? 1
        : selectedV3Pool.fee === 500
          ? 10
          : selectedV3Pool.fee === 10000
            ? 200
            : 60;
    const lowerMultiplier = 1 - selectedV3Profile.widthPct;
    const upperMultiplier = 1 + selectedV3Profile.widthPct;
    const lowerTickRaw =
      effectiveV3Tick + Math.log(lowerMultiplier) / Math.log(1.0001);
    const upperTickRaw =
      effectiveV3Tick + Math.log(upperMultiplier) / Math.log(1.0001);
    return {
      lowerPrice: effectiveV3Price * lowerMultiplier,
      upperPrice: effectiveV3Price * upperMultiplier,
      lowerTick: Math.floor(lowerTickRaw / spacing) * spacing,
      upperTick: Math.ceil(upperTickRaw / spacing) * spacing
    };
  }, [effectiveV3Price, effectiveV3Tick, selectedV3Pool.fee, selectedV3Profile]);
  const v3EntryEstimate = useMemo<V3EntryEstimate>(() => {
    const slippagePct = Math.min(Math.max(Number(v3Slippage) || 0, 0), 5);
    if (v3EntryMode === "manual") {
      const manual0 = Math.max(Number(v3ManualAmount0) || 0, 0);
      const manual1 = Math.max(Number(v3ManualAmount1) || 0, 0);
      return {
        amount0: manual0,
        amount1: manual1,
        swapAmount: 0,
        minAfterSlippage: 0
      };
    }

    const inputAmount = Math.max(Number(v3EntryAmount) || 0, 0);
    const swapAmount = inputAmount / 2;
    const keptAmount = inputAmount - swapAmount;
    const minAfterSlippage = swapAmount * (1 - slippagePct / 100);
    const inputIsToken0 = selectedV3Pool.inputToken === selectedV3Pool.token0;
    return {
      amount0: inputIsToken0 ? keptAmount : swapAmount / effectiveV3Price,
      amount1: inputIsToken0 ? swapAmount * effectiveV3Price : keptAmount,
      swapAmount,
      minAfterSlippage
    };
  }, [
    effectiveV3Price,
    selectedV3Pool,
    v3EntryAmount,
    v3EntryMode,
    v3ManualAmount0,
    v3ManualAmount1,
    v3Slippage
  ]);

  useEffect(() => {
    if (!evmAssets.some((asset) => asset.key === evmAssetKey)) {
      setEvmAssetKey("native");
    }
  }, [evmAssets, evmAssetKey]);

  useEffect(() => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, TokenMeta[]>;
        const existing = parsed[networkKey] ?? [];
        const defaults = DEFAULT_TOKENS[networkKey] ?? [];
        const merged = [
          ...defaults.filter(
            (item) =>
              !existing.some(
                (token) =>
                  token.address.toLowerCase() === item.address.toLowerCase()
              )
          ),
          ...existing
        ];
        setTokens(merged);
        if (merged.length !== existing.length) {
          parsed[networkKey] = merged;
          localStorage.setItem(TOKEN_KEY, JSON.stringify(parsed));
        }
      } catch {
        setTokens([]);
      }
    } else {
      const defaults = DEFAULT_TOKENS[networkKey] ?? [];
      if (defaults.length > 0) {
        setTokens(defaults);
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ [networkKey]: defaults }));
      }
    }
  }, [networkKey]);

  useEffect(() => {
    const raw = localStorage.getItem(TX_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, TxItem[]>;
        setTxs(parsed[networkKey] ?? []);
      } catch {
        setTxs([]);
      }
    }
  }, [networkKey]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      setStatus("Wallet detectada. Desbloqueá con tu frase.");
    }
  }, []);

  useEffect(() => {
    if (!address) {
      return;
    }
    const load = async () => {
      try {
        const value = await provider.getBalance(address);
        setBalance(ethers.formatEther(value));
      } catch {
        setBalance("0");
      }
    };
    load();
  }, [address, provider, evmRefreshTick]);

  const refreshEvm = () => {
    setEvmRefreshTick((prev) => prev + 1);
  };

  useEffect(() => {
    if (!address) {
      setEvmQr(null);
      return;
    }
    QRCode.toDataURL(address, { width: 180, margin: 1 })
      .then(setEvmQr)
      .catch(() => setEvmQr(null));
  }, [address]);

  useEffect(() => {
    if (!walletMnemonic) {
      setBtcAddress(null);
      setBtcBalance("0");
      return;
    }
    try {
      const seed = bip39.mnemonicToSeedSync(walletMnemonic);
      const node = bip32.fromSeed(seed, networks.bitcoin);
      const child = node.derivePath("m/84'/0'/0'/0/0");
      const { address: btcAddr } = payments.p2wpkh({
        pubkey: child.publicKey,
        network: networks.bitcoin
      });
      setBtcAddress(btcAddr ?? null);
    } catch {
      setBtcAddress(null);
    }
  }, [walletMnemonic]);

  useEffect(() => {
    if (!btcAddress) {
      return;
    }
    const loadBtc = async () => {
      try {
        const res = await fetch(`/api/btc?address=${btcAddress}`);
        const data = await res.json();
        const funded = Number(data?.chain_stats?.funded_txo_sum ?? 0);
        const spent = Number(data?.chain_stats?.spent_txo_sum ?? 0);
        const sats = funded - spent;
        setBtcBalance((sats / 1e8).toFixed(8));
      } catch {
        setBtcBalance("0");
      }
    };
    loadBtc();
  }, [btcAddress]);

  useEffect(() => {
    if (!btcAddress) {
      setBtcQr(null);
      return;
    }
    QRCode.toDataURL(btcAddress, { width: 180, margin: 1 })
      .then(setBtcQr)
      .catch(() => setBtcQr(null));
  }, [btcAddress]);

  const checkPremium = async (targetAddress?: string) => {
    const target = targetAddress ?? payerAddress ?? address;
    if (!target) return;
    try {
      setCheckingPremium(true);
      const res = await fetch(
        `/api/zum/paid?address=${encodeURIComponent(target)}`
      );
      const data = await res.json();
      if (data?.paid) {
        setPremiumPaid(true);
        setPremiumStatus("Premium activo.");
      } else {
        setPremiumPaid(false);
        setPremiumStatus(`Bloqueado: requiere pago de ${premiumAmount} ZUM.`);
      }
    } catch {
      setPremiumPaid(false);
      setPremiumStatus("No se pudo verificar el pago.");
    } finally {
      setCheckingPremium(false);
    }
  };

  useEffect(() => {
    if (payerAddress || address) {
      checkPremium();
    } else {
      setPremiumPaid(false);
      setPremiumStatus("");
    }
  }, [address, payerAddress]);

  const refreshBtc = async () => {
    if (!btcAddress) return;
    try {
      const res = await fetch(`/api/btc?address=${btcAddress}`);
      const data = await res.json();
      const funded = Number(data?.chain_stats?.funded_txo_sum ?? 0);
      const spent = Number(data?.chain_stats?.spent_txo_sum ?? 0);
      const sats = funded - spent;
      setBtcBalance((sats / 1e8).toFixed(8));
    } catch {
      setBtcBalance("0");
    }
  };

  const handleSendBtc = async () => {
    try {
      if (!walletMnemonic) {
        setBtcStatus("Desbloqueá la wallet primero.");
        return;
      }
      if (!btcAddress) {
        setBtcStatus("No hay Dirección BTC.");
        return;
      }
      if (!btcSendTo) {
        setBtcStatus("Ingresá una Dirección destino.");
        return;
      }
      const amount = Number(btcAmount);
      const feeRate = Number(btcFeeRate);
      if (!amount || amount <= 0) {
        setBtcStatus("Monto BTC inválido.");
        return;
      }
      if (!feeRate || feeRate <= 0) {
        setBtcStatus("Fee inválida (sat/vB).");
        return;
      }

      const res = await fetch(`/api/btc/utxos?address=${btcAddress}`);
      const utxos: Array<{ txid: string; vout: number; value: number }> =
        await res.json();
      if (!utxos || utxos.length === 0) {
        setBtcStatus("Sin UTXOs disponibles.");
        return;
      }

      const seed = bip39.mnemonicToSeedSync(walletMnemonic);
      const node = bip32.fromSeed(seed, networks.bitcoin);
      const child = node.derivePath("m/84'/0'/0'/0/0");
      if (!child.privateKey) {
        setBtcStatus("No se pudo derivar la clave.");
        return;
      }

      const p2wpkh = payments.p2wpkh({
        pubkey: child.publicKey,
        network: networks.bitcoin
      });

      const targetSats = Math.round(amount * 1e8);
      const selected: typeof utxos = [];
      let total = 0;

      const estimateFee = (inputs: number, outputs: number) => {
        const vbytes = 10 + inputs * 68 + outputs * 31;
        return Math.ceil(vbytes * feeRate);
      };

      for (const utxo of utxos.sort((a, b) => b.value - a.value)) {
        selected.push(utxo);
        total += utxo.value;
        const fee = estimateFee(selected.length, 2);
        if (total >= targetSats + fee) {
          break;
        }
      }

      const feeWithChange = estimateFee(selected.length, 2);
      const feeNoChange = estimateFee(selected.length, 1);
      let change = total - targetSats - feeWithChange;
      let outputs = 2;
      const dust = 546;
      if (change < dust) {
        change = total - targetSats - feeNoChange;
        outputs = 1;
      }
      if (change < 0) {
        setBtcStatus("Fondos insuficientes para fee.");
        return;
      }

      const psbt = new Psbt({ network: networks.bitcoin });
      for (const utxo of selected) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: p2wpkh.output!,
            value: BigInt(utxo.value)
          }
        });
      }
      psbt.addOutput({ address: btcSendTo, value: BigInt(targetSats) });
      if (outputs === 2) {
        psbt.addOutput({ address: btcAddress, value: BigInt(change) });
      }

      const keyPair = ECPair.fromPrivateKey(child.privateKey, {
        network: networks.bitcoin
      });
      psbt.signAllInputs(keyPair);
      psbt.finalizeAllInputs();
      const rawTx = psbt.extractTransaction().toHex();

      const broadcast = await fetch("/api/btc/broadcast", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: rawTx
      });
      const data = await broadcast.json();
      if (!broadcast.ok) {
        setBtcStatus(`Error: ${data?.error ?? "broadcast failed"}`);
        return;
      }

      setBtcStatus(`Tx enviada: ${data.txid}`);
      setBtcSendTo("");
      setBtcAmount("");
      refreshBtc();
    } catch (error) {
      console.error(error);
      setBtcStatus("No se pudo enviar BTC.");
    }
  };

  const handleSendAllBtc = async () => {
    try {
      if (!btcAddress) return;
      const feeRate = Number(btcFeeRate);
      const res = await fetch(`/api/btc/utxos?address=${btcAddress}`);
      const utxos: Array<{ value: number }> = await res.json();
      if (!utxos || utxos.length === 0) {
        setBtcStatus("Sin UTXOs disponibles.");
        return;
      }
      const total = utxos.reduce((sum, item) => sum + item.value, 0);
      const inputs = utxos.length;
      const vbytes = 10 + inputs * 68 + 1 * 31;
      const fee = Math.ceil(vbytes * feeRate);
      const sats = total - fee;
      if (sats <= 0) {
        setBtcStatus("Saldo insuficiente para fee.");
        return;
      }
      setBtcAmount((sats / 1e8).toFixed(8));
    } catch {
      setBtcStatus("No se pudo calcular el máximo.");
    }
  };
  useEffect(() => {
    if (!address) {
      return;
    }
    const loadTxs = async () => {
      try {
        const res = await fetch(
          `/api/txs?address=${address}&network=${networkKey}`
        );
        const data = await res.json();
        if (data?.status !== "1") {
          return;
        }
        const list = (data.result as TxItem[]).slice(0, 10);
        setTxs(list);
        const raw = localStorage.getItem(TX_KEY);
        const all = raw ? (JSON.parse(raw) as Record<string, TxItem[]>) : {};
        all[networkKey] = list;
        localStorage.setItem(TX_KEY, JSON.stringify(all));
      } catch {
        // ignore
      }
    };
    loadTxs();
  }, [address, networkKey]);

  useEffect(() => {
    if (!address || tokens.length === 0) {
      setTokenBalances({});
      return;
    }
    const loadTokens = async () => {
      const entries: Record<string, string> = {};
      for (const token of tokens) {
        try {
          const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
          const bal = await contract.balanceOf(address);
          entries[token.address] = ethers.formatUnits(bal, token.decimals);
        } catch {
          entries[token.address] = "0";
        }
      }
      setTokenBalances(entries);
    };
    loadTokens();
  }, [address, provider, tokens]);

  const handleCreate = async () => {
    try {
      if (!password) {
        setStatus("Ingresá una Contraseña para cifrar la seed.");
        return;
      }
      const wallet = ethers.Wallet.createRandom();
      const phrase = wallet.mnemonic?.phrase;
      if (!phrase) {
        setStatus("No se pudo generar la seed.");
        return;
      }
      const payload = await encryptMnemonic(phrase, password);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setWalletMnemonic(phrase);
      setRevealedMnemonic(phrase);
      setSeedConfirmed(false);
      setShowSeedModal(true);
      setAddress(wallet.address);
      setStatus("Wallet creada y cifrada localmente.");
      setMnemonicInput("");
    } catch (error) {
      console.error(error);
      setStatus("Error creando la wallet.");
    }
  };

  const handleImport = async () => {
    try {
      if (!password) {
        setStatus("Ingresá una Contraseña para cifrar la seed.");
        return;
      }
      const phrase = mnemonicInput.trim().toLowerCase();
      const derived = ethers.HDNodeWallet.fromPhrase(
        phrase,
        undefined,
        "m/44'/60'/0'/0/0"
      );
      const payload = await encryptMnemonic(phrase, password);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setWalletMnemonic(phrase);
      setRevealedMnemonic(null);
      setSeedConfirmed(false);
      setAddress(derived.address);
      setStatus("Wallet importada y cifrada.");
      setMnemonicInput("");
    } catch (error) {
      console.error(error);
      setStatus("Seed inválida.");
    }
  };

  const handleUnlock = async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setStatus("No hay wallet guardada.");
        return;
      }
      if (!password) {
        setStatus("Ingresá tu Contraseña.");
        return;
      }
      const payload = JSON.parse(raw) as StoredWallet;
      const phrase = await decryptMnemonic(payload, password);
      const derived = ethers.HDNodeWallet.fromPhrase(
        phrase,
        undefined,
        "m/44'/60'/0'/0/0"
      );
      setWalletMnemonic(phrase);
      setRevealedMnemonic(null);
      setSeedConfirmed(false);
      setAddress(derived.address);
      setStatus("Wallet desbloqueada.");
    } catch (error) {
      console.error(error);
      setStatus("No se pudo desbloquear. Contraseña incorrecta.");
    }
  };

  const handleLock = () => {
    setWalletMnemonic(null);
    setRevealedMnemonic(null);
    setSeedConfirmed(false);
    setShowSeedModal(false);
    setAddress(null);
    setStatus("Wallet bloqueada.");
  };

  useEffect(() => {
    if (seedConfirmed) {
      setShowSeedModal(false);
    }
  }, [seedConfirmed]);

  const handleCopySeed = async () => {
    if (!revealedMnemonic) return;
    try {
      await navigator.clipboard.writeText(revealedMnemonic);
      setStatus("Seed copiada al portapapeles.");
    } catch {
      setStatus("No se pudo copiar la seed.");
    }
  };

  const copyToClipboard = async (value: string | null, message: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus(message);
    } catch {
      setStatus("No se pudo copiar.");
    }
  };

  const addZumToMetaMask = async () => {
    try {
      const ethereum = (window as unknown as { ethereum?: InjectedEthereum })
        .ethereum;
      if (!ethereum) {
        setStatus("MetaMask no está instalado.");
        return;
      }
      await ensurePolygonNetwork(ethereum);
      await ethereum.request({
        method: "wallet_watchAsset",
        params: [
          {
            type: "ERC20",
            options: {
              address: ZUM_ADDRESS,
              symbol: "ZUM",
              decimals: 18
            }
          }
        ]
      });
      setStatus("ZUM enviado a MetaMask para agregar.");
    } catch (error) {
      console.error(error);
      setStatus("No se pudo agregar ZUM a MetaMask.");
    }
  };

  const handleAddToken = async () => {
    try {
      const addr = tokenAddress.trim();
      if (!ethers.isAddress(addr)) {
        setStatus("Dirección de token inválida.");
        return;
      }
      const contract = new ethers.Contract(addr, ERC20_ABI, provider);
      const symbol = await contract.symbol();
      const decimals = await contract.decimals();
      const decimalsNum = Number(decimals);
      if (!Number.isFinite(decimalsNum)) {
        setStatus("No se pudo leer decimales del token.");
        return;
      }
      if (tokens.some((item) => item.address.toLowerCase() === addr.toLowerCase())) {
        setStatus("Ese token ya está agregado.");
        return;
      }
      const updated = [...tokens, { address: addr, symbol, decimals: decimalsNum }];
      setTokens(updated);
      const raw = localStorage.getItem(TOKEN_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, TokenMeta[]>) : {};
      all[networkKey] = updated;
      localStorage.setItem(TOKEN_KEY, JSON.stringify(all));
      setTokenAddress("");
      setStatus("Token importado.");
    } catch (error) {
      console.error(error);
      setStatus("No se pudo importar el token.");
    }
  };

    const handleSend = async () => {
    try {
      if (!walletMnemonic) {
        setStatus("Desbloqueá la wallet primero.");
        return;
      }
      if (!ethers.isAddress(sendTo)) {
        setStatus("Dirección destino inválida.");
        return;
      }
      const amount = Number(sendAmount);
      if (!amount || amount <= 0) {
        setStatus("Monto inválido.");
        return;
      }
      const signer = ethers.HDNodeWallet.fromPhrase(
        walletMnemonic,
        undefined,
        "m/44'/60'/0'/0/0"
      ).connect(provider);
      const selected = evmAssets.find((asset) => asset.key === evmAssetKey);
      if (!selected) {
        setStatus("Activo inválido.");
        return;
      }
      let tx;
      if (selected.type === "native") {
        tx = await signer.sendTransaction({
          to: sendTo,
          value: ethers.parseEther(amount.toString())
        });
      } else {
        const contract = new ethers.Contract(
          selected.address,
          ERC20_ABI,
          signer
        );
        const value = ethers.parseUnits(amount.toString(), selected.decimals);
        tx = await contract.transfer(sendTo, value);
      }
      setStatus("Tx enviada: " + tx.hash);
      setTimeout(() => {
        if (address) {
          fetch("/api/txs?address=" + address + "&network=" + networkKey)
            .then((res) => res.json())
            .then((data) => {
              if (data?.status !== "1") {
                return;
              }
              const list = (data.result as TxItem[]).slice(0, 10);
              setTxs(list);
              const raw = localStorage.getItem(TX_KEY);
              const all = raw ? (JSON.parse(raw) as Record<string, TxItem[]>) : {};
              all[networkKey] = list;
              localStorage.setItem(TX_KEY, JSON.stringify(all));
            })
            .catch(() => {});
        }
      }, 4000);
      setSendTo("");
      setSendAmount("");
    } catch (error) {
      console.error(error);
      setStatus("No se pudo enviar la transacción.");
    }
  };

    const handleSendAllEvm = async () => {
    try {
      const selected = evmAssets.find((asset) => asset.key === evmAssetKey);
      if (!selected) return;
      if (selected.type === "native") {
        if (!address) return;
        const bal = await provider.getBalance(address);
        const feeData = await provider.getFeeData();
        const gasLimit = BigInt(21000);
        const gasPrice =
          feeData.maxFeePerGas ?? feeData.gasPrice ?? BigInt(0);
        const fee = gasPrice * gasLimit;
        if (bal <= fee) {
          setStatus("Saldo insuficiente para fee.");
          return;
        }
        const max = bal - fee;
        setSendAmount(ethers.formatEther(max));
      } else {
        setSendAmount(selected.balance);
      }
    } catch {
      setStatus("No se pudo calcular el máximo.");
    }
  };

  const connectMetaMask = async () => {
    try {
      const ethereum = (window as unknown as { ethereum?: InjectedEthereum })
        .ethereum;
      if (!ethereum) {
        setPremiumStatus("MetaMask no está instalado.");
        return;
      }
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts"
      })) as string[];
      if (accounts?.length) {
        setPayerAddress(accounts[0]);
        setPremiumStatus("Wallet conectada. Verificá el pago.");
      }
    } catch (error) {
      console.error(error);
      setPremiumStatus("No se pudo conectar MetaMask.");
    }
  };

  const ensurePolygonNetwork = async (ethereum: InjectedEthereum) => {
    const target = `0x${POLYGON_CHAIN_ID.toString(16)}`;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target }]
      });
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code !== 4902) {
        throw error;
      }
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: target,
            chainName: "Polygon",
            nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
            rpcUrls: [
              process.env.NEXT_PUBLIC_POLYGON_RPC_URL ??
                "https://polygon-rpc.com"
            ],
            blockExplorerUrls: ["https://polygonscan.com"]
          }
        ]
      });
    }
  };

  const payPremium = async () => {
    try {
      const ethereum = (window as unknown as { ethereum?: InjectedEthereum })
        .ethereum;
      if (!ethereum) {
        setPremiumStatus("MetaMask no está instalado.");
        return;
      }

      setPayingPremium(true);
      setPremiumStatus("Preparando pago en Polygon.");
      await ensurePolygonNetwork(ethereum);

      const provider = new ethers.BrowserProvider(ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      setPayerAddress(signerAddress);

      const zum = new ethers.Contract(ZUM_ADDRESS, ERC20_ABI, signer);
      const balance = (await zum.balanceOf(signerAddress)) as bigint;
      if (balance < premiumAmountRaw) {
        setPremiumStatus(
          `Saldo insuficiente: necesitás ${premiumAmount} ZUM en Polygon.`
        );
        return;
      }

      if (ZUM_PREMIUM_CONTRACT) {
        const allowance = (await zum.allowance(
          signerAddress,
          ZUM_PREMIUM_CONTRACT
        )) as bigint;
        if (allowance < premiumAmountRaw) {
          setPremiumStatus("Aprobando ZUM para el contrato premium.");
          const approveTx = await zum.approve(
            ZUM_PREMIUM_CONTRACT,
            premiumAmountRaw
          );
          await approveTx.wait();
        }

        setPremiumStatus("Activando premium en el contrato.");
        const premium = new ethers.Contract(
          ZUM_PREMIUM_CONTRACT,
          PREMIUM_ACCESS_ABI,
          signer
        );
        const tx = await premium.payPremium();
        await tx.wait();
      } else {
        setPremiumStatus(`Enviando ${premiumAmount} ZUM al owner.`);
        const tx = await zum.transfer(ZUM_OWNER, premiumAmountRaw);
        await tx.wait();
      }

      setPremiumStatus("Pago confirmado. Verificando premium.");
      await checkPremium(signerAddress);
    } catch (error) {
      console.error(error);
      setPremiumStatus("No se pudo completar el pago premium.");
    } finally {
      setPayingPremium(false);
    }
  };

  useEffect(() => {
    const firstPool = V3_POOLS.find((pool) => pool.chain === v3Chain);
    if (firstPool && !v3PoolsForChain.some((pool) => pool.id === v3PoolId)) {
      setV3PoolId(firstPool.id);
    }
  }, [v3Chain, v3PoolId, v3PoolsForChain]);

  useEffect(() => {
    const raw = localStorage.getItem(V3_POSITION_KEY);
    if (!raw) {
      setV3Positions([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, V3Position[]>;
      const owner = v3Wallet?.toLowerCase() ?? "local";
      setV3Positions(parsed[owner] ?? []);
    } catch {
      setV3Positions([]);
    }
  }, [v3Wallet]);

  const saveV3Position = (position: V3Position, ownerAddress?: string) => {
    const owner =
      ownerAddress?.toLowerCase() ?? v3Wallet?.toLowerCase() ?? "local";
    const raw = localStorage.getItem(V3_POSITION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, V3Position[]>) : {};
    const current = parsed[owner] ?? [];
    const next = current.some((item) => item.tokenId === position.tokenId)
      ? current.map((item) =>
          item.tokenId === position.tokenId ? position : item
        )
      : [position, ...current];
    parsed[owner] = next;
    localStorage.setItem(V3_POSITION_KEY, JSON.stringify(parsed));
    setV3Positions(next);
  };

  const readV3Position = async (
    manager: ethers.Contract,
    tokenId: string,
    chain: V3ChainKey,
    recipient: string
  ): Promise<V3Position> => {
    const position = await manager.positions(tokenId);
    const token0 = v3TokenByAddress(chain, String(position.token0));
    const token1 = v3TokenByAddress(chain, String(position.token1));
    const knownPool = matchV3Pool(
      chain,
      String(position.token0),
      String(position.token1),
      Number(position.fee)
    );
    let collectible0 = BigInt(0);
    let collectible1 = BigInt(0);
    try {
      const collectible = (await manager.collect.staticCall({
        tokenId,
        recipient,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128
      })) as [bigint, bigint];
      collectible0 = collectible[0];
      collectible1 = collectible[1];
    } catch {
      collectible0 = position.tokensOwed0 as bigint;
      collectible1 = position.tokensOwed1 as bigint;
    }

    return {
      tokenId,
      chain,
      label: knownPool?.label ?? `${token0.symbol}/${token1.symbol}`,
      feeLabel: knownPool?.feeLabel ?? `${Number(position.fee) / 10000}%`,
      tickLower: Number(position.tickLower),
      tickUpper: Number(position.tickUpper),
      liquidity: position.liquidity.toString(),
      fees0: formatV3RawAmount(collectible0, token0.decimals),
      fees1: formatV3RawAmount(collectible1, token1.decimals),
      token0Symbol: token0.symbol,
      token1Symbol: token1.symbol
    };
  };

  const ensureV3Allowance = async (
    tokenAddress: string,
    spender: string,
    amount: bigint,
    signer: ethers.Signer,
    label: string
  ) => {
    if (amount <= BigInt(0)) {
      return;
    }
    const owner = await signer.getAddress();
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const current = (await token.allowance(owner, spender)) as bigint;
    if (current >= amount) {
      return;
    }
    if (current > BigInt(0)) {
      setV3Status(`Reseteando approve previo de ${label}.`);
      const resetTx = await token.approve(spender, 0);
      await resetTx.wait();
    }
    setV3Status(`Aprobando ${label}.`);
    const approveTx = await token.approve(spender, amount);
    await approveTx.wait();
  };

  const getV3Signer = async (chain: V3ChainKey = v3Chain) => {
    const ethereum = (window as unknown as { ethereum?: InjectedEthereum })
      .ethereum;
    if (!ethereum) {
      throw new Error("MetaMask no está instalado.");
    }
    const provider = new ethers.BrowserProvider(ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    const chainId = Number((await provider.getNetwork()).chainId);
    if (chainId !== V3_CHAIN_IDS[chain]) {
      const target = `0x${V3_CHAIN_IDS[chain].toString(16)}`;
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target }]
      });
    }
    const signer = await provider.getSigner();
    const signerAddress = accounts?.[0] ?? (await signer.getAddress());
    setV3Wallet(signerAddress);
    return signer;
  };

  const handleV3Connect = async () => {
    try {
      const signer = await getV3Signer();
      setV3Wallet(await signer.getAddress());
      setV3Status("MetaMask conectada para Pools V3.");
    } catch (error) {
      console.error(error);
      setV3Status(
        error instanceof Error ? error.message : "No se pudo conectar MetaMask."
      );
    }
  };

  const handleV3ScanPool = async () => {
    try {
      setV3Scanning(true);
      setV3Status(`Escaneando ${selectedV3Pool.label} en ${v3Chain}.`);
      const token0 = v3TokenBySymbol(v3Chain, selectedV3Pool.token0);
      const token1 = v3TokenBySymbol(v3Chain, selectedV3Pool.token1);
      if (!token0 || !token1) {
        setV3Status("No hay metadata completa para esa pool.");
        return;
      }

      const readProvider = v3Provider(v3Chain);
      const factory = new ethers.Contract(
        V3_FACTORY,
        V3_FACTORY_ABI,
        readProvider
      );
      const poolAddress = (await factory.getPool(
        token0.address,
        token1.address,
        selectedV3Pool.fee
      )) as string;

      if (poolAddress.toLowerCase() === ZERO_ADDRESS) {
        const result: V3ScanResult = {
          status: "No activa",
          poolAddress,
          tick: selectedV3Pool.tick,
          price: selectedV3Pool.price,
          liquidity: "0",
          reserve: "$0",
          swaps: 0,
          token0Balance: `0 ${selectedV3Pool.token0}`,
          token1Balance: `0 ${selectedV3Pool.token1}`,
          checkedAt: new Date().toLocaleTimeString()
        };
        setV3Scans((prev) => ({ ...prev, [selectedV3Pool.id]: result }));
        setV3Status("Pool no encontrada para ese par y fee.");
        return;
      }

      const poolContract = new ethers.Contract(
        poolAddress,
        V3_POOL_ABI,
        readProvider
      );
      const erc20Token0 = new ethers.Contract(
        token0.address,
        ERC20_ABI,
        readProvider
      );
      const erc20Token1 = new ethers.Contract(
        token1.address,
        ERC20_ABI,
        readProvider
      );

      const [slot0, liquidity, rawBalance0, rawBalance1, latestBlock] =
        await Promise.all([
          poolContract.slot0(),
          poolContract.liquidity() as Promise<bigint>,
          erc20Token0.balanceOf(poolAddress) as Promise<bigint>,
          erc20Token1.balanceOf(poolAddress) as Promise<bigint>,
          readProvider.getBlockNumber()
        ]);
      const tick = Number(slot0.tick);
      const price =
        selectedV3Pool.price * Math.pow(1.0001, tick - selectedV3Pool.tick);
      const balance0 = Number(ethers.formatUnits(rawBalance0, token0.decimals));
      const balance1 = Number(ethers.formatUnits(rawBalance1, token1.decimals));
      const reserveUsd = estimateV3ReserveUsd(
        selectedV3Pool,
        balance0,
        balance1
      );

      let swaps = 0;
      try {
        const fromBlock = Math.max(latestBlock - 10000, 0);
        const logs = await readProvider.getLogs({
          address: poolAddress,
          topics: [SWAP_TOPIC],
          fromBlock,
          toBlock: latestBlock
        });
        swaps = logs.length;
      } catch {
        swaps = 0;
      }

      const result: V3ScanResult = {
        status: classifyV3Pool(liquidity, reserveUsd, swaps),
        poolAddress,
        tick,
        price,
        liquidity: liquidity.toString(),
        reserve:
          reserveUsd > 0
            ? `$${reserveUsd.toLocaleString("en-US", {
                maximumFractionDigits: 0
              })}`
            : "Sin reserva USD",
        swaps,
        token0Balance: `${balance0.toLocaleString("en-US", {
          maximumFractionDigits: 6
        })} ${selectedV3Pool.token0}`,
        token1Balance: `${balance1.toLocaleString("en-US", {
          maximumFractionDigits: 6
        })} ${selectedV3Pool.token1}`,
        checkedAt: new Date().toLocaleTimeString()
      };
      setV3Scans((prev) => ({ ...prev, [selectedV3Pool.id]: result }));
      setV3Status(
        `Scanner ${result.status}: ${selectedV3Pool.label}, ${result.swaps} swaps recientes.`
      );
    } catch (error) {
      console.error(error);
      setV3Status("No se pudo actualizar el scanner de esa pool.");
    } finally {
      setV3Scanning(false);
    }
  };

  const handleV3CreatePosition = async () => {
    try {
      setV3Executing(true);
      if (!selectedV3Scan) {
        setV3Status("Actualizá el scanner antes de operar esta pool.");
        return;
      }
      const canInitializeSeedPool =
        selectedV3Pool.allowCreate && v3EntryMode === "manual";
      if (selectedV3Scan.status === "No activa" && !canInitializeSeedPool) {
        setV3Status("Scanner: pool no activa. No se crea posición.");
        return;
      }
      if (selectedV3Scan.status === "No activa" && v3EntryMode !== "manual") {
        setV3Status("Para crear una pool nueva usá modo manual dos tokens.");
        return;
      }

      const token0 = v3TokenBySymbol(v3Chain, selectedV3Pool.token0);
      const token1 = v3TokenBySymbol(v3Chain, selectedV3Pool.token1);
      if (!token0 || !token1) {
        setV3Status("Token metadata incompleta para crear posición.");
        return;
      }

      const signer = await getV3Signer(v3Chain);
      const owner = await signer.getAddress();
      const token0Contract = new ethers.Contract(token0.address, ERC20_ABI, signer);
      const token1Contract = new ethers.Contract(token1.address, ERC20_ABI, signer);
      const token0Balance = (await token0Contract.balanceOf(owner)) as bigint;
      const token1Balance = (await token1Contract.balanceOf(owner)) as bigint;
      let amount0Desired = BigInt(0);
      let amount1Desired = BigInt(0);

      if (v3EntryMode === "manual") {
        amount0Desired = parseV3Amount(v3ManualAmount0, token0.decimals);
        amount1Desired = parseV3Amount(v3ManualAmount1, token1.decimals);
        if (amount0Desired <= BigInt(0) || amount1Desired <= BigInt(0)) {
          setV3Status("Ingresá montos mayores a cero para ambos tokens.");
          return;
        }
        if (token0Balance < amount0Desired || token1Balance < amount1Desired) {
          setV3Status("Saldo insuficiente para los montos manuales.");
          return;
        }
      } else {
        const inputSymbol = selectedV3Pool.inputToken;
        const inputToken = v3TokenBySymbol(v3Chain, inputSymbol);
        if (!inputToken) {
          setV3Status("Token de entrada no configurado.");
          return;
        }
        const inputIsToken0 = inputSymbol === selectedV3Pool.token0;
        const inputTokenContract = inputIsToken0 ? token0Contract : token1Contract;
        const outputToken = inputIsToken0 ? token1 : token0;
        const outputTokenContract = inputIsToken0 ? token1Contract : token0Contract;
        const requested = parseV3Amount(v3EntryAmount, inputToken.decimals);
        const inputBalance = (await inputTokenContract.balanceOf(owner)) as bigint;
        if (requested <= BigInt(0)) {
          setV3Status("Ingresá un monto de entrada mayor a cero.");
          return;
        }
        if (inputBalance < requested) {
          setV3Status(
            `Saldo insuficiente. Tenés ${formatV3RawAmount(
              inputBalance,
              inputToken.decimals
            )} ${inputSymbol}.`
          );
          return;
        }

        const swapAmount = requested / BigInt(2);
        const keepAmount = requested - swapAmount;
        if (swapAmount <= BigInt(0) || keepAmount <= BigInt(0)) {
          setV3Status("El monto es demasiado chico para dividirlo.");
          return;
        }

        const quoter = new ethers.Contract(V3_QUOTER, V3_QUOTER_ABI, signer);
        const slippagePct = Math.min(Math.max(Number(v3Slippage) || 1, 0.1), 5);
        setV3Status("Consultando quote de Uniswap.");
        const quotedOutput = (await quoter.quoteExactInputSingle.staticCall(
          inputToken.address,
          outputToken.address,
          selectedV3Pool.fee,
          swapAmount,
          0
        )) as bigint;
        const minOutput =
          (quotedOutput * BigInt(10000 - Math.round(slippagePct * 100))) /
          BigInt(10000);

        await ensureV3Allowance(
          inputToken.address,
          V3_SWAP_ROUTER,
          swapAmount,
          signer,
          `${inputSymbol} para swap`
        );

        const outputBalanceBefore = (await outputTokenContract.balanceOf(
          owner
        )) as bigint;
        const router = new ethers.Contract(
          V3_SWAP_ROUTER,
          V3_SWAP_ROUTER_ABI,
          signer
        );
        setV3Status(`Ejecutando swap interno ${inputSymbol}.`);
        const swapTx = await router.exactInputSingle({
          tokenIn: inputToken.address,
          tokenOut: outputToken.address,
          fee: selectedV3Pool.fee,
          recipient: owner,
          deadline: deadlineSeconds(),
          amountIn: swapAmount,
          amountOutMinimum: minOutput,
          sqrtPriceLimitX96: 0
        });
        await swapTx.wait();

        const outputBalanceAfter = (await outputTokenContract.balanceOf(
          owner
        )) as bigint;
        const outputReceived = outputBalanceAfter - outputBalanceBefore;
        if (outputReceived <= BigInt(0)) {
          setV3Status("El swap no dejó saldo nuevo para el segundo token.");
          return;
        }
        amount0Desired = inputIsToken0 ? keepAmount : outputReceived;
        amount1Desired = inputIsToken0 ? outputReceived : keepAmount;
      }

      const manager = new ethers.Contract(
        V3_POSITION_MANAGER,
        V3_POSITION_MANAGER_ABI,
        signer
      );

      if (canInitializeSeedPool) {
        const sqrtPriceX96 = initialSqrtPriceX96(
          amount0Desired,
          amount1Desired
        );
        setV3Status(
          `Inicializando pool ${selectedV3Pool.label} si es necesario.`
        );
        const initTx = await manager.createAndInitializePoolIfNecessary(
          token0.address,
          token1.address,
          selectedV3Pool.fee,
          sqrtPriceX96
        );
        await initTx.wait();
      }

      await ensureV3Allowance(
        token0.address,
        V3_POSITION_MANAGER,
        amount0Desired,
        signer,
        `${selectedV3Pool.token0} para mint`
      );
      await ensureV3Allowance(
        token1.address,
        V3_POSITION_MANAGER,
        amount1Desired,
        signer,
        `${selectedV3Pool.token1} para mint`
      );

      setV3Status("Enviando mint al Position Manager.");
      const mintTx = await manager.mint({
        token0: token0.address,
        token1: token1.address,
        fee: selectedV3Pool.fee,
        tickLower: v3Range.lowerTick,
        tickUpper: v3Range.upperTick,
        amount0Desired,
        amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: owner,
        deadline: deadlineSeconds()
      });
      const receipt = await mintTx.wait();
      const mintedTokenId = extractMintedV3TokenId(receipt, owner);
      if (mintedTokenId) {
        const position = await readV3Position(
          manager,
          mintedTokenId,
          v3Chain,
          owner
        );
        saveV3Position(position, owner);
      }
      setV3Status(
        mintedTokenId
          ? `NFT #${mintedTokenId} creado. Mint: ${mintTx.hash.slice(0, 10)}...`
          : `Mint confirmado: ${mintTx.hash.slice(0, 10)}...`
      );
    } catch (error) {
      console.error(error);
      setV3Status(
        error instanceof Error
          ? `No se pudo crear la posición: ${error.message}`
          : "No se pudo crear la posición."
      );
    } finally {
      setV3Executing(false);
    }
  };

  const handleV3ImportPosition = async () => {
    try {
      const tokenId = v3TokenId.trim();
      if (!tokenId) {
        setV3Status("Ingresá el tokenId del NFT.");
        return;
      }
      const signer = await getV3Signer();
      const owner = await signer.getAddress();
      const manager = new ethers.Contract(
        V3_POSITION_MANAGER,
        V3_POSITION_MANAGER_ABI,
        signer
      );
      const nftOwner = await manager.ownerOf(tokenId);
      if (String(nftOwner).toLowerCase() !== owner.toLowerCase()) {
        setV3Status("Ese NFT no pertenece a la wallet conectada.");
        return;
      }
      const saved = await readV3Position(manager, tokenId, v3Chain, owner);
      saveV3Position(saved, owner);
      setV3Status(`NFT #${tokenId} agregado a tus posiciones.`);
      setV3TokenId("");
    } catch (error) {
      console.error(error);
      setV3Status("No se pudo leer ese NFT en la red seleccionada.");
    }
  };

  const handleV3RefreshPositions = async () => {
    try {
      const signer = await getV3Signer();
      const owner = await signer.getAddress();
      const manager = new ethers.Contract(
        V3_POSITION_MANAGER,
        V3_POSITION_MANAGER_ABI,
        signer
      );
      const refreshed: V3Position[] = [];
      for (const item of v3Positions) {
        if (item.chain !== v3Chain) {
          refreshed.push(item);
          continue;
        }
        refreshed.push(
          await readV3Position(manager, item.tokenId, item.chain, owner)
        );
      }
      const ownerKey = owner.toLowerCase();
      const raw = localStorage.getItem(V3_POSITION_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, V3Position[]>) : {};
      parsed[ownerKey] = refreshed;
      localStorage.setItem(V3_POSITION_KEY, JSON.stringify(parsed));
      setV3Positions(refreshed);
      setV3Status("Posiciones actualizadas.");
    } catch (error) {
      console.error(error);
      setV3Status("No se pudieron actualizar las posiciones.");
    }
  };

  const handleV3Collect = async (position: V3Position) => {
    try {
      setV3Chain(position.chain);
      const signer = await getV3Signer(position.chain);
      const recipient = await signer.getAddress();
      const manager = new ethers.Contract(
        V3_POSITION_MANAGER,
        V3_POSITION_MANAGER_ABI,
        signer
      );
      const tx = await manager.collect({
        tokenId: position.tokenId,
        recipient,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128
      });
      setV3Status(`Collect enviado: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      saveV3Position(
        await readV3Position(manager, position.tokenId, position.chain, recipient),
        recipient
      );
      setV3Status(`Fees cobradas del NFT #${position.tokenId}.`);
    } catch (error) {
      console.error(error);
      setV3Status("No se pudieron cobrar las fees.");
    }
  };

  const handleV3Withdraw = async (position: V3Position) => {
    try {
      setV3Chain(position.chain);
      const signer = await getV3Signer(position.chain);
      const recipient = await signer.getAddress();
      const manager = new ethers.Contract(
        V3_POSITION_MANAGER,
        V3_POSITION_MANAGER_ABI,
        signer
      );
      const live = await manager.positions(position.tokenId);
      const liquidity = live.liquidity;
      if (liquidity <= BigInt(0)) {
        setV3Status("La posición ya no tiene liquidez activa.");
        return;
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      const removeTx = await manager.decreaseLiquidity({
        tokenId: position.tokenId,
        liquidity,
        amount0Min: 0,
        amount1Min: 0,
        deadline
      });
      setV3Status(`Retiro enviado: ${removeTx.hash.slice(0, 10)}...`);
      await removeTx.wait();
      const collectTx = await manager.collect({
        tokenId: position.tokenId,
        recipient,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128
      });
      await collectTx.wait();
      saveV3Position(
        await readV3Position(manager, position.tokenId, position.chain, recipient),
        recipient
      );
      setV3Status(`Posición NFT #${position.tokenId} retirada y cobrada.`);
    } catch (error) {
      console.error(error);
      setV3Status("No se pudo retirar la posición.");
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.brandCenter}>
          <img
            className={styles.brandLogo}
            src="/zumnova-logo.svg"
            alt="Zumnova"
          />
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.kicker}>Zumpay Wallet</p>
            <h1>Tu billetera cripto privada para BTC, ETH y redes EVM.</h1>
            <p className={styles.subtitle}>
              No-custodial, multi-red y enfocada en simplicidad. Importá solo los
              tokens que quieras ver y movete con total control.
            </p>
            <div className={styles.trust}>
              <span>Seed local cifrada</span>
              <span>Sin servidores custodios</span>
              <span>Soporte EVM + BTC</span>
            </div>
          </div>

          <div className={styles.heroMark}>
            <div className={styles.zRing}>
              <div className={styles.zCore}>
                <img
                  className={styles.zLogo}
                  src="/zumpay-logo.png"
                  alt="ZumPay logo"
                />
              </div>
            </div>
            <div className={styles.heroLogo}>
              <span>ZUM</span>
              <span className={styles.heroLogoAccent}>PAY</span>
            </div>
          </div>
        </section>

        <section className={styles.zumPublic}>
          <div className={styles.zumIntro}>
            <p className={styles.kicker}>ZUM Token</p>
            <h2>Token oficial de Zumpay en Polygon</h2>
            <p className={styles.subtitle}>
              ZUM opera en Polygon con contrato verificado y pool pública
              ZUM/USDC. Usá siempre el contrato oficial y USDC nativo de
              Polygon para evitar confusiones.
            </p>
          </div>
          <div className={styles.zumGrid}>
            <div className={styles.zumCard}>
              <span>Contrato ZUM</span>
              <strong>ZUM · Polygon</strong>
              <code>{ZUM_ADDRESS}</code>
              <div className={styles.zumActions}>
                <button
                  className={styles.softButton}
                  onClick={() =>
                    copyToClipboard(ZUM_ADDRESS, "Contrato ZUM copiado.")
                  }
                >
                  Copiar ZUM
                </button>
                <a
                  className={styles.softLink}
                  href={`https://polygonscan.com/token/${ZUM_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Polygonscan
                </a>
              </div>
            </div>
            <div className={styles.zumCard}>
              <span>Pool oficial</span>
              <strong>ZUM/USDC · Uniswap V3</strong>
              <p>
                Usar USDC nativo en Polygon. Precio inicial de referencia:
                0.10 USDC por ZUM.
              </p>
              <div className={styles.zumActions}>
                <button
                  className={styles.softButton}
                  onClick={() =>
                    copyToClipboard(
                      POLYGON_USDC_ADDRESS,
                      "Contrato USDC Polygon copiado."
                    )
                  }
                >
                  Copiar USDC
                </button>
                <a
                  className={styles.softLink}
                  href={ZUM_SWAP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Comprar ZUM
                </a>
                <a
                  className={styles.softLink}
                  href={`https://app.uniswap.org/explore/tokens/polygon/${ZUM_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver mercado
                </a>
              </div>
            </div>
            <div className={styles.zumCard}>
              <span>Seguridad</span>
              <strong>Verificá antes de operar</strong>
              <p>
                Red: Polygon. Token: ZUM. Par recomendado: ZUM/USDC con USDC
                nativo. No uses contratos copiados de fuentes no oficiales.
              </p>
              <div className={styles.zumActions}>
                <button className={styles.softButton} onClick={addZumToMetaMask}>
                  Agregar ZUM
                </button>
              </div>
            </div>
          </div>
        </section>


        <section
          className={`${styles.sectionBlock} ${
            isLocked ? styles.sectionLocked : ""
          }`}
        >
          <div>
            <h2>Actividad</h2>
            <p className={styles.subtitle}>
              Últimas transacciones en la red seleccionada.
            </p>
          </div>
          {isLocked ? (
            <div className={styles.lockOverlay}>
              <p>Wallet bloqueada. Pagá {premiumAmount} ZUM para desbloquear.</p>
            </div>
          ) : null}
          <div className={styles.sectionGrid}>
            <div className={styles.walletCard}>
              <h3>Últimas transacciones</h3>
              <div className={styles.txList}>
                {txs.length === 0 ? (
                  <p className={styles.muted}>Sin movimientos recientes.</p>
                ) : (
                  txs.map((tx) => {
                    const isOutgoing =
                      address &&
                      tx.from.toLowerCase() === address.toLowerCase();
                    const dirLabel = isOutgoing ? "Salida" : "Entrada";
                    const timestamp = new Date(
                      Number(tx.timeStamp) * 1000
                    ).toLocaleString();
                    return (
                      <a
                        key={tx.hash}
                        className={styles.txRow}
                        href={`${explorerBase}${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <div>
                          <p className={styles.txHash}>
                            {tx.hash.slice(0, 10)}...
                          </p>
                          <p className={styles.txMeta}>
                            {tx.from.slice(0, 6)} → {tx.to.slice(0, 6)}
                          </p>
                          <p className={styles.txTime}>{timestamp}</p>
                        </div>
                        <div className={styles.txRight}>
                          <span
                            className={
                              isOutgoing ? styles.txOut : styles.txIn
                            }
                          >
                            {dirLabel}
                          </span>
                          <span className={styles.txValue}>
                            {ethers.formatEther(tx.value)} {network.symbol}
                          </span>
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

                <section className={styles.sectionBlock}>
          <div>
            <h2>Activar premium</h2>
            <p className={styles.subtitle}>
              Para usar la wallet necesitás pagar una única vez{" "}
              <strong>{premiumAmount} ZUM</strong>.
            </p>
          </div>
          <div className={styles.sectionGrid}>
            <div className={styles.walletCard}>
              <h3>Estado</h3>
              <p className={styles.premiumStatus}>
                {checkingPremium ? "Verificando..." : premiumStatus || "—"}
              </p>
              <div className={styles.field}>
                <label>Tu wallet de pago</label>
                <div className={styles.address}>
                  {payerAddress ?? "Conectá MetaMask para pagar"}
                </div>
              </div>
              <div className={styles.ctas}>
                <button className={styles.outline} onClick={connectMetaMask}>
                  Conectar MetaMask
                </button>
                <a
                  className={styles.outline}
                  href={ZUM_SWAP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Comprar ZUM
                </a>
                <button
                  className={styles.primary}
                  onClick={payPremium}
                  disabled={payingPremium || checkingPremium}
                >
                  {payingPremium ? "Pagando..." : `Pagar ${premiumAmount} ZUM`}
                </button>
                <button className={styles.outline} onClick={() => checkPremium()}>
                  Verificar pago
                </button>
              </div>
              <div className={styles.stepList}>
                <div>
                  <span>1</span>
                  <p>Importá el token ZUM en MetaMask.</p>
                </div>
                <div>
                  <span>2</span>
                  <p>
                    Pagá {premiumAmount} ZUM desde Polygon.
                  </p>
                </div>
                <div>
                  <span>3</span>
                  <p>Volvé y tocá “Verificar pago”.</p>
                </div>
              </div>
              <div className={styles.ctas}>
                <button
                  className={styles.softButton}
                  onClick={() =>
                    copyToClipboard(
                      premiumDestination,
                      "Dirección de pago copiada."
                    )
                  }
                >
                  Copiar dirección de pago
                </button>
                <button
                  className={styles.softButton}
                  onClick={() =>
                    copyToClipboard(ZUM_ADDRESS, "Contrato ZUM copiado.")
                  }
                >
                  Copiar contrato ZUM
                </button>
              </div>
              <div className={styles.paymentMeta}>
                <div>
                  <span>Red</span>
                  <strong>Polygon</strong>
                </div>
                <div>
                  <span>Destino</span>
                  <strong>
                    {premiumDestination.slice(0, 6)}...
                    {premiumDestination.slice(-4)}
                  </strong>
                </div>
                <div>
                  <span>Token</span>
                  <strong>ZUM</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <div>
            <h2>Seguridad</h2>
            <p className={styles.subtitle}>
              Gestioná tu seed y la contraseña de bloqueo local.
            </p>
          </div>
          <div className={styles.sectionGrid}>
            <div className={styles.walletCard}>
              <h3>Crear / Traer billetera</h3>
              <div className={styles.field}>
                <label>Contraseña de bloqueo</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tu frase de desbloqueo"
                />
              </div>
              <div className={styles.field}>
                <label>Seed (12/24 palabras)</label>
                <textarea
                  value={mnemonicInput}
                  onChange={(event) => setMnemonicInput(event.target.value)}
                  placeholder="Pegá tu seed para traer tu billetera"
                />
              </div>
              {revealedMnemonic ? (
                <div className={styles.seedBox}>
                  <p className={styles.seedTitle}>Tu seed generada</p>
                  <p className={styles.seedValue}>{revealedMnemonic}</p>
                  <div className={styles.ctas}>
                    <button className={styles.primary} onClick={handleCopySeed}>
                      Copiar seed
                    </button>
                  </div>
                  <label className={styles.seedCheck}>
                    <input
                      type="checkbox"
                      checked={seedConfirmed}
                      onChange={(event) => setSeedConfirmed(event.target.checked)}
                    />
                    <span>
                      Confirmo que guardé mi seed. Si la pierdo, no podré recuperar
                      la wallet.
                    </span>
                  </label>
                  <p className={styles.seedHint}>
                    Guardala offline. Si la perdés, no podrás recuperar la wallet.
                  </p>
                </div>
              ) : null}
              <div className={styles.ctas}>
                <button className={styles.primary} onClick={handleCreate}>
                  Crear nueva
                </button>
                <button className={styles.outline} onClick={handleImport}>
                  Traer mi billetera
                </button>
              </div>
              <div className={styles.ctas}>
                <button className={styles.ghost} onClick={handleUnlock}>
                  Abrir billetera
                </button>
                <button className={styles.outline} onClick={handleLock}>
                  Cerrar billetera
                </button>
              </div>
              <p className={styles.status}>{status}</p>
            </div>
          </div>
        </section>

        <section
          className={`${styles.walletSection} ${
            isLocked ? styles.sectionLocked : ""
          }`}
        >
          <div>
            <h2>Mis cuentas</h2>
            <p className={styles.subtitle}>
              Direcciones y balances por red. Enviá o recibí en segundos.
            </p>
          </div>
          {isLocked ? (
            <div className={styles.lockOverlay}>
              <p>Wallet bloqueada. Pagá {premiumAmount} ZUM para desbloquear.</p>
            </div>
          ) : null}

          <div className={styles.walletGrid}>
            <div className={styles.walletCard}>
              <h3>Cuenta EVM</h3>
              <div className={styles.field}>
                <label>Red</label>
                <select
                  value={networkKey}
                  onChange={(event) => setNetworkKey(event.target.value)}
                >
                  {NETWORKS.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Dirección</label>
                <div className={styles.address}>{address ?? "—"}</div>
              </div>
              <div className={styles.balanceRow}>
                <div>
                  <p className={styles.label}>Balance</p>
                  <h4>
                    {balance} {network.symbol}
                  </h4>
                </div>
                <button
                  className={styles.ghost}
                  onClick={refreshEvm}
                >
                  Refresh
                </button>
              </div>
              <div className={styles.assetList}>
                {evmAssets.map((asset) => (
                  <div key={asset.key} className={styles.assetRow}>
                    <span>{asset.symbol}</span>
                    <span>{asset.balance}</span>
                  </div>
                ))}
              </div>
              <div className={styles.field}>
                <label>Agregar token ERC-20</label>
                <input
                  value={tokenAddress}
                  onChange={(event) => setTokenAddress(event.target.value)}
                  placeholder="0x..."
                />
                <button
                  className={styles.outline}
                  onClick={handleAddToken}
                  disabled={isLocked}
                >
                  Agregar token
                </button>
              </div>
              <div className={styles.modeSwitch}>
                <button
                  className={
                    evmMode === "send" ? styles.modeActive : styles.modeButton
                  }
                  onClick={() => setEvmMode("send")}
                >
                  Enviar
                </button>
                <button
                  className={
                    evmMode === "receive" ? styles.modeActive : styles.modeButton
                  }
                  onClick={() => setEvmMode("receive")}
                >
                  Recibir
                </button>
              </div>
              {evmMode === "receive" ? (
                <div className={styles.receivePanel}>
                  {evmQr ? (
                    <img className={styles.qr} src={evmQr} alt="QR EVM" />
                  ) : null}
                  <p className={styles.muted}>Usá esta dirección para POL/ETH y tokens EVM.</p>
                  <button
                    className={styles.outline}
                    onClick={() =>
                      copyToClipboard(address, "Dirección EVM copiada.")
                    }
                  >
                    Copiar Dirección
                  </button>
                </div>
              ) : (
                <div className={styles.field}>
                                    <label>Enviar</label>
                  <select
                    value={evmAssetKey}
                    onChange={(event) => setEvmAssetKey(event.target.value)}
                  >
                    {evmAssets.map((asset) => (
                      <option key={asset.key} value={asset.key}>
                        {asset.symbol}
                      </option>
                    ))}
                  </select>
                  <input
                    value={sendTo}
                    onChange={(event) => setSendTo(event.target.value)}
                    placeholder="0x..."
                  />
                  <input
                    value={sendAmount}
                    onChange={(event) => setSendAmount(event.target.value)}
                    placeholder={`Monto en ${selectedAsset.symbol}`}
                  />
                  <div className={styles.ctas}>
                    <button
                      className={styles.outline}
                      onClick={handleSendAllEvm}
                      disabled={isLocked}
                    >
                      Enviar todo
                    </button>
                    <button
                      className={`${styles.primary} ${
                        isLocked || (revealedMnemonic && !seedConfirmed)
                          ? styles.disabled
                          : ""
                      }`}
                      onClick={handleSend}
                      disabled={
                        isLocked || (Boolean(revealedMnemonic) && !seedConfirmed)
                      }
                    >
                      ENVIAR
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.walletCard}>
              <h3>Cuenta BTC</h3>
              <div className={styles.field}>
                <label>Dirección Bech32</label>
                <div className={styles.address}>{btcAddress ?? "—"}</div>
              </div>
              <div className={styles.balanceRow}>
                <div>
                  <p className={styles.label}>Balance</p>
                  <h4>{btcBalance} BTC</h4>
                </div>
                <button
                  className={styles.ghost}
                  onClick={refreshBtc}
                >
                  Refresh
                </button>
              </div>
              <div className={styles.modeSwitch}>
                <button
                  className={
                    btcMode === "send" ? styles.modeActive : styles.modeButton
                  }
                  onClick={() => setBtcMode("send")}
                >
                  Enviar
                </button>
                <button
                  className={
                    btcMode === "receive" ? styles.modeActive : styles.modeButton
                  }
                  onClick={() => setBtcMode("receive")}
                >
                  Recibir
                </button>
              </div>
              {btcMode === "receive" ? (
                <div className={styles.receivePanel}>
                  {btcQr ? (
                    <img className={styles.qr} src={btcQr} alt="QR BTC" />
                  ) : null}
                  <p className={styles.muted}>Usá esta dirección para POL/ETH y tokens EVM.</p>
                  <button
                    className={styles.outline}
                    onClick={() =>
                      copyToClipboard(btcAddress, "Dirección BTC copiada.")
                    }
                  >
                    Copiar Dirección
                  </button>
                </div>
              ) : (
                <div className={styles.field}>
                  <label>Enviar BTC</label>
                  <input
                    value={btcSendTo}
                    onChange={(event) => setBtcSendTo(event.target.value)}
                    placeholder="bc1..."
                  />
                  <input
                    value={btcAmount}
                    onChange={(event) => setBtcAmount(event.target.value)}
                    placeholder="Monto en BTC"
                  />
                  <input
                    value={btcFeeRate}
                    onChange={(event) => setBtcFeeRate(event.target.value)}
                    placeholder="Fee sat/vB"
                  />
                  <div className={styles.ctas}>
                    <button
                      className={styles.outline}
                      onClick={handleSendAllBtc}
                      disabled={isLocked}
                    >
                      Enviar todo
                    </button>
                    <button
                      className={`${styles.primary} ${
                        isLocked || (revealedMnemonic && !seedConfirmed)
                          ? styles.disabled
                          : ""
                      }`}
                      onClick={handleSendBtc}
                      disabled={
                        isLocked || (Boolean(revealedMnemonic) && !seedConfirmed)
                      }
                    >
                      Enviar BTC
                    </button>
                  </div>
                  {btcStatus ? (
                    <p className={styles.status}>{btcStatus}</p>
                  ) : null}
                </div>
              )}
            </div>

          </div>
        </section>

        <section
          className={`${styles.sectionBlock} ${
            isLocked ? styles.sectionLocked : ""
          }`}
        >
          <div>
            <h2>Pools V3</h2>
            <p className={styles.subtitle}>
              Seguimiento y gestión de posiciones Uniswap V3 con MetaMask.
            </p>
          </div>
          {isLocked ? (
            <div className={styles.lockOverlay}>
              <p>Wallet bloqueada. Pagá {premiumAmount} ZUM para desbloquear.</p>
            </div>
          ) : null}
          <div className={styles.sectionGrid}>
            <div className={styles.walletCard}>
              <h3>Preparar rango</h3>
              <div className={styles.field}>
                <label>Red</label>
                <select
                  value={v3Chain}
                  onChange={(event) => setV3Chain(event.target.value as V3ChainKey)}
                >
                  <option value="arbitrum">Arbitrum</option>
                  <option value="ethereum">Ethereum</option>
                  <option value="polygon">Polygon</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Pool</label>
                <select
                  value={selectedV3Pool.id}
                  onChange={(event) => setV3PoolId(event.target.value)}
                >
                  {v3PoolsForChain.map((pool) => (
                    <option key={pool.id} value={pool.id}>
                      {pool.label} · {pool.feeLabel} · {pool.activity} ·{" "}
                      {pool.reserve}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Perfil</label>
                <select
                  value={v3Profile}
                  onChange={(event) =>
                    setV3Profile(event.target.value as keyof typeof V3_PROFILES)
                  }
                >
                  {Object.entries(V3_PROFILES).map(([key, profile]) => (
                    <option key={key} value={key}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Modo de entrada</label>
                <select
                  value={v3EntryMode}
                  onChange={(event) =>
                    setV3EntryMode(event.target.value as V3EntryMode)
                  }
                >
                  <option value="single">Un token + swap interno</option>
                  <option value="manual">Manual dos tokens</option>
                </select>
              </div>
              {v3EntryMode === "single" ? (
                <div className={styles.field}>
                  <label>Monto de entrada ({selectedV3Pool.inputToken})</label>
                  <input
                    value={v3EntryAmount}
                    onChange={(event) => setV3EntryAmount(event.target.value)}
                    placeholder={`Monto en ${selectedV3Pool.inputToken}`}
                    inputMode="decimal"
                  />
                </div>
              ) : (
                <div className={styles.v3ManualGrid}>
                  <div className={styles.field}>
                    <label>Monto {selectedV3Pool.token0}</label>
                    <input
                      value={v3ManualAmount0}
                      onChange={(event) =>
                        setV3ManualAmount0(event.target.value)
                      }
                      placeholder={`Monto en ${selectedV3Pool.token0}`}
                      inputMode="decimal"
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Monto {selectedV3Pool.token1}</label>
                    <input
                      value={v3ManualAmount1}
                      onChange={(event) =>
                        setV3ManualAmount1(event.target.value)
                      }
                      placeholder={`Monto en ${selectedV3Pool.token1}`}
                      inputMode="decimal"
                    />
                  </div>
                </div>
              )}
              <div className={styles.field}>
                <label>Slippage máximo (%)</label>
                <input
                  value={v3Slippage}
                  onChange={(event) => setV3Slippage(event.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                />
              </div>
              <div className={styles.ctas}>
                <button
                  className={styles.outline}
                  onClick={handleV3ScanPool}
                  disabled={isLocked || v3Scanning}
                >
                  {v3Scanning ? "Actualizando..." : "Actualizar scanner"}
                </button>
                <button
                  className={styles.primary}
                  onClick={handleV3CreatePosition}
                  disabled={
                    isLocked ||
                    v3Executing ||
                    !canOperateV3
                  }
                >
                  {v3Executing ? "Operando..." : "Operar / Crear posición"}
                </button>
              </div>
              <div className={styles.v3MetricGrid}>
                <div>
                  <span>Precio actual</span>
                  <strong>
                    {effectiveV3Price.toLocaleString("en-US", {
                      maximumFractionDigits: 4
                    })}
                  </strong>
                </div>
                <div>
                  <span>Rango precio</span>
                  <strong>
                    {v3Range.lowerPrice.toLocaleString("en-US", {
                      maximumFractionDigits: 2
                    })}{" "}
                    /{" "}
                    {v3Range.upperPrice.toLocaleString("en-US", {
                      maximumFractionDigits: 2
                    })}
                  </strong>
                </div>
                <div>
                  <span>Ticks</span>
                  <strong>
                    {v3Range.lowerTick} / {v3Range.upperTick}
                  </strong>
                </div>
                <div>
                  <span>Scanner</span>
                  <strong>
                    {selectedV3Scan
                      ? `${selectedV3Scan.status} · ${selectedV3Scan.reserve}`
                      : `${selectedV3Pool.reserve} · ${selectedV3Pool.activity}`}
                  </strong>
                </div>
                <div>
                  <span>Swaps recientes</span>
                  <strong>
                    {selectedV3Scan
                      ? `${selectedV3Scan.swaps} · ${selectedV3Scan.checkedAt}`
                      : "Sin actualizar"}
                  </strong>
                </div>
                <div>
                  <span>Balances pool</span>
                  <strong>
                    {selectedV3Scan
                      ? `${selectedV3Scan.token0Balance} / ${selectedV3Scan.token1Balance}`
                      : "Pendiente"}
                  </strong>
                </div>
                <div>
                  <span>Entrada estimada</span>
                  <strong>
                    {v3EntryEstimate.amount0.toLocaleString("en-US", {
                      maximumFractionDigits: 8
                    })}{" "}
                    {selectedV3Pool.token0} +{" "}
                    {v3EntryEstimate.amount1.toLocaleString("en-US", {
                      maximumFractionDigits: 6
                    })}{" "}
                    {selectedV3Pool.token1}
                  </strong>
                </div>
                <div>
                  <span>Swap interno</span>
                  <strong>
                    {v3EntryMode === "single"
                      ? `${v3EntryEstimate.swapAmount.toLocaleString("en-US", {
                          maximumFractionDigits: 6
                        })} ${selectedV3Pool.inputToken}`
                      : "Sin swap"}
                  </strong>
                </div>
                <div>
                  <span>Mínimo con slippage</span>
                  <strong>
                    {v3EntryMode === "single"
                      ? `${v3EntryEstimate.minAfterSlippage.toLocaleString(
                          "en-US",
                          { maximumFractionDigits: 6 }
                        )} ${selectedV3Pool.inputToken}`
                      : "No aplica"}
                  </strong>
                </div>
              </div>
              <p className={styles.muted}>
                Entrada pensada: {selectedV3Pool.inputToken}. Estos campos
                dejan preparada la ejecución; el mint real queda para conectar
                approvals, swap y NonfungiblePositionManager en la siguiente
                fase.
              </p>
            </div>

            <div className={styles.walletCard}>
              <h3>Mis posiciones V3</h3>
              <div className={styles.field}>
                <label>Wallet MetaMask</label>
                <div className={styles.address}>{v3Wallet ?? "—"}</div>
              </div>
              <div className={styles.ctas}>
                <button
                  className={styles.outline}
                  onClick={handleV3Connect}
                  disabled={isLocked}
                >
                  Conectar MetaMask
                </button>
                <button
                  className={styles.outline}
                  onClick={handleV3RefreshPositions}
                  disabled={isLocked || v3Positions.length === 0}
                >
                  Leer estado
                </button>
              </div>
              <div className={styles.field}>
                <label>Agregar NFT existente</label>
                <input
                  value={v3TokenId}
                  onChange={(event) => setV3TokenId(event.target.value)}
                  placeholder="TokenId NFT"
                />
                <button
                  className={styles.primary}
                  onClick={handleV3ImportPosition}
                  disabled={isLocked}
                >
                  Agregar NFT
                </button>
              </div>
              <div className={styles.v3PositionList}>
                {v3Positions.length === 0 ? (
                  <p className={styles.muted}>
                    Todavía no hay NFTs guardados para esta MetaMask.
                  </p>
                ) : (
                  v3Positions.map((position) => (
                    <div key={`${position.chain}-${position.tokenId}`} className={styles.v3Position}>
                      <div>
                        <p className={styles.txHash}>NFT #{position.tokenId}</p>
                        <p className={styles.txMeta}>
                          {position.label} · {position.feeLabel} ·{" "}
                          {position.chain}
                        </p>
                        <p className={styles.txTime}>
                          Liquidez: {position.liquidity} · Rango:{" "}
                          {position.tickLower} / {position.tickUpper}
                        </p>
                        <p className={styles.txTime}>
                          Fees cobrables: {position.fees0 ?? "0"}{" "}
                          {position.token0Symbol ?? "token0"} /{" "}
                          {position.fees1 ?? "0"}{" "}
                          {position.token1Symbol ?? "token1"}
                        </p>
                      </div>
                      <div className={styles.v3Actions}>
                        <button
                          className={styles.outline}
                          onClick={() => handleV3Collect(position)}
                          disabled={isLocked}
                        >
                          Collect fees
                        </button>
                        <button
                          className={styles.outline}
                          onClick={() => handleV3Withdraw(position)}
                          disabled={isLocked || position.liquidity === "0"}
                        >
                          Retirar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {v3Status ? <p className={styles.status}>{v3Status}</p> : null}
            </div>
          </div>
        </section>

        <section className={styles.networks}>
          <div>
            <h2>Redes soportadas</h2>
            <p>
              Ethereum, Polygon, y redes compatibles EVM. Próximo: Lightning y
              más L2s.
            </p>
          </div>
          <div className={styles.chips}>
            <span>Ethereum</span>
            <span>Polygon</span>
            <span>Arbitrum</span>
            <span>Optimism</span>
            <span>Base</span>
            <span>BTC Native</span>
          </div>
        </section>
      </main>
      {showSeedModal ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h3>Guardá tu seed</h3>
            <p>
              Esta frase es la única forma de recuperar tu wallet. Si la perdés,
              nadie puede ayudarte.
            </p>
            <label className={styles.seedCheck}>
              <input
                type="checkbox"
                checked={seedConfirmed}
                onChange={(event) => setSeedConfirmed(event.target.checked)}
              />
              <span>Confirmo que guardé mi seed en un lugar seguro.</span>
            </label>
            <div className={styles.ctas}>
              <button
                className={styles.primary}
                onClick={() => setSeedConfirmed(true)}
              >
                Entendido
              </button>
              <button
                className={styles.outline}
                onClick={() => setShowSeedModal(false)}
              >
                Ver después
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

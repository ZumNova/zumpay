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

type V3ChainKey = "arbitrum" | "ethereum" | "polygon" | "robinhood";
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
  currentTick?: number;
  inRange?: boolean;
  liquidity: string;
  fees0?: string;
  fees1?: string;
  token0Symbol?: string;
  token1Symbol?: string;
};

type V3UsedPosition = V3Position & {
  hiddenAt: string;
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

type V3Contracts = {
  factory: string;
  positionManager: string;
  swapRouter: string;
  quoter?: string;
  maxTxGasLimit?: bigint;
};

type V4ScanResult = {
  status: "Activa" | "No activa";
  usability: "Usable" | "Watch" | "No usable";
  usabilityDetail: string;
  nextAction: string;
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  tick: number;
  price: number;
  liquidity: string;
  lpFee: string;
  protocolFee: string;
  checkedAt: string;
};

type V4PoolCandidate = {
  id: string;
  label: string;
  currencyA: string;
  currencyB: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  note: string;
};

type V4MultiPoolScanResult = {
  candidate: V4PoolCandidate;
  result: V4ScanResult | null;
  error: string | null;
  checkedAt: string;
};

type V4PositionView = V4ScanResult & {
  tokenId: string;
  owner: string;
  tickLower: number;
  tickUpper: number;
  inRange: boolean;
  rangePriceLower: number;
  rangePriceUpper: number;
};

type V4LiquiditySimulation = {
  liquidityFromToken0: number;
  liquidityFromToken1: number;
  liquidityToAdd: number;
  limitingToken: string;
  usedToken0: number;
  usedToken1: number;
  leftoverToken0: number;
  leftoverToken1: number;
  suggestedToken0: number;
  suggestedToken1: number;
};

type V4PreflightCheck = {
  label: string;
  value: string;
  ok: boolean;
};

type V4GasEstimate = {
  status: "ok" | "warn" | "error";
  title: string;
  detail: string;
};

type V4LiquidityChange = {
  beforeValue: number;
  afterValue: number;
  deltaValue: number;
  currency: string;
};

type V4ValueEstimate = {
  currentValue: number;
  addValue: number;
  totalValue: number;
  currency: string;
};

type V4MintRange = {
  lowerTick: number;
  upperTick: number;
  lowerPrice: number;
  upperPrice: number;
};

type V4UsdAssistPlan = {
  sourceSymbol: string;
  targetSymbol: string;
  targetAmount: number;
  sourceToSwap: number;
  sourceToKeep: number;
  totalSource: number;
};

type V4LiquidityCall = {
  signer: ethers.Signer;
  provider: ethers.Provider;
  manager: ethers.Contract;
  unlockData: string;
  deadline: bigint;
  value: bigint;
};

type InjectedEthereum = {
  request: (args: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<unknown>;
};

const STORAGE_KEY = "zumpay_wallet_v1";
const TOKEN_KEY = "zumpay_tokens_v1";
const TX_KEY = "zumpay_txs_v1";
const V3_POSITION_KEY = "zumpay_v3_positions_v1";
const V3_USED_POSITION_KEY = "zumpay_v3_used_positions_v1";

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
  },
  {
    key: "robinhood",
    name: "Robinhood Chain",
    chainId: 4663,
    symbol: "ETH",
    rpcUrl:
      process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ??
      "https://rpc.mainnet.chain.robinhood.com"
  }
];

const EXPLORERS: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  polygon: "https://polygonscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  robinhood: "https://robinhoodchain.blockscout.com/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/"
};

const EXPLORER_ROOTS: Record<string, string> = {
  ethereum: "https://etherscan.io",
  polygon: "https://polygonscan.com",
  arbitrum: "https://arbiscan.io",
  robinhood: "https://robinhoodchain.blockscout.com"
};

const ZUM_ADDRESS = "0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5";
const ZUM_OWNER = "0xdD6cB8f731B6ABbAEE5839d2e45Fe2319a8572e4";
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

const LEGACY_V3_CONTRACTS: V3Contracts = {
  positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
};

const V3_CONTRACTS: Record<V3ChainKey, V3Contracts> = {
  ethereum: LEGACY_V3_CONTRACTS,
  polygon: LEGACY_V3_CONTRACTS,
  arbitrum: LEGACY_V3_CONTRACTS,
  robinhood: {
    factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
    positionManager: "0x73991a25c818bf1f1128deaab1492d45638de0d3",
    swapRouter: "0xcaf681a66d020601342297493863e78c959e5cb2",
    quoter: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
    maxTxGasLimit: BigInt(25000000)
  }
};
const V4_ROBINHOOD_CONTRACTS = {
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  positionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
  quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
  stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3"
};
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
  polygon: 137,
  robinhood: 4663
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
  },
  robinhood: {
    WETH: {
      address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      decimals: 18
    },
    USDG: {
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6
    },
    USDe: {
      address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
      decimals: 18
    },
    SPCX: {
      address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
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
    id: "arb-wbtc-weth-500",
    chain: "arbitrum",
    label: "WBTC/WETH",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WBTC",
    token1: "WETH",
    inputToken: "WETH",
    price: 31.02,
    tick: 264619,
    reserve: "Blue-chip rotation",
    activity: "Activa"
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
  },
  {
    id: "rh-spcx-usdg-10000",
    chain: "robinhood",
    label: "SPCX/USDG",
    fee: 10000,
    feeLabel: "1.00%",
    token0: "SPCX",
    token1: "USDG",
    inputToken: "USDG",
    price: 33.5,
    tick: 0,
    reserve: "Robinhood experimental",
    activity: "Diagnóstico",
    allowCreate: true
  },
  {
    id: "rh-weth-usdg-500",
    chain: "robinhood",
    label: "WETH/USDG",
    fee: 500,
    feeLabel: "0.05%",
    token0: "WETH",
    token1: "USDG",
    inputToken: "USDG",
    price: 4500,
    tick: 0,
    reserve: "Robinhood experimental",
    activity: "Diagnóstico"
  }
];

const V4_ROBINHOOD_POOL_CANDIDATES: V4PoolCandidate[] = [
  {
    id: "rh-v4-usde-usdg-100",
    label: "USDe/USDG",
    currencyA: V3_TOKENS.robinhood.USDe.address,
    currencyB: V3_TOKENS.robinhood.USDG.address,
    fee: 100,
    tickSpacing: 1,
    hooks: ZERO_ADDRESS,
    note: "Stable Core · fee 0.01% · rango sugerido 0.98-1.02"
  },
  {
    id: "rh-v4-weth-usdg-500",
    label: "WETH/USDG",
    currencyA: V3_TOKENS.robinhood.WETH.address,
    currencyB: V3_TOKENS.robinhood.USDG.address,
    fee: 500,
    tickSpacing: 10,
    hooks: ZERO_ADDRESS,
    note: "Pool estable de baja fee"
  },
  {
    id: "rh-v4-weth-usdg-3000",
    label: "WETH/USDG",
    currencyA: V3_TOKENS.robinhood.WETH.address,
    currencyB: V3_TOKENS.robinhood.USDG.address,
    fee: 3000,
    tickSpacing: 60,
    hooks: ZERO_ADDRESS,
    note: "Fee media"
  },
  {
    id: "rh-v4-spcx-usdg-3000",
    label: "SPCX/USDG",
    currencyA: V3_TOKENS.robinhood.SPCX.address,
    currencyB: V3_TOKENS.robinhood.USDG.address,
    fee: 3000,
    tickSpacing: 60,
    hooks: ZERO_ADDRESS,
    note: "Token contra USDG"
  },
  {
    id: "rh-v4-spcx-usdg-10000",
    label: "SPCX/USDG",
    currencyA: V3_TOKENS.robinhood.SPCX.address,
    currencyB: V3_TOKENS.robinhood.USDG.address,
    fee: 10000,
    tickSpacing: 200,
    hooks: ZERO_ADDRESS,
    note: "Fee alta"
  },
  {
    id: "rh-v4-weth-spcx-3000",
    label: "WETH/SPCX",
    currencyA: V3_TOKENS.robinhood.WETH.address,
    currencyB: V3_TOKENS.robinhood.SPCX.address,
    fee: 3000,
    tickSpacing: 60,
    hooks: ZERO_ADDRESS,
    note: "Cruce volátil"
  },
  {
    id: "rh-v4-eth-usdg-3000",
    label: "ETH/USDG",
    currencyA: ZERO_ADDRESS,
    currencyB: V3_TOKENS.robinhood.USDG.address,
    fee: 3000,
    tickSpacing: 60,
    hooks: ZERO_ADDRESS,
    note: "Nativo contra USDG"
  }
];

const V3_PROFILES = {
  conservative: { label: "Conservador", widthPct: 0.2 },
  moderate: { label: "Moderado", widthPct: 0.12 },
  aggressive: { label: "Riesgoso", widthPct: 0.08 }
};

const V3_POSITION_MANAGER_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
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

const V4_QUOTER_ABI = [
  "function quoteExactInputSingle((tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)"
];

const V4_UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable"
];

const PERMIT2_ABI = [
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)"
];

const V4_STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)"
];

const V4_POSITION_MANAGER_VIEW_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,uint256 info)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128 liquidity)",
  "function modifyLiquidities(bytes unlockData,uint256 deadline) payable"
];

const V4_ACTION_INCREASE_LIQUIDITY = "0x00";
const V4_ACTION_DECREASE_LIQUIDITY = "0x01";
const V4_ACTION_MINT_POSITION = "0x02";
const V4_ACTION_SWAP_EXACT_IN_SINGLE = "0x06";
const V4_ACTION_SETTLE_ALL = "0x0c";
const V4_ACTION_SETTLE_PAIR = "0x0d";
const V4_ACTION_TAKE_ALL = "0x0f";
const V4_ACTION_TAKE_PAIR = "0x11";
const V4_ACTION_SWEEP = "0x14";
const V4_UNIVERSAL_ROUTER_COMMAND_SWAP = "0x10";
const V4_AMOUNT_BUFFER_BPS = BigInt(100);
const V4_MAX_REASONABLE_GAS = BigInt(5_000_000);
const V4_DANGER_GAS = BigInt(25_000_000);
const MAX_UINT160 = (BigInt(1) << BigInt(160)) - BigInt(1);
const PERMIT2_EXPIRATION = 4_102_444_800;

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
  ],
  robinhood: [
    {
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      symbol: "USDG",
      decimals: 6
    },
    {
      address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      symbol: "WETH",
      decimals: 18
    },
    {
      address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
      symbol: "SPCX",
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

function v3Contracts(chain: V3ChainKey) {
  return V3_CONTRACTS[chain];
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

function formatHumanTokenAmount(value: number, symbol: string) {
  const upper = symbol.toUpperCase();
  const maximumFractionDigits =
    upper === "ETH" || upper === "WETH" || value < 1 ? 6 : 2;
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 0
  });
}

function formatV4Price(value: number, token0Symbol: string, token1Symbol: string) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  })} ${token1Symbol} por ${token0Symbol}`;
}

function formatV4Value(value: number, currency: string) {
  if (!Number.isFinite(value) || value <= 0) {
    return `0.00 ${currency}`;
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  })} ${currency}`;
}

function formatGasUnits(value: bigint) {
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
}

function parseHumanAmount(value: string) {
  return Number(value.replace(",", "."));
}

function parseTokenUnits(value: string, decimals: number) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return BigInt(0);
  }
  return ethers.parseUnits(normalized, decimals);
}

function formatTokenInputAmount(value: number, symbol: string) {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  const upper = symbol.toUpperCase();
  const maximumFractionDigits =
    upper === "ETH" || upper === "WETH" ? 6 : upper.includes("USD") ? 2 : 4;

  return value
    .toFixed(maximumFractionDigits)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function formatZumAmount(value: bigint) {
  return ethers
    .formatUnits(value, 18)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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

function priceFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number
) {
  const sqrtRatio = Number(sqrtPriceX96) / 2 ** 96;
  return sqrtRatio * sqrtRatio * 10 ** (token0Decimals - token1Decimals);
}

function assessV4PoolUsability(
  sqrtPriceX96: bigint,
  liquidity: bigint,
  price: number,
  hooks: string
): Pick<V4ScanResult, "usability" | "usabilityDetail" | "nextAction"> {
  if (sqrtPriceX96 <= BigInt(0)) {
    return {
      usability: "No usable",
      usabilityDetail: "La pool no esta inicializada en StateView.",
      nextAction: "Probar otra fee, tick spacing u hooks antes de cargar fondos."
    };
  }

  if (liquidity <= BigInt(0)) {
    return {
      usability: "Watch",
      usabilityDetail: "La pool tiene precio, pero no muestra liquidez.",
      nextAction: "No operar ahi salvo que quieras sembrar o crear liquidez inicial."
    };
  }

  if (!Number.isFinite(price) || price <= 0) {
    return {
      usability: "Watch",
      usabilityDetail: "La pool tiene liquidez, pero el precio no es confiable.",
      nextAction: "Revisar decimales y tokens antes de usar esta pool."
    };
  }

  if (hooks.toLowerCase() !== ZERO_ADDRESS) {
    return {
      usability: "Watch",
      usabilityDetail: "La pool usa hooks; puede tener reglas adicionales.",
      nextAction: "Revisar el contrato hook antes de firmar cualquier operacion."
    };
  }

  return {
    usability: "Usable",
    usabilityDetail: "Pool activa, con liquidez y sin hooks visibles.",
    nextAction: "Cargarla, leer un NFT compatible y validar rango antes de operar."
  };
}

function priceFromTick(tick: number, token0Decimals: number, token1Decimals: number) {
  return Math.pow(1.0001, tick) * 10 ** (token0Decimals - token1Decimals);
}

function decodeV4Signed24(value: bigint) {
  const raw = Number(value & BigInt(0xffffff));
  return raw >= 0x800000 ? raw - 0x1000000 : raw;
}

function decodeV4PositionInfo(value: bigint) {
  return {
    tickLower: decodeV4Signed24(value >> BigInt(8)),
    tickUpper: decodeV4Signed24(value >> BigInt(32))
  };
}

function simulateV4Liquidity(
  amount0: number,
  amount1: number,
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
  token0Symbol: string,
  token1Symbol: string,
  token0Decimals: number,
  token1Decimals: number
): V4LiquiditySimulation {
  const sqrtCurrent = Math.sqrt(Math.pow(1.0001, tickCurrent));
  const sqrtLower = Math.sqrt(Math.pow(1.0001, tickLower));
  const sqrtUpper = Math.sqrt(Math.pow(1.0001, tickUpper));
  const scale0 = 10 ** token0Decimals;
  const scale1 = 10 ** token1Decimals;
  const amount0Raw = amount0 * scale0;
  const amount1Raw = amount1 * scale1;
  if (
    amount0 <= 0 ||
    amount1 <= 0 ||
    sqrtLower <= 0 ||
    sqrtUpper <= sqrtLower
  ) {
    return {
      liquidityFromToken0: 0,
      liquidityFromToken1: 0,
      liquidityToAdd: 0,
      limitingToken: "—",
      usedToken0: 0,
      usedToken1: 0,
      leftoverToken0: amount0,
      leftoverToken1: amount1,
      suggestedToken0: 0,
      suggestedToken1: 0
    };
  }

  if (tickCurrent <= tickLower) {
    const liquidity =
      (amount0Raw * sqrtLower * sqrtUpper) / (sqrtUpper - sqrtLower);
    return {
      liquidityFromToken0: liquidity,
      liquidityFromToken1: 0,
      liquidityToAdd: liquidity,
      limitingToken: token0Symbol,
      usedToken0: amount0,
      usedToken1: 0,
      leftoverToken0: 0,
      leftoverToken1: amount1,
      suggestedToken0: amount0,
      suggestedToken1: 0
    };
  }

  if (tickCurrent >= tickUpper) {
    const liquidity = amount1Raw / (sqrtUpper - sqrtLower);
    return {
      liquidityFromToken0: 0,
      liquidityFromToken1: liquidity,
      liquidityToAdd: liquidity,
      limitingToken: token1Symbol,
      usedToken0: 0,
      usedToken1: amount1,
      leftoverToken0: amount0,
      leftoverToken1: 0,
      suggestedToken0: 0,
      suggestedToken1: amount1
    };
  }

  const liquidityFromToken0 =
    (amount0Raw * sqrtCurrent * sqrtUpper) / (sqrtUpper - sqrtCurrent);
  const liquidityFromToken1 = amount1Raw / (sqrtCurrent - sqrtLower);
  const liquidityToAdd = Math.min(liquidityFromToken0, liquidityFromToken1);
  const usedToken0Raw =
    (liquidityToAdd * (sqrtUpper - sqrtCurrent)) /
    (sqrtCurrent * sqrtUpper);
  const usedToken1Raw = liquidityToAdd * (sqrtCurrent - sqrtLower);
  const suggestedToken0Raw =
    (amount1Raw / (sqrtCurrent - sqrtLower)) *
    ((sqrtUpper - sqrtCurrent) / (sqrtCurrent * sqrtUpper));
  const suggestedToken1Raw =
    ((amount0Raw * sqrtCurrent * sqrtUpper) / (sqrtUpper - sqrtCurrent)) *
    (sqrtCurrent - sqrtLower);

  return {
    liquidityFromToken0,
    liquidityFromToken1,
    liquidityToAdd,
    limitingToken:
      liquidityFromToken0 <= liquidityFromToken1 ? token0Symbol : token1Symbol,
    usedToken0: usedToken0Raw / scale0,
    usedToken1: usedToken1Raw / scale1,
    leftoverToken0: Math.max(amount0 - usedToken0Raw / scale0, 0),
    leftoverToken1: Math.max(amount1 - usedToken1Raw / scale1, 0),
    suggestedToken0: suggestedToken0Raw / scale0,
    suggestedToken1: suggestedToken1Raw / scale1
  };
}

function estimateV4CounterpartAmount(
  amount: number,
  sourceToken: "token0" | "token1",
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
  sourceDecimals: number,
  targetDecimals: number
) {
  const sqrtCurrent = Math.sqrt(Math.pow(1.0001, tickCurrent));
  const sqrtLower = Math.sqrt(Math.pow(1.0001, tickLower));
  const sqrtUpper = Math.sqrt(Math.pow(1.0001, tickUpper));
  const sourceScale = 10 ** sourceDecimals;
  const targetScale = 10 ** targetDecimals;
  const amountRaw = amount * sourceScale;

  if (
    amount <= 0 ||
    sqrtLower <= 0 ||
    sqrtUpper <= sqrtLower ||
    !Number.isFinite(amountRaw)
  ) {
    return 0;
  }

  if (tickCurrent <= tickLower || tickCurrent >= tickUpper) {
    return 0;
  }

  if (sourceToken === "token0") {
    const liquidity =
      (amountRaw * sqrtCurrent * sqrtUpper) / (sqrtUpper - sqrtCurrent);
    return (liquidity * (sqrtCurrent - sqrtLower)) / targetScale;
  }

  const liquidity = amountRaw / (sqrtCurrent - sqrtLower);
  const targetRaw =
    (liquidity * (sqrtUpper - sqrtCurrent)) / (sqrtCurrent * sqrtUpper);
  return targetRaw / targetScale;
}

function estimatedV4LiquidityRaw(simulation: V4LiquiditySimulation | null) {
  if (!simulation || simulation.liquidityToAdd <= 0) {
    return BigInt(0);
  }

  return BigInt(Math.floor(simulation.liquidityToAdd));
}

function encodeV4IncreaseLiquidityData(
  position: V4PositionView,
  liquidity: bigint,
  amount0Max: bigint,
  amount1Max: bigint,
  recipient: string
) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const usesNative =
    position.currency0.toLowerCase() === ZERO_ADDRESS ||
    position.currency1.toLowerCase() === ZERO_ADDRESS;
  const actions = ethers.concat([
    V4_ACTION_INCREASE_LIQUIDITY,
    V4_ACTION_SETTLE_PAIR,
    ...(usesNative ? [V4_ACTION_SWEEP] : [])
  ]);
  const increaseParams = coder.encode(
    ["uint256", "uint256", "uint128", "uint128", "bytes"],
    [BigInt(position.tokenId), liquidity, amount0Max, amount1Max, "0x"]
  );
  const settlePairParams = coder.encode(
    ["address", "address"],
    [position.currency0, position.currency1]
  );
  const params = [increaseParams, settlePairParams];
  if (usesNative) {
    params.push(coder.encode(["address", "address"], [ZERO_ADDRESS, recipient]));
  }

  return coder.encode(
    ["bytes", "bytes[]"],
    [actions, params]
  );
}

function encodeV4DecreaseLiquidityData(
  position: V4PositionView,
  liquidity: bigint,
  recipient: string
) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const actions = ethers.concat([
    V4_ACTION_DECREASE_LIQUIDITY,
    V4_ACTION_TAKE_PAIR
  ]);
  const decreaseParams = coder.encode(
    ["uint256", "uint256", "uint128", "uint128", "bytes"],
    [BigInt(position.tokenId), liquidity, BigInt(0), BigInt(0), "0x"]
  );
  const takePairParams = coder.encode(
    ["address", "address", "address"],
    [position.currency0, position.currency1, recipient]
  );

  return coder.encode(
    ["bytes", "bytes[]"],
    [actions, [decreaseParams, takePairParams]]
  );
}

function encodeV4MintPositionData(
  pool: V4ScanResult,
  range: V4MintRange,
  liquidity: bigint,
  amount0Max: bigint,
  amount1Max: bigint,
  recipient: string
) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const usesNative =
    pool.currency0.toLowerCase() === ZERO_ADDRESS ||
    pool.currency1.toLowerCase() === ZERO_ADDRESS;
  const actions = ethers.concat([
    V4_ACTION_MINT_POSITION,
    V4_ACTION_SETTLE_PAIR,
    ...(usesNative ? [V4_ACTION_SWEEP] : [])
  ]);
  const poolKey = [
    pool.currency0,
    pool.currency1,
    pool.fee,
    pool.tickSpacing,
    pool.hooks
  ];
  const mintParams = coder.encode(
    [
      "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
      "int24",
      "int24",
      "uint256",
      "uint128",
      "uint128",
      "address",
      "bytes"
    ],
    [
      poolKey,
      range.lowerTick,
      range.upperTick,
      liquidity,
      amount0Max,
      amount1Max,
      recipient,
      "0x"
    ]
  );
  const settlePairParams = coder.encode(
    ["address", "address"],
    [pool.currency0, pool.currency1]
  );
  const params = [mintParams, settlePairParams];
  if (usesNative) {
    params.push(coder.encode(["address", "address"], [ZERO_ADDRESS, recipient]));
  }

  return coder.encode(["bytes", "bytes[]"], [actions, params]);
}

function addV4AmountBuffer(value: bigint) {
  return value + (value * V4_AMOUNT_BUFFER_BPS) / BigInt(10_000);
}

function v4PoolKeyTuple(pool: V4ScanResult) {
  return [
    pool.currency0,
    pool.currency1,
    pool.fee,
    pool.tickSpacing,
    pool.hooks
  ] as const;
}

function encodeV4SwapExactInputSingleData(
  pool: V4ScanResult,
  inputCurrency: string,
  amountIn: bigint,
  amountOutMinimum: bigint
) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const poolKey = v4PoolKeyTuple(pool);
  const zeroForOne =
    inputCurrency.toLowerCase() === pool.currency0.toLowerCase();
  const outputCurrency = zeroForOne ? pool.currency1 : pool.currency0;
  const actions = ethers.concat([
    V4_ACTION_SWAP_EXACT_IN_SINGLE,
    V4_ACTION_SETTLE_ALL,
    V4_ACTION_TAKE_ALL
  ]);
  const params = [
    coder.encode(
      [
        "tuple(tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)"
      ],
      [[poolKey, zeroForOne, amountIn, amountOutMinimum, 0, "0x"]]
    ),
    coder.encode(["address", "uint256"], [inputCurrency, amountIn]),
    coder.encode(["address", "uint256"], [outputCurrency, amountOutMinimum])
  ];

  return {
    commands: V4_UNIVERSAL_ROUTER_COMMAND_SWAP,
    inputs: [coder.encode(["bytes", "bytes[]"], [actions, params])]
  };
}

function describeV4EstimateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("0x31e30ad0")) {
    return "MaximumAmountExceeded: el contrato pidió más token que el máximo permitido. Se corrige aumentando margen o reduciendo liquidez.";
  }
  if (message.includes("0x0ca968d8")) {
    return "NotApproved: la wallet no está aprobada para operar ese NFT.";
  }
  if (message.includes("0xf4d678b8")) {
    return "InsufficientBalance: saldo insuficiente para la estimación.";
  }
  if (message.includes("0xd81b2f2e")) {
    return "Permit2 AllowanceExpired: falta aprobar Permit2 hacia el contrato que ejecuta la operación.";
  }
  return message;
}

function v4NativeValue(
  position: V4PositionView,
  amount0Raw: bigint,
  amount1Raw: bigint
) {
  if (position.currency0.toLowerCase() === ZERO_ADDRESS) {
    return amount0Raw;
  }
  if (position.currency1.toLowerCase() === ZERO_ADDRESS) {
    return amount1Raw;
  }
  return BigInt(0);
}

function v4PoolNativeValue(
  pool: V4ScanResult,
  amount0Raw: bigint,
  amount1Raw: bigint
) {
  if (pool.currency0.toLowerCase() === ZERO_ADDRESS) {
    return amount0Raw;
  }
  if (pool.currency1.toLowerCase() === ZERO_ADDRESS) {
    return amount1Raw;
  }
  return BigInt(0);
}

function estimateV4ValueFromLiquidity(
  liquidity: bigint,
  referenceLiquidity: string,
  referenceValue: number
) {
  const reference = Number(referenceLiquidity);
  const current = Number(liquidity);
  if (
    reference <= 0 ||
    current < 0 ||
    !Number.isFinite(reference) ||
    !Number.isFinite(current) ||
    !Number.isFinite(referenceValue)
  ) {
    return 0;
  }

  return referenceValue * (current / reference);
}

function normalizeV4Currency(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "eth") {
    return ZERO_ADDRESS;
  }
  return ethers.getAddress(trimmed);
}

function sortV4Currencies(currencyA: string, currencyB: string) {
  const normalizedA = normalizeV4Currency(currencyA);
  const normalizedB = normalizeV4Currency(currencyB);
  if (normalizedA.toLowerCase() === normalizedB.toLowerCase()) {
    throw new Error("Las monedas de la pool no pueden ser iguales.");
  }
  return BigInt(normalizedA) < BigInt(normalizedB)
    ? [normalizedA, normalizedB]
    : [normalizedB, normalizedA];
}

function v4PoolId(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number,
  hooks: string
) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)"],
      [[currency0, currency1, fee, tickSpacing, hooks]]
    )
  );
}

async function scanV4Pool(
  readProvider: ethers.Provider,
  stateView: ethers.Contract,
  currencyA: string,
  currencyB: string,
  fee: number,
  tickSpacing: number,
  hooksValue: string
): Promise<V4ScanResult> {
  const hooks = normalizeV4Currency(hooksValue || ZERO_ADDRESS);
  const [currency0, currency1] = sortV4Currencies(currencyA, currencyB);
  const poolId = v4PoolId(currency0, currency1, fee, tickSpacing, hooks);
  const [meta0, meta1, slot0, liquidity] = await Promise.all([
    readV4CurrencyMeta(readProvider, currency0, "TOKEN0"),
    readV4CurrencyMeta(readProvider, currency1, "TOKEN1"),
    stateView.getSlot0(poolId) as Promise<[bigint, bigint, bigint, bigint]>,
    stateView.getLiquidity(poolId) as Promise<bigint>
  ]);
  const sqrtPriceX96 = slot0[0];
  const tick = Number(slot0[1]);
  const protocolFee = slot0[2];
  const lpFee = slot0[3];
  const active = sqrtPriceX96 > BigInt(0) && liquidity > BigInt(0);
  const price = priceFromSqrtPriceX96(
    sqrtPriceX96,
    meta0.decimals,
    meta1.decimals
  );
  const usability = assessV4PoolUsability(
    sqrtPriceX96,
    liquidity,
    price,
    hooks
  );

  return {
    status: active ? "Activa" : "No activa",
    ...usability,
    poolId,
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
    token0Symbol: meta0.symbol,
    token1Symbol: meta1.symbol,
    token0Decimals: meta0.decimals,
    token1Decimals: meta1.decimals,
    tick,
    price,
    liquidity: liquidity.toString(),
    lpFee: `${Number(lpFee) / 10000}%`,
    protocolFee: protocolFee.toString(),
    checkedAt: new Date().toLocaleTimeString()
  };
}

async function readV4CurrencyMeta(
  provider: ethers.Provider,
  address: string,
  fallbackSymbol: string
) {
  if (address.toLowerCase() === ZERO_ADDRESS) {
    return { symbol: "ETH", decimals: 18 };
  }
  const token = new ethers.Contract(address, ERC20_ABI, provider);
  try {
    const [symbol, decimals] = await Promise.all([
      token.symbol() as Promise<string>,
      token.decimals() as Promise<number>
    ]);
    return { symbol, decimals: Number(decimals) };
  } catch {
    return { symbol: fallbackSymbol, decimals: 18 };
  }
}

function v3Provider(chain: V3ChainKey) {
  const networkConfig = NETWORKS.find((item) => item.key === chain);
  return new ethers.JsonRpcProvider(
    networkConfig?.rpcUrl,
    V3_CHAIN_IDS[chain]
  );
}

async function readV4PositionLiquidity(tokenId: string) {
  const readProvider = v3Provider("robinhood");
  const positionManager = new ethers.Contract(
    V4_ROBINHOOD_CONTRACTS.positionManager,
    V4_POSITION_MANAGER_VIEW_ABI,
    readProvider
  );
  return (await positionManager.getPositionLiquidity(tokenId)) as bigint;
}

function assertReasonableV3Gas(
  gasEstimate: bigint,
  chain: V3ChainKey,
  action: string
) {
  const limit = v3Contracts(chain).maxTxGasLimit;
  if (limit && gasEstimate > limit) {
    throw new Error(
      `${action}: gas estimado anormal (${gasEstimate.toString()} > ${limit.toString()}). No firmes esta operación en ${chain}.`
    );
  }
}

function bufferedGasLimit(gasEstimate: bigint, bufferBps = 2_000) {
  return gasEstimate + (gasEstimate * BigInt(bufferBps)) / BigInt(10_000);
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

async function waitForV3Receipt(
  txHash: string,
  chain: V3ChainKey,
  timeoutMs = 90000
) {
  const receipt = await v3Provider(chain).waitForTransaction(
    txHash,
    1,
    timeoutMs
  );
  if (!receipt) {
    throw new Error(
      `La transacción ${txHash.slice(0, 10)}... no confirmó dentro del tiempo esperado.`
    );
  }
  return receipt;
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
  recipient: string,
  positionManager: string
) {
  const recipientTopic = topicForAddress(recipient).toLowerCase();
  const transferLog = receipt?.logs.find((log) => {
    const topics = log.topics ?? [];
    return (
      log.address.toLowerCase() === positionManager.toLowerCase() &&
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
  const [v3UsedPositions, setV3UsedPositions] = useState<V3UsedPosition[]>([]);
  const [v3Scans, setV3Scans] = useState<Record<string, V3ScanResult>>({});
  const [v3Scanning, setV3Scanning] = useState(false);
  const [v3Discovering, setV3Discovering] = useState(false);
  const [v3Executing, setV3Executing] = useState(false);
  const [v3Status, setV3Status] = useState("");
  const [v4CurrencyA, setV4CurrencyA] = useState(
    V3_TOKENS.robinhood.WETH.address
  );
  const [v4CurrencyB, setV4CurrencyB] = useState(
    V3_TOKENS.robinhood.USDG.address
  );
  const [v4Fee, setV4Fee] = useState("500");
  const [v4TickSpacing, setV4TickSpacing] = useState("10");
  const [v4Hooks, setV4Hooks] = useState(ZERO_ADDRESS);
  const [v4Result, setV4Result] = useState<V4ScanResult | null>(null);
  const [v4Scanning, setV4Scanning] = useState(false);
  const [v4MultiScanning, setV4MultiScanning] = useState(false);
  const [v4MultiResults, setV4MultiResults] = useState<
    V4MultiPoolScanResult[]
  >([]);
  const [v4Status, setV4Status] = useState("");
  const [v4TokenId, setV4TokenId] = useState("");
  const [v4Position, setV4Position] = useState<V4PositionView | null>(null);
  const [v4MintProfile, setV4MintProfile] =
    useState<keyof typeof V3_PROFILES>("moderate");
  const [v4MintUsdAmount, setV4MintUsdAmount] = useState("");
  const [v4MintSlippage, setV4MintSlippage] = useState("1");
  const [v4MintAmount0, setV4MintAmount0] = useState("");
  const [v4MintAmount1, setV4MintAmount1] = useState("");
  const [v4MintPreflighting, setV4MintPreflighting] = useState(false);
  const [v4MintPreflightChecks, setV4MintPreflightChecks] = useState<
    V4PreflightCheck[]
  >([]);
  const [v4MintEstimatingGas, setV4MintEstimatingGas] = useState(false);
  const [v4MintGasEstimate, setV4MintGasEstimate] =
    useState<V4GasEstimate | null>(null);
  const [v4Minting, setV4Minting] = useState(false);
  const [v4ReadingPosition, setV4ReadingPosition] = useState(false);
  const [v4AddAmount0, setV4AddAmount0] = useState("");
  const [v4AddAmount1, setV4AddAmount1] = useState("");
  const [v4Preflighting, setV4Preflighting] = useState(false);
  const [v4PreflightChecks, setV4PreflightChecks] = useState<
    V4PreflightCheck[]
  >([]);
  const [v4EstimatingGas, setV4EstimatingGas] = useState(false);
  const [v4GasEstimate, setV4GasEstimate] = useState<V4GasEstimate | null>(
    null
  );
  const [v4AddingLiquidity, setV4AddingLiquidity] = useState(false);
  const [v4CollectingFees, setV4CollectingFees] = useState(false);
  const [v4WithdrawingLiquidity, setV4WithdrawingLiquidity] = useState(false);
  const [v4LastTxHash, setV4LastTxHash] = useState("");
  const [v4LiquidityChange, setV4LiquidityChange] =
    useState<V4LiquidityChange | null>(null);

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
  const v3RequiresManualEntry = v3Chain === "robinhood";
  const canOperateV3 =
    Boolean(selectedV3Scan) &&
    (!v3RequiresManualEntry || v3EntryMode === "manual") &&
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
  const v3ManualRatioHint = useMemo(() => {
    if (v3EntryMode !== "manual") {
      return "";
    }

    const manual0 = Math.max(Number(v3ManualAmount0) || 0, 0);
    const manual1 = Math.max(Number(v3ManualAmount1) || 0, 0);
    const price = Math.max(effectiveV3Price || 0, 0);

    if (price <= 0) {
      return "Actualizá el scanner para estimar la proporción entre tokens.";
    }

    if (manual0 > 0 && manual1 <= 0) {
      const suggested1 = manual0 * price;
      return `Con ${manual0.toLocaleString("en-US", {
        maximumFractionDigits: 8
      })} ${selectedV3Pool.token0}, el otro lado sugerido es ${suggested1.toLocaleString(
        "en-US",
        { maximumFractionDigits: 8 }
      )} ${selectedV3Pool.token1}.`;
    }

    if (manual1 > 0 && manual0 <= 0) {
      const suggested0 = manual1 / price;
      return `Con ${manual1.toLocaleString("en-US", {
        maximumFractionDigits: 8
      })} ${selectedV3Pool.token1}, el otro lado sugerido es ${suggested0.toLocaleString(
        "en-US",
        { maximumFractionDigits: 8 }
      )} ${selectedV3Pool.token0}.`;
    }

    if (manual0 > 0 && manual1 > 0) {
      const currentRatio = manual1 / manual0;
      const diffPct = Math.abs(currentRatio / price - 1) * 100;
      return `Relación cargada: ${currentRatio.toLocaleString("en-US", {
        maximumFractionDigits: 8
      })} ${selectedV3Pool.token1} por ${selectedV3Pool.token0}. Diferencia contra precio estimado: ${diffPct.toLocaleString(
        "en-US",
        { maximumFractionDigits: 2 }
      )}%.`;
    }

    return `Precio estimado: 1 ${selectedV3Pool.token0} ≈ ${price.toLocaleString(
      "en-US",
      { maximumFractionDigits: 8 }
    )} ${selectedV3Pool.token1}.`;
  }, [
    effectiveV3Price,
    selectedV3Pool,
    v3EntryMode,
    v3ManualAmount0,
    v3ManualAmount1
  ]);
  const v4MintRange = useMemo<V4MintRange | null>(() => {
    if (!v4Result || v4Result.price <= 0 || v4Result.tickSpacing <= 0) {
      return null;
    }

    const profile = V3_PROFILES[v4MintProfile];
    const lowerMultiplier = 1 - profile.widthPct;
    const upperMultiplier = 1 + profile.widthPct;
    const lowerTickRaw =
      v4Result.tick + Math.log(lowerMultiplier) / Math.log(1.0001);
    const upperTickRaw =
      v4Result.tick + Math.log(upperMultiplier) / Math.log(1.0001);

    return {
      lowerPrice: v4Result.price * lowerMultiplier,
      upperPrice: v4Result.price * upperMultiplier,
      lowerTick:
        Math.floor(lowerTickRaw / v4Result.tickSpacing) *
        v4Result.tickSpacing,
      upperTick:
        Math.ceil(upperTickRaw / v4Result.tickSpacing) *
        v4Result.tickSpacing
    };
  }, [v4MintProfile, v4Result]);
  const v4MintSimulation = useMemo<V4LiquiditySimulation | null>(() => {
    if (!v4Result || !v4MintRange) {
      return null;
    }

    const amount0 = Math.max(parseHumanAmount(v4MintAmount0) || 0, 0);
    const amount1 = Math.max(parseHumanAmount(v4MintAmount1) || 0, 0);
    return simulateV4Liquidity(
      amount0,
      amount1,
      v4Result.tick,
      v4MintRange.lowerTick,
      v4MintRange.upperTick,
      v4Result.token0Symbol,
      v4Result.token1Symbol,
      v4Result.token0Decimals,
      v4Result.token1Decimals
    );
  }, [v4MintAmount0, v4MintAmount1, v4MintRange, v4Result]);
  const v4UsdAssistPlan = useMemo<V4UsdAssistPlan | null>(() => {
    if (!v4Result || !v4MintRange || v4Result.price <= 0) {
      return null;
    }
    const usdgAddress = V3_TOKENS.robinhood.USDG.address.toLowerCase();
    const sourceIsToken1 =
      v4Result.currency1.toLowerCase() === usdgAddress ||
      v4Result.token1Symbol.toUpperCase() === "USDG";
    if (!sourceIsToken1) {
      return null;
    }

    const totalSource = Math.max(parseHumanAmount(v4MintUsdAmount) || 0, 0);
    const sourcePerOneTarget = estimateV4CounterpartAmount(
      1,
      "token0",
      v4Result.tick,
      v4MintRange.lowerTick,
      v4MintRange.upperTick,
      v4Result.token0Decimals,
      v4Result.token1Decimals
    );
    const costPerOneTarget = v4Result.price;
    const totalPerOneTarget = costPerOneTarget + sourcePerOneTarget;
    if (
      totalSource <= 0 ||
      sourcePerOneTarget <= 0 ||
      totalPerOneTarget <= 0 ||
      !Number.isFinite(totalPerOneTarget)
    ) {
      return null;
    }

    const targetAmount = totalSource / totalPerOneTarget;
    const sourceToKeep = sourcePerOneTarget * targetAmount;
    const sourceToSwap = Math.max(totalSource - sourceToKeep, 0);

    return {
      sourceSymbol: v4Result.token1Symbol,
      targetSymbol: v4Result.token0Symbol,
      targetAmount,
      sourceToSwap,
      sourceToKeep,
      totalSource
    };
  }, [v4MintRange, v4MintUsdAmount, v4Result]);
  const v4CanSimulateMint =
    v4Result?.usability === "Usable" && Boolean(v4MintRange);
  const v4LiquiditySimulation = useMemo(() => {
    if (!v4Position) {
      return null;
    }
    const amount0 = Math.max(parseHumanAmount(v4AddAmount0) || 0, 0);
    const amount1 = Math.max(parseHumanAmount(v4AddAmount1) || 0, 0);
    return simulateV4Liquidity(
      amount0,
      amount1,
      v4Position.tick,
      v4Position.tickLower,
      v4Position.tickUpper,
      v4Position.token0Symbol,
      v4Position.token1Symbol,
      v4Position.token0Decimals,
      v4Position.token1Decimals
    );
  }, [v4AddAmount0, v4AddAmount1, v4Position]);
  const v4ValueEstimate = useMemo<V4ValueEstimate | null>(() => {
    if (!v4Position || !v4LiquiditySimulation) {
      return null;
    }

    const amount0 = Math.max(parseHumanAmount(v4AddAmount0) || 0, 0);
    const amount1 = Math.max(parseHumanAmount(v4AddAmount1) || 0, 0);
    const currentLiquidity = Number(v4Position.liquidity);
    const liquidityToAdd = v4LiquiditySimulation.liquidityToAdd;
    const token1ValuePerToken0 = v4Position.price;
    const addValue = amount0 * token1ValuePerToken0 + amount1;
    if (
      addValue <= 0 ||
      currentLiquidity <= 0 ||
      liquidityToAdd <= 0 ||
      !Number.isFinite(currentLiquidity) ||
      !Number.isFinite(liquidityToAdd)
    ) {
      return null;
    }

    const currentValue = addValue * (currentLiquidity / liquidityToAdd);
    return {
      currentValue,
      addValue,
      totalValue: currentValue + addValue,
      currency: v4Position.token1Symbol
    };
  }, [v4AddAmount0, v4AddAmount1, v4LiquiditySimulation, v4Position]);

  const handleV4AddAmount0Change = (value: string) => {
    setV4AddAmount0(value);
    const amount = parseHumanAmount(value);
    if (!v4Position || !Number.isFinite(amount) || amount <= 0) {
      setV4AddAmount1("");
      return;
    }

    const suggestedToken1 = estimateV4CounterpartAmount(
      amount,
      "token0",
      v4Position.tick,
      v4Position.tickLower,
      v4Position.tickUpper,
      v4Position.token0Decimals,
      v4Position.token1Decimals
    );
    setV4AddAmount1(
      formatTokenInputAmount(suggestedToken1, v4Position.token1Symbol)
    );
  };

  const handleV4AddAmount1Change = (value: string) => {
    setV4AddAmount1(value);
    const amount = parseHumanAmount(value);
    if (!v4Position || !Number.isFinite(amount) || amount <= 0) {
      setV4AddAmount0("");
      return;
    }

    const suggestedToken0 = estimateV4CounterpartAmount(
      amount,
      "token1",
      v4Position.tick,
      v4Position.tickLower,
      v4Position.tickUpper,
      v4Position.token1Decimals,
      v4Position.token0Decimals
    );
    setV4AddAmount0(
      formatTokenInputAmount(suggestedToken0, v4Position.token0Symbol)
    );
  };

  const handleV4MintAmount0Change = (value: string) => {
    setV4MintAmount0(value);
    const amount = parseHumanAmount(value);
    if (
      !v4Result ||
      !v4MintRange ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setV4MintAmount1("");
      return;
    }

    const suggestedToken1 = estimateV4CounterpartAmount(
      amount,
      "token0",
      v4Result.tick,
      v4MintRange.lowerTick,
      v4MintRange.upperTick,
      v4Result.token0Decimals,
      v4Result.token1Decimals
    );
    setV4MintAmount1(
      formatTokenInputAmount(suggestedToken1, v4Result.token1Symbol)
    );
  };

  const handleV4MintAmount1Change = (value: string) => {
    setV4MintAmount1(value);
    const amount = parseHumanAmount(value);
    if (
      !v4Result ||
      !v4MintRange ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setV4MintAmount0("");
      return;
    }

    const suggestedToken0 = estimateV4CounterpartAmount(
      amount,
      "token1",
      v4Result.tick,
      v4MintRange.lowerTick,
      v4MintRange.upperTick,
      v4Result.token1Decimals,
      v4Result.token0Decimals
    );
    setV4MintAmount0(
      formatTokenInputAmount(suggestedToken0, v4Result.token0Symbol)
    );
  };

  const handleApplyV4UsdAssist = () => {
    if (!v4Result || !v4UsdAssistPlan) {
      setV4Status("Cargá una pool V4 contra USDG e ingresá un monto válido.");
      return;
    }

    setV4MintAmount0(
      formatTokenInputAmount(
        v4UsdAssistPlan.targetAmount,
        v4Result.token0Symbol
      )
    );
    setV4MintAmount1(
      formatTokenInputAmount(
        v4UsdAssistPlan.sourceToKeep,
        v4Result.token1Symbol
      )
    );
    setV4Status(
      `Plan USDG cargado: cambiar aprox ${formatHumanTokenAmount(
        v4UsdAssistPlan.sourceToSwap,
        v4UsdAssistPlan.sourceSymbol
      )} ${v4UsdAssistPlan.sourceSymbol} a ${v4UsdAssistPlan.targetSymbol} y mantener ${formatHumanTokenAmount(
        v4UsdAssistPlan.sourceToKeep,
        v4UsdAssistPlan.sourceSymbol
      )} ${v4UsdAssistPlan.sourceSymbol}.`
    );
  };

  const buildV4MintInputs = (
    amount0Text = v4MintAmount0,
    amount1Text = v4MintAmount1
  ) => {
    if (!v4Result || !v4MintRange || v4Result.usability !== "Usable") {
      setV4Status("Primero cargá una pool V4 usable.");
      return null;
    }

    const amount0Raw = parseTokenUnits(
      amount0Text,
      v4Result.token0Decimals
    );
    const amount1Raw = parseTokenUnits(
      amount1Text,
      v4Result.token1Decimals
    );
    const amount0 = Math.max(parseHumanAmount(amount0Text) || 0, 0);
    const amount1 = Math.max(parseHumanAmount(amount1Text) || 0, 0);
    const simulation = simulateV4Liquidity(
      amount0,
      amount1,
      v4Result.tick,
      v4MintRange.lowerTick,
      v4MintRange.upperTick,
      v4Result.token0Symbol,
      v4Result.token1Symbol,
      v4Result.token0Decimals,
      v4Result.token1Decimals
    );
    const liquidityRaw = estimatedV4LiquidityRaw(simulation);
    if (
      amount0Raw <= BigInt(0) ||
      amount1Raw <= BigInt(0) ||
      liquidityRaw <= BigInt(0)
    ) {
      setV4Status("Ingresá montos válidos para simular el nuevo NFT V4.");
      return null;
    }

    return {
      pool: v4Result,
      range: v4MintRange,
      amount0Raw,
      amount1Raw,
      liquidityRaw
    };
  };

  const handleV4MintPreflight = async () => {
    try {
      setV4MintPreflighting(true);
      setV4MintPreflightChecks([]);
      setV4MintGasEstimate(null);
      const inputs = buildV4MintInputs();
      if (!inputs) {
        return;
      }

      setV4Status("Probando balances y Permit2 para crear NFT V4. Solo lectura.");
      const signer = await getV3Signer("robinhood");
      const owner = await signer.getAddress();
      if (!signer.provider) {
        throw new Error("MetaMask no devolvió provider para Robinhood.");
      }
      const signerProvider = signer.provider;

      const readBalance = async (currency: string): Promise<bigint> => {
        if (currency.toLowerCase() === ZERO_ADDRESS) {
          return signerProvider.getBalance(owner);
        }
        const token = new ethers.Contract(currency, ERC20_ABI, signerProvider);
        return (await token.balanceOf(owner)) as bigint;
      };

      const readAllowance = async (
        currency: string,
        decimals: number
      ): Promise<{ raw: bigint; label: string }> => {
        if (currency.toLowerCase() === ZERO_ADDRESS) {
          return { raw: ethers.MaxUint256, label: "No requiere approve" };
        }
        const token = new ethers.Contract(currency, ERC20_ABI, signerProvider);
        const allowance = (await token.allowance(
          owner,
          V4_ROBINHOOD_CONTRACTS.permit2
        )) as bigint;
        return {
          raw: allowance,
          label: `${formatV3RawAmount(allowance, decimals)} aprobado hacia Permit2`
        };
      };

      const [balance0, balance1, allowance0, allowance1] = await Promise.all([
        readBalance(inputs.pool.currency0),
        readBalance(inputs.pool.currency1),
        readAllowance(inputs.pool.currency0, inputs.pool.token0Decimals),
        readAllowance(inputs.pool.currency1, inputs.pool.token1Decimals)
      ]);

      const checks: V4PreflightCheck[] = [
        {
          label: "Wallet",
          value: shortAddress(owner),
          ok: true
        },
        {
          label: "Pool",
          value: `${inputs.pool.token0Symbol}/${inputs.pool.token1Symbol} ${
            inputs.pool.fee / 10000
          }%`,
          ok: inputs.pool.usability === "Usable"
        },
        {
          label: "Rango",
          value: `${inputs.range.lowerTick} / ${inputs.range.upperTick}`,
          ok:
            inputs.range.lowerTick < inputs.pool.tick &&
            inputs.range.upperTick > inputs.pool.tick
        },
        {
          label: "Liquidez simulada",
          value: inputs.liquidityRaw.toLocaleString("en-US"),
          ok: inputs.liquidityRaw > BigInt(0)
        },
        {
          label: `Saldo ${inputs.pool.token0Symbol}`,
          value: `${formatV3RawAmount(
            balance0,
            inputs.pool.token0Decimals
          )} / necesita ${formatHumanTokenAmount(
            parseHumanAmount(v4MintAmount0) || 0,
            inputs.pool.token0Symbol
          )}`,
          ok: balance0 >= inputs.amount0Raw
        },
        {
          label: `Saldo ${inputs.pool.token1Symbol}`,
          value: `${formatV3RawAmount(
            balance1,
            inputs.pool.token1Decimals
          )} / necesita ${formatHumanTokenAmount(
            parseHumanAmount(v4MintAmount1) || 0,
            inputs.pool.token1Symbol
          )}`,
          ok: balance1 >= inputs.amount1Raw
        },
        {
          label: `Permiso ${inputs.pool.token0Symbol}`,
          value: allowance0.label,
          ok:
            inputs.pool.currency0.toLowerCase() === ZERO_ADDRESS ||
            allowance0.raw >= inputs.amount0Raw
        },
        {
          label: `Permiso ${inputs.pool.token1Symbol}`,
          value: allowance1.label,
          ok:
            inputs.pool.currency1.toLowerCase() === ZERO_ADDRESS ||
            allowance1.raw >= inputs.amount1Raw
        }
      ];

      setV4MintPreflightChecks(checks);
      setV4Status(
        checks.every((item) => item.ok)
          ? "Preflight mint OK. Ya se puede estimar gas MINT_POSITION sin firmar."
          : "Preflight mint incompleto. Revisá saldos o permisos Permit2."
      );
    } catch (error) {
      console.error(error);
      setV4Status(
        error instanceof Error
          ? `No se pudo probar mint V4: ${error.message}`
          : "No se pudo probar mint V4."
      );
    } finally {
      setV4MintPreflighting(false);
    }
  };

  const prepareV4MintCall = async (
    amount0Text?: string,
    amount1Text?: string
  ): Promise<V4LiquidityCall | null> => {
    const inputs = buildV4MintInputs(amount0Text, amount1Text);
    if (!inputs) {
      return null;
    }

    const signer = await getV3Signer("robinhood");
    const owner = await signer.getAddress();
    if (!signer.provider) {
      throw new Error("MetaMask no devolvió provider para Robinhood.");
    }
    const manager = new ethers.Contract(
      V4_ROBINHOOD_CONTRACTS.positionManager,
      V4_POSITION_MANAGER_VIEW_ABI,
      signer
    );
    const amount0Max = addV4AmountBuffer(inputs.amount0Raw);
    const amount1Max = addV4AmountBuffer(inputs.amount1Raw);
    const unlockData = encodeV4MintPositionData(
      inputs.pool,
      inputs.range,
      inputs.liquidityRaw,
      amount0Max,
      amount1Max,
      owner
    );
    const value = v4PoolNativeValue(inputs.pool, amount0Max, amount1Max);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

    return {
      signer,
      provider: signer.provider,
      manager,
      unlockData,
      deadline,
      value
    };
  };

  const handleV4MintEstimateGas = async () => {
    try {
      setV4MintEstimatingGas(true);
      setV4MintGasEstimate(null);
      const prepared = await prepareV4MintCall();
      if (!prepared) {
        return;
      }

      setV4Status("Estimando gas MINT_POSITION. No se firma ni se envía transacción.");
      const gas = (await prepared.manager.modifyLiquidities.estimateGas(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      )) as bigint;
      const feeData = await prepared.provider.getFeeData();
      const gasPrice =
        feeData.maxFeePerGas ?? feeData.gasPrice ?? BigInt(0);
      const estimatedCost = gasPrice > BigInt(0) ? gas * gasPrice : BigInt(0);
      const costText =
        estimatedCost > BigInt(0)
          ? `Costo estimado: ${ethers.formatEther(estimatedCost)} ETH.`
          : "El provider no devolvió precio de gas.";

      if (gas > V4_DANGER_GAS) {
        setV4MintGasEstimate({
          status: "error",
          title: "Mint bloqueado por gas",
          detail: `${formatGasUnits(
            gas
          )} unidades. Supera el límite extremo. ${costText}`
        });
        setV4Status("Gas de mint V4 demasiado alto. No firmes esta operación.");
        return;
      }

      if (gas > V4_MAX_REASONABLE_GAS) {
        setV4MintGasEstimate({
          status: "warn",
          title: "Gas de mint alto",
          detail: `${formatGasUnits(
            gas
          )} unidades. Revisar antes de crear NFT. ${costText}`
        });
        setV4Status("Gas de mint V4 alto. Conviene revisar antes de firmar.");
        return;
      }

      setV4MintGasEstimate({
        status: "ok",
        title: "Mint simulable",
        detail: `${formatGasUnits(gas)} unidades. ${costText}`
      });
      setV4Status("MINT_POSITION preparado: gas normal, sin firma enviada.");
    } catch (error) {
      console.error(error);
      setV4MintGasEstimate({
        status: "error",
        title: "No se pudo estimar MINT_POSITION",
        detail: describeV4EstimateError(error)
      });
      setV4Status("No se pudo estimar mint V4. No firmes todavía.");
    } finally {
      setV4MintEstimatingGas(false);
    }
  };

  const handleV4MintPosition = async () => {
    try {
      setV4Minting(true);
      setV4LastTxHash("");
      setV4LiquidityChange(null);
      if (v4MintGasEstimate?.status !== "ok") {
        setV4Status("Primero necesitás una estimación de gas MINT_POSITION en verde.");
        return;
      }

      const prepared = await prepareV4MintCall();
      if (!prepared) {
        return;
      }
      const owner = await prepared.signer.getAddress();

      setV4Status("Revalidando gas antes de abrir MetaMask para crear el NFT V4.");
      const gas = (await prepared.manager.modifyLiquidities.estimateGas(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      )) as bigint;
      if (gas > V4_MAX_REASONABLE_GAS) {
        setV4MintGasEstimate({
          status: gas > V4_DANGER_GAS ? "error" : "warn",
          title: gas > V4_DANGER_GAS ? "Mint bloqueado por gas" : "Gas de mint alto",
          detail: `${formatGasUnits(
            gas
          )} unidades antes de firmar. Operación detenida.`
        });
        setV4Status("Gas de mint V4 dejó de estar normal. No se abrió firma.");
        return;
      }

      setV4Status("MetaMask va a pedir firma real para crear un NFT V4 nuevo.");
      const tx = await prepared.manager.modifyLiquidities(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      );
      setV4LastTxHash(tx.hash);
      setV4Status(
        `Mint enviado: ${tx.hash.slice(0, 10)}... Esperando confirmación.`
      );

      const receipt = await waitForV3Receipt(tx.hash, "robinhood", 300000);
      const mintedTokenId = extractMintedV3TokenId(
        receipt,
        owner,
        V4_ROBINHOOD_CONTRACTS.positionManager
      );
      if (mintedTokenId) {
        setV4TokenId(mintedTokenId);
        setV4Position(null);
        setV4MintGasEstimate(null);
        setV4MintPreflightChecks([]);
      }
      setV4Status(
        mintedTokenId
          ? `NFT V4 creado #${mintedTokenId}. Tocá Leer NFT V4 para cargarlo en pantalla.`
          : "NFT V4 creado. No pude leer el tokenId del recibo; revisalo en el explorador."
      );
    } catch (error) {
      console.error(error);
      setV4Status(
        error instanceof Error
          ? `No se pudo crear el NFT V4: ${error.message}`
          : "No se pudo crear el NFT V4."
      );
    } finally {
      setV4Minting(false);
    }
  };

  const handleV4CreateFromUsd = async () => {
    try {
      setV4Minting(true);
      setV4LastTxHash("");
      setV4LiquidityChange(null);
      setV4MintGasEstimate(null);
      if (!v4Result || !v4MintRange || !v4UsdAssistPlan) {
        setV4Status("Cargá una pool token/USDG y un total USDG válido.");
        return;
      }
      const usdgAddress = V3_TOKENS.robinhood.USDG.address.toLowerCase();
      if (
        v4Result.currency1.toLowerCase() !== usdgAddress ||
        v4Result.currency0.toLowerCase() === ZERO_ADDRESS
      ) {
        setV4Status(
          "Crear desde USDG automático está habilitado para pools ERC20/USDG. ETH nativo queda para el siguiente módulo."
        );
        return;
      }
      if (
        !window.confirm(
          "Zumpay va a ejecutar swap USDG -> token y luego crear el NFT V4. MetaMask puede pedir approvals y dos transacciones reales. Continuar?"
        )
      ) {
        setV4Status("Crear desde USDG cancelado antes de abrir MetaMask.");
        return;
      }

      const signer = await getV3Signer("robinhood");
      const owner = await signer.getAddress();

      const totalUsdRaw = parseTokenUnits(
        v4MintUsdAmount,
        v4Result.token1Decimals
      );
      const swapUsdRaw = parseTokenUnits(
        v4UsdAssistPlan.sourceToSwap
          .toFixed(Math.min(v4Result.token1Decimals, 8))
          .replace(/(\.\d*?[1-9])0+$/, "$1")
          .replace(/\.0+$/, ""),
        v4Result.token1Decimals
      );
      const keepUsdRaw =
        totalUsdRaw > swapUsdRaw ? totalUsdRaw - swapUsdRaw : BigInt(0);
      if (totalUsdRaw <= BigInt(0) || swapUsdRaw <= BigInt(0) || keepUsdRaw <= BigInt(0)) {
        setV4Status("El total USDG es demasiado chico para dividir swap + mint.");
        return;
      }

      const usdg = new ethers.Contract(v4Result.currency1, ERC20_ABI, signer);
      const target = new ethers.Contract(v4Result.currency0, ERC20_ABI, signer);
      const usdgBalance = (await usdg.balanceOf(owner)) as bigint;
      if (usdgBalance < totalUsdRaw) {
        setV4Status(
          `Saldo insuficiente. Tenés ${formatV3RawAmount(
            usdgBalance,
            v4Result.token1Decimals
          )} ${v4Result.token1Symbol}.`
        );
        return;
      }

      if (swapUsdRaw > MAX_UINT128) {
        setV4Status("El swap V4 supera el máximo uint128 permitido.");
        return;
      }

      const slippagePct = Math.min(Math.max(Number(v4MintSlippage) || 1, 0.1), 5);
      setV4Status(
        `Consultando quote V4 para cambiar ${v4Result.token1Symbol} a ${v4Result.token0Symbol}.`
      );
      const quoter = new ethers.Contract(
        V4_ROBINHOOD_CONTRACTS.quoter,
        V4_QUOTER_ABI,
        signer
      );
      const poolKey = v4PoolKeyTuple(v4Result);
      const zeroForOne = false;
      const quoteResult = (await quoter.quoteExactInputSingle.staticCall([
        poolKey,
        zeroForOne,
        swapUsdRaw,
        "0x"
      ])) as [bigint, bigint];
      const quotedOutput = quoteResult[0];
      const minOutput =
        (quotedOutput * BigInt(10000 - Math.round(slippagePct * 100))) /
        BigInt(10000);

      await ensureV4Erc20Allowance(
        v4Result.currency1,
        V4_ROBINHOOD_CONTRACTS.permit2,
        swapUsdRaw,
        signer,
        `${v4Result.token1Symbol} para Permit2`
      );
      await ensureV4Permit2Allowance(
        v4Result.currency1,
        V4_ROBINHOOD_CONTRACTS.universalRouter,
        swapUsdRaw,
        signer,
        `${v4Result.token1Symbol} hacia Universal Router`
      );

      const targetBalanceBefore = (await target.balanceOf(owner)) as bigint;
      const router = new ethers.Contract(
        V4_ROBINHOOD_CONTRACTS.universalRouter,
        V4_UNIVERSAL_ROUTER_ABI,
        signer
      );
      setV4Status(
        `Ejecutando swap V4 ${v4Result.token1Symbol} -> ${v4Result.token0Symbol}.`
      );
      const swapPayload = encodeV4SwapExactInputSingleData(
        v4Result,
        v4Result.currency1,
        swapUsdRaw,
        minOutput
      );
      const swapDeadline = deadlineSeconds();
      const swapGas = (await router.execute.estimateGas(
        swapPayload.commands,
        swapPayload.inputs,
        swapDeadline,
        { value: 0 }
      )) as bigint;
      assertReasonableV3Gas(swapGas, "robinhood", "Swap V4 desde USDG");
      const swapTx = await router.execute(
        swapPayload.commands,
        swapPayload.inputs,
        swapDeadline,
        { value: 0 }
      );
      setV4LastTxHash(swapTx.hash);
      setV4Status(`Swap enviado: ${swapTx.hash.slice(0, 10)}...`);
      await waitForV3Receipt(swapTx.hash, "robinhood", 300000);

      const targetBalanceAfter = (await target.balanceOf(owner)) as bigint;
      const targetReceived = targetBalanceAfter - targetBalanceBefore;
      if (targetReceived <= BigInt(0)) {
        setV4Status("El swap no dejó saldo nuevo para crear la posición V4.");
        return;
      }

      const amount0Text = ethers.formatUnits(
        targetReceived,
        v4Result.token0Decimals
      );
      const amount1Text = ethers.formatUnits(keepUsdRaw, v4Result.token1Decimals);
      setV4MintAmount0(amount0Text);
      setV4MintAmount1(amount1Text);

      await ensureV4Erc20Allowance(
        v4Result.currency0,
        V4_ROBINHOOD_CONTRACTS.permit2,
        targetReceived,
        signer,
        `${v4Result.token0Symbol} para mint V4`
      );
      await ensureV4Erc20Allowance(
        v4Result.currency1,
        V4_ROBINHOOD_CONTRACTS.permit2,
        keepUsdRaw,
        signer,
        `${v4Result.token1Symbol} para mint V4`
      );
      await ensureV4Permit2Allowance(
        v4Result.currency0,
        V4_ROBINHOOD_CONTRACTS.positionManager,
        addV4AmountBuffer(targetReceived),
        signer,
        `${v4Result.token0Symbol} hacia Position Manager`
      );
      await ensureV4Permit2Allowance(
        v4Result.currency1,
        V4_ROBINHOOD_CONTRACTS.positionManager,
        addV4AmountBuffer(keepUsdRaw),
        signer,
        `${v4Result.token1Symbol} hacia Position Manager`
      );

      setV4Status("Preparando MINT_POSITION con los montos reales del swap.");
      const prepared = await prepareV4MintCall(amount0Text, amount1Text);
      if (!prepared) {
        return;
      }
      const gas = (await prepared.manager.modifyLiquidities.estimateGas(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      )) as bigint;
      if (gas > V4_MAX_REASONABLE_GAS) {
        setV4MintGasEstimate({
          status: gas > V4_DANGER_GAS ? "error" : "warn",
          title: gas > V4_DANGER_GAS ? "Mint bloqueado por gas" : "Gas de mint alto",
          detail: `${formatGasUnits(
            gas
          )} unidades después del swap. Operación detenida.`
        });
        setV4Status("Swap hecho, pero el mint quedó detenido por gas alto.");
        return;
      }
      setV4MintGasEstimate({
        status: "ok",
        title: "Mint listo",
        detail: `${formatGasUnits(gas)} unidades estimadas después del swap.`
      });

      setV4Status("MetaMask va a pedir firma real para crear el NFT V4.");
      const mintTx = await prepared.manager.modifyLiquidities(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      );
      setV4LastTxHash(mintTx.hash);
      setV4Status(`Mint enviado: ${mintTx.hash.slice(0, 10)}...`);
      const receipt = await waitForV3Receipt(mintTx.hash, "robinhood", 300000);
      const mintedTokenId = extractMintedV3TokenId(
        receipt,
        owner,
        V4_ROBINHOOD_CONTRACTS.positionManager
      );
      if (mintedTokenId) {
        setV4TokenId(mintedTokenId);
        setV4Position(null);
        setV4MintPreflightChecks([]);
      }
      setV4Status(
        mintedTokenId
          ? `Crear desde USDG completado. NFT V4 #${mintedTokenId} creado.`
          : "Crear desde USDG completado. No pude leer el tokenId del recibo."
      );
    } catch (error) {
      console.error(error);
      setV4Status(
        error instanceof Error
          ? `No se pudo crear desde USDG: ${describeV4EstimateError(error)}`
          : "No se pudo crear desde USDG."
      );
    } finally {
      setV4Minting(false);
    }
  };

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
      await ethereum.request({ method: "eth_requestAccounts" });
      await ensurePolygonNetwork(ethereum);
      await ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: ZUM_ADDRESS,
            symbol: "ZUM",
            decimals: 18
          }
        }
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
    } else {
      try {
        const parsed = JSON.parse(raw) as Record<string, V3Position[]>;
        const owner = v3Wallet?.toLowerCase() ?? "local";
        setV3Positions(parsed[owner] ?? []);
      } catch {
        setV3Positions([]);
      }
    }

    const usedRaw = localStorage.getItem(V3_USED_POSITION_KEY);
    if (!usedRaw) {
      setV3UsedPositions([]);
      return;
    }
    try {
      const parsed = JSON.parse(usedRaw) as Record<string, V3UsedPosition[]>;
      const owner = v3Wallet?.toLowerCase() ?? "local";
      setV3UsedPositions(parsed[owner] ?? []);
    } catch {
      setV3UsedPositions([]);
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

    const usedRaw = localStorage.getItem(V3_USED_POSITION_KEY);
    if (usedRaw) {
      const usedParsed = JSON.parse(usedRaw) as Record<string, V3UsedPosition[]>;
      usedParsed[owner] = (usedParsed[owner] ?? []).filter(
        (item) =>
          !(
            item.chain === position.chain &&
            item.tokenId === position.tokenId
          )
      );
      localStorage.setItem(V3_USED_POSITION_KEY, JSON.stringify(usedParsed));
      setV3UsedPositions(usedParsed[owner] ?? []);
    }
    setV3Positions(next);
  };

  const saveV3PositionLists = (
    active: V3Position[],
    used: V3UsedPosition[],
    ownerAddress?: string
  ) => {
    const owner =
      ownerAddress?.toLowerCase() ?? v3Wallet?.toLowerCase() ?? "local";
    const raw = localStorage.getItem(V3_POSITION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, V3Position[]>) : {};
    parsed[owner] = active;
    localStorage.setItem(V3_POSITION_KEY, JSON.stringify(parsed));

    const usedRaw = localStorage.getItem(V3_USED_POSITION_KEY);
    const usedParsed = usedRaw
      ? (JSON.parse(usedRaw) as Record<string, V3UsedPosition[]>)
      : {};
    usedParsed[owner] = used;
    localStorage.setItem(V3_USED_POSITION_KEY, JSON.stringify(usedParsed));

    setV3Positions(active);
    setV3UsedPositions(used);
  };

  const v3HasCollectibleFees = (position: V3Position) =>
    (parseHumanAmount(position.fees0 ?? "0") || 0) > 0 ||
    (parseHumanAmount(position.fees1 ?? "0") || 0) > 0;

  const handleV3HidePosition = (position: V3Position) => {
    const active = v3Positions.filter(
      (item) =>
        !(
          item.chain === position.chain &&
          item.tokenId === position.tokenId
        )
    );
    const hidden: V3UsedPosition = {
      ...position,
      hiddenAt: new Date().toISOString()
    };
    const used = [
      hidden,
      ...v3UsedPositions.filter(
        (item) =>
          !(
            item.chain === position.chain &&
            item.tokenId === position.tokenId
          )
      )
    ];
    saveV3PositionLists(active, used);
    setV3Status(`NFT #${position.tokenId} ocultado en Zumpay. No se gastó gas.`);
  };

  const handleV3RestorePosition = (position: V3UsedPosition) => {
    const restored: V3Position = {
      tokenId: position.tokenId,
      chain: position.chain,
      label: position.label,
      feeLabel: position.feeLabel,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      currentTick: position.currentTick,
      inRange: position.inRange,
      liquidity: position.liquidity,
      fees0: position.fees0,
      fees1: position.fees1,
      token0Symbol: position.token0Symbol,
      token1Symbol: position.token1Symbol
    };
    const active = [
      restored,
      ...v3Positions.filter(
        (item) =>
          !(
            item.chain === position.chain &&
            item.tokenId === position.tokenId
          )
      )
    ];
    const used = v3UsedPositions.filter(
      (item) =>
        !(
          item.chain === position.chain &&
          item.tokenId === position.tokenId
        )
    );
    saveV3PositionLists(active, used);
    setV3Status(`NFT #${position.tokenId} restaurado a posiciones activas.`);
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
    let currentTick: number | undefined;
    try {
      const contracts = v3Contracts(chain);
      const factory = new ethers.Contract(
        contracts.factory,
        V3_FACTORY_ABI,
        manager.runner
      );
      const poolAddress = (await factory.getPool(
        position.token0,
        position.token1,
        position.fee
      )) as string;
      if (poolAddress && poolAddress.toLowerCase() !== ZERO_ADDRESS) {
        const pool = new ethers.Contract(
          poolAddress,
          V3_POOL_ABI,
          manager.runner
        );
        const slot0 = await pool.slot0();
        currentTick = Number(slot0.tick);
      }
    } catch {
      currentTick = knownPool?.tick;
    }
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
      currentTick,
      inRange:
        typeof currentTick === "number"
          ? currentTick >= Number(position.tickLower) &&
            currentTick < Number(position.tickUpper)
          : undefined,
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
    label: string,
    chain: V3ChainKey
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
      const resetGas = (await token.approve.estimateGas(spender, 0)) as bigint;
      assertReasonableV3Gas(resetGas, chain, `Approve reset ${label}`);
      const resetTx = await token.approve(spender, 0);
      await waitForV3Receipt(resetTx.hash, chain);
    }
    setV3Status(`Aprobando ${label}.`);
    const approveGas = (await token.approve.estimateGas(spender, amount)) as bigint;
    assertReasonableV3Gas(approveGas, chain, `Approve ${label}`);
    const approveTx = await token.approve(spender, amount);
    await waitForV3Receipt(approveTx.hash, chain);
  };

  const ensureV4Erc20Allowance = async (
    tokenAddress: string,
    spender: string,
    amount: bigint,
    signer: ethers.Signer,
    label: string
  ) => {
    if (amount <= BigInt(0) || tokenAddress.toLowerCase() === ZERO_ADDRESS) {
      return;
    }
    const owner = await signer.getAddress();
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const current = (await token.allowance(owner, spender)) as bigint;
    if (current >= amount) {
      return;
    }
    if (current > BigInt(0)) {
      setV4Status(`Reseteando approve previo de ${label}.`);
      const resetGas = (await token.approve.estimateGas(spender, 0)) as bigint;
      assertReasonableV3Gas(resetGas, "robinhood", `Approve reset ${label}`);
      const resetTx = await token.approve(spender, 0);
      await waitForV3Receipt(resetTx.hash, "robinhood", 300000);
    }
    setV4Status(`Aprobando ${label}.`);
    const approveGas = (await token.approve.estimateGas(spender, amount)) as bigint;
    assertReasonableV3Gas(approveGas, "robinhood", `Approve ${label}`);
    const approveTx = await token.approve(spender, amount);
    await waitForV3Receipt(approveTx.hash, "robinhood", 300000);
  };

  const ensureV4Permit2Allowance = async (
    tokenAddress: string,
    spender: string,
    amount: bigint,
    signer: ethers.Signer,
    label: string
  ) => {
    if (amount <= BigInt(0) || tokenAddress.toLowerCase() === ZERO_ADDRESS) {
      return;
    }
    const owner = await signer.getAddress();
    const permit2 = new ethers.Contract(
      V4_ROBINHOOD_CONTRACTS.permit2,
      PERMIT2_ABI,
      signer
    );
    const [currentAmount, expiration] = (await permit2.allowance(
      owner,
      tokenAddress,
      spender
    )) as [bigint, bigint, bigint];
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    if (currentAmount >= amount && expiration > nowSeconds + BigInt(60)) {
      return;
    }

    const permitAmount = amount > MAX_UINT160 ? MAX_UINT160 : amount;
    setV4Status(`Aprobando Permit2 para ${label}.`);
    const gas = (await permit2.approve.estimateGas(
      tokenAddress,
      spender,
      permitAmount,
      PERMIT2_EXPIRATION
    )) as bigint;
    assertReasonableV3Gas(gas, "robinhood", `Permit2 approve ${label}`);
    const tx = await permit2.approve(
      tokenAddress,
      spender,
      permitAmount,
      PERMIT2_EXPIRATION
    );
    await waitForV3Receipt(tx.hash, "robinhood", 300000);
  };

  const getV3Signer = async (chain: V3ChainKey = v3Chain) => {
    const ethereum = (window as unknown as { ethereum?: InjectedEthereum })
      .ethereum;
    if (!ethereum) {
      throw new Error("MetaMask no está instalado.");
    }
    const accounts = (await ethereum.request({
      method: "eth_requestAccounts"
    })) as string[];
    let provider = new ethers.BrowserProvider(ethereum);
    const chainId = Number((await provider.getNetwork()).chainId);
    if (chainId !== V3_CHAIN_IDS[chain]) {
      const target = `0x${V3_CHAIN_IDS[chain].toString(16)}`;
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: target }]
        });
      } catch (switchError) {
        const networkConfig = NETWORKS.find((item) => item.key === chain);
        if (!networkConfig) {
          throw switchError;
        }
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: target,
              chainName: networkConfig.name,
              nativeCurrency: {
                name: networkConfig.symbol,
                symbol: networkConfig.symbol,
                decimals: 18
              },
              rpcUrls: [networkConfig.rpcUrl],
              blockExplorerUrls: [EXPLORER_ROOTS[chain]]
            }
          ]
        });
      }
      provider = new ethers.BrowserProvider(ethereum);
      const nextChainId = Number((await provider.getNetwork()).chainId);
      if (nextChainId !== V3_CHAIN_IDS[chain]) {
        throw new Error(
          `MetaMask quedó en ${nextChainId}. Cambiá a ${chain} antes de operar.`
        );
      }
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
      const contracts = v3Contracts(v3Chain);
      const factory = new ethers.Contract(
        contracts.factory,
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
      const price = priceFromSqrtPriceX96(
        slot0.sqrtPriceX96,
        token0.decimals,
        token1.decimals
      );
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

  const handleV4ScanPool = async () => {
    try {
      setV4Scanning(true);
      setV4Status("Escaneando pool V4 en Robinhood.");
      resetV4LoadedPosition();
      const fee = Number(v4Fee);
      const tickSpacing = Number(v4TickSpacing);
      if (!Number.isInteger(fee) || fee <= 0) {
        setV4Status("Fee inválida. Ejemplo: 500, 3000 o 10000.");
        return;
      }
      if (!Number.isInteger(tickSpacing) || tickSpacing <= 0) {
        setV4Status("Tick spacing inválido. Ejemplo: 10, 60 o 200.");
        return;
      }

      const readProvider = v3Provider("robinhood");
      const stateView = new ethers.Contract(
        V4_ROBINHOOD_CONTRACTS.stateView,
        V4_STATE_VIEW_ABI,
        readProvider
      );

      const result = await scanV4Pool(
        readProvider,
        stateView,
        v4CurrencyA,
        v4CurrencyB,
        fee,
        tickSpacing,
        v4Hooks
      );
      setV4Result(result);
      setV4Status(
        `V4 ${result.status}: ${result.token0Symbol}/${result.token1Symbol}.`
      );
    } catch (error) {
      console.error(error);
      setV4Result(null);
      setV4Status(
        error instanceof Error
          ? `No se pudo leer la pool V4: ${error.message}`
          : "No se pudo leer la pool V4."
      );
    } finally {
      setV4Scanning(false);
    }
  };

  const resetV4LoadedPosition = () => {
    setV4TokenId("");
    setV4Position(null);
    setV4MintUsdAmount("");
    setV4MintAmount0("");
    setV4MintAmount1("");
    setV4MintPreflightChecks([]);
    setV4MintGasEstimate(null);
    setV4AddAmount0("");
    setV4AddAmount1("");
    setV4PreflightChecks([]);
    setV4GasEstimate(null);
    setV4LastTxHash("");
    setV4LiquidityChange(null);
  };

  const handleV4ScanMultiplePools = async () => {
    try {
      setV4MultiScanning(true);
      setV4MultiResults([]);
      setV4Status("Escaneando pools V4 predefinidas en Robinhood.");
      resetV4LoadedPosition();
      const readProvider = v3Provider("robinhood");
      const stateView = new ethers.Contract(
        V4_ROBINHOOD_CONTRACTS.stateView,
        V4_STATE_VIEW_ABI,
        readProvider
      );
      const scannedAt = new Date().toLocaleTimeString();
      const settled = await Promise.allSettled(
        V4_ROBINHOOD_POOL_CANDIDATES.map(async (candidate) => ({
          candidate,
          result: await scanV4Pool(
            readProvider,
            stateView,
            candidate.currencyA,
            candidate.currencyB,
            candidate.fee,
            candidate.tickSpacing,
            candidate.hooks
          )
        }))
      );
      const results = settled.map((item, index): V4MultiPoolScanResult => {
        const candidate = V4_ROBINHOOD_POOL_CANDIDATES[index];
        if (item.status === "fulfilled") {
          return {
            candidate: item.value.candidate,
            result: item.value.result,
            error: null,
            checkedAt: item.value.result.checkedAt
          };
        }

        return {
          candidate,
          result: null,
          error:
            item.reason instanceof Error
              ? item.reason.message
              : String(item.reason),
          checkedAt: scannedAt
        };
      });
      const activePools = results.filter(
        (item) => item.result?.status === "Activa"
      );
      setV4MultiResults(results);
      if (activePools[0]?.result) {
        setV4Result(activePools[0].result);
      }
      setV4Status(
        `Scanner multi-pool: ${activePools.length}/${results.length} pools activas.`
      );
    } catch (error) {
      console.error(error);
      setV4Status(
        error instanceof Error
          ? `No se pudo ejecutar el scanner multi-pool: ${error.message}`
          : "No se pudo ejecutar el scanner multi-pool."
      );
    } finally {
      setV4MultiScanning(false);
    }
  };

  const handleV4LoadCandidate = (
    candidate: V4PoolCandidate,
    result: V4ScanResult | null
  ) => {
    resetV4LoadedPosition();
    setV4CurrencyA(candidate.currencyA);
    setV4CurrencyB(candidate.currencyB);
    setV4Fee(candidate.fee.toString());
    setV4TickSpacing(candidate.tickSpacing.toString());
    setV4Hooks(candidate.hooks);
    if (result) {
      setV4Result(result);
      setV4Status(
        `Pool cargada: ${result.token0Symbol}/${result.token1Symbol} ${result.status}.`
      );
      return;
    }
    setV4Status(`Preset cargado: ${candidate.label}.`);
  };

  const handleV4ReadPosition = async () => {
    try {
      setV4ReadingPosition(true);
      setV4Status("Leyendo NFT V4 en Robinhood.");
      setV4Position(null);
      setV4PreflightChecks([]);
      setV4GasEstimate(null);
      setV4LastTxHash("");
      setV4LiquidityChange(null);
      const tokenId = v4TokenId.trim();
      if (!/^\d+$/.test(tokenId)) {
        setV4Status("Ingresá un tokenId V4 válido.");
        return;
      }

      const readProvider = v3Provider("robinhood");
      const positionManager = new ethers.Contract(
        V4_ROBINHOOD_CONTRACTS.positionManager,
        V4_POSITION_MANAGER_VIEW_ABI,
        readProvider
      );
      const stateView = new ethers.Contract(
        V4_ROBINHOOD_CONTRACTS.stateView,
        V4_STATE_VIEW_ABI,
        readProvider
      );

      const [owner, poolAndInfo, positionLiquidity] = await Promise.all([
        positionManager.ownerOf(tokenId) as Promise<string>,
        positionManager.getPoolAndPositionInfo(tokenId) as Promise<
          [
            {
              currency0: string;
              currency1: string;
              fee: bigint;
              tickSpacing: bigint;
              hooks: string;
            },
            bigint
          ]
        >,
        positionManager.getPositionLiquidity(tokenId) as Promise<bigint>
      ]);
      const [poolKey, infoValue] = poolAndInfo;
      const poolId = v4PoolId(
        poolKey.currency0,
        poolKey.currency1,
        Number(poolKey.fee),
        Number(poolKey.tickSpacing),
        poolKey.hooks
      );
      const positionInfo = decodeV4PositionInfo(infoValue);
      const [meta0, meta1, slot0, poolLiquidity] = await Promise.all([
        readV4CurrencyMeta(readProvider, poolKey.currency0, "TOKEN0"),
        readV4CurrencyMeta(readProvider, poolKey.currency1, "TOKEN1"),
        stateView.getSlot0(poolId) as Promise<[bigint, bigint, bigint, bigint]>,
        stateView.getLiquidity(poolId) as Promise<bigint>
      ]);
      const tick = Number(slot0[1]);
      const price = priceFromSqrtPriceX96(
        slot0[0],
        meta0.decimals,
        meta1.decimals
      );
      const poolActive = slot0[0] > BigInt(0) && poolLiquidity > BigInt(0);
      const poolUsability = assessV4PoolUsability(
        slot0[0],
        poolLiquidity,
        price,
        poolKey.hooks
      );
      const result: V4PositionView = {
        status: poolActive ? "Activa" : "No activa",
        ...poolUsability,
        tokenId,
        owner,
        poolId,
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: Number(poolKey.fee),
        tickSpacing: Number(poolKey.tickSpacing),
        hooks: poolKey.hooks,
        token0Symbol: meta0.symbol,
        token1Symbol: meta1.symbol,
        token0Decimals: meta0.decimals,
        token1Decimals: meta1.decimals,
        tick,
        price,
        liquidity: positionLiquidity.toString(),
        lpFee: `${Number(slot0[3]) / 10000}%`,
        protocolFee: slot0[2].toString(),
        checkedAt: new Date().toLocaleTimeString(),
        tickLower: positionInfo.tickLower,
        tickUpper: positionInfo.tickUpper,
        inRange:
          tick >= positionInfo.tickLower && tick < positionInfo.tickUpper,
        rangePriceLower: priceFromTick(
          positionInfo.tickLower,
          meta0.decimals,
          meta1.decimals
        ),
        rangePriceUpper: priceFromTick(
          positionInfo.tickUpper,
          meta0.decimals,
          meta1.decimals
        )
      };

      setV4Position(result);
      setV4CurrencyA(poolKey.currency0);
      setV4CurrencyB(poolKey.currency1);
      setV4Fee(Number(poolKey.fee).toString());
      setV4TickSpacing(Number(poolKey.tickSpacing).toString());
      setV4Hooks(poolKey.hooks);
      setV4Result({
        ...result,
        liquidity: poolLiquidity.toString()
      });
      setV4Status(
        `NFT V4 #${tokenId}: ${result.token0Symbol}/${result.token1Symbol} ${result.inRange ? "dentro de rango" : "fuera de rango"}.`
      );
    } catch (error) {
      console.error(error);
      setV4Position(null);
      setV4Status(
        error instanceof Error
          ? `No se pudo leer el NFT V4: ${error.message}`
          : "No se pudo leer el NFT V4."
      );
    } finally {
      setV4ReadingPosition(false);
    }
  };

  const handleV4TwoTokenPreflight = async () => {
    try {
      setV4Preflighting(true);
      setV4PreflightChecks([]);
      setV4GasEstimate(null);
      if (!v4Position) {
        setV4Status("Primero leé el NFT V4.");
        return;
      }

      const amount0Raw = parseTokenUnits(
        v4AddAmount0,
        v4Position.token0Decimals
      );
      const amount1Raw = parseTokenUnits(
        v4AddAmount1,
        v4Position.token1Decimals
      );
      if (amount0Raw <= BigInt(0) || amount1Raw <= BigInt(0)) {
        setV4Status("Ingresá montos mayores a cero para los dos tokens.");
        return;
      }

      setV4Status("Probando entrada V4 con dos tokens. Solo lectura.");
      const signer = await getV3Signer("robinhood");
      const owner = await signer.getAddress();
      const signerProvider = signer.provider;
      const manager = new ethers.Contract(
        V4_ROBINHOOD_CONTRACTS.positionManager,
        V4_POSITION_MANAGER_VIEW_ABI,
        signerProvider
      );
      const nftOwner = (await manager.ownerOf(v4Position.tokenId)) as string;

      const readBalance = async (currency: string): Promise<bigint> => {
        if (currency.toLowerCase() === ZERO_ADDRESS) {
          return signerProvider.getBalance(owner);
        }
        const token = new ethers.Contract(currency, ERC20_ABI, signerProvider);
        return (await token.balanceOf(owner)) as bigint;
      };

      const readAllowance = async (
        currency: string,
        decimals: number
      ): Promise<{ raw: bigint; label: string }> => {
        if (currency.toLowerCase() === ZERO_ADDRESS) {
          return { raw: ethers.MaxUint256, label: "No requiere approve" };
        }
        const token = new ethers.Contract(currency, ERC20_ABI, signerProvider);
        const allowance = (await token.allowance(
          owner,
          V4_ROBINHOOD_CONTRACTS.permit2
        )) as bigint;
        return {
          raw: allowance,
          label: `${formatV3RawAmount(allowance, decimals)} aprobado hacia Permit2`
        };
      };

      const [balance0, balance1, allowance0, allowance1] = await Promise.all([
        readBalance(v4Position.currency0),
        readBalance(v4Position.currency1),
        readAllowance(v4Position.currency0, v4Position.token0Decimals),
        readAllowance(v4Position.currency1, v4Position.token1Decimals)
      ]);

      const checks: V4PreflightCheck[] = [
        {
          label: "Wallet",
          value: shortAddress(owner),
          ok: true
        },
        {
          label: "Dueño NFT",
          value:
            nftOwner.toLowerCase() === owner.toLowerCase()
              ? `OK ${shortAddress(nftOwner)}`
              : `No coincide: ${shortAddress(nftOwner)}`,
          ok: nftOwner.toLowerCase() === owner.toLowerCase()
        },
        {
          label: `Saldo ${v4Position.token0Symbol}`,
          value: `${formatV3RawAmount(
            balance0,
            v4Position.token0Decimals
          )} / necesita ${formatHumanTokenAmount(
            parseHumanAmount(v4AddAmount0) || 0,
            v4Position.token0Symbol
          )}`,
          ok: balance0 >= amount0Raw
        },
        {
          label: `Saldo ${v4Position.token1Symbol}`,
          value: `${formatV3RawAmount(
            balance1,
            v4Position.token1Decimals
          )} / necesita ${formatHumanTokenAmount(
            parseHumanAmount(v4AddAmount1) || 0,
            v4Position.token1Symbol
          )}`,
          ok: balance1 >= amount1Raw
        },
        {
          label: `Permiso ${v4Position.token0Symbol}`,
          value: allowance0.label,
          ok:
            v4Position.currency0.toLowerCase() === ZERO_ADDRESS ||
            allowance0.raw >= amount0Raw
        },
        {
          label: `Permiso ${v4Position.token1Symbol}`,
          value: allowance1.label,
          ok:
            v4Position.currency1.toLowerCase() === ZERO_ADDRESS ||
            allowance1.raw >= amount1Raw
        }
      ];

      setV4PreflightChecks(checks);
      setV4Status(
        checks.every((item) => item.ok)
          ? "Prueba dos tokens OK. Siguiente paso: estimar gas real de agregar liquidez."
          : "Prueba dos tokens incompleta. Revisá los puntos marcados."
      );
    } catch (error) {
      console.error(error);
      setV4Status(
        error instanceof Error
          ? `No se pudo probar V4: ${error.message}`
          : "No se pudo probar V4."
      );
    } finally {
      setV4Preflighting(false);
    }
  };

  const prepareV4LiquidityCall = async (): Promise<V4LiquidityCall | null> => {
    if (!v4Position) {
      setV4Status("Primero leé el NFT V4.");
      return null;
    }

    const amount0Raw = parseTokenUnits(
      v4AddAmount0,
      v4Position.token0Decimals
    );
    const amount1Raw = parseTokenUnits(
      v4AddAmount1,
      v4Position.token1Decimals
    );
    const liquidityRaw = estimatedV4LiquidityRaw(v4LiquiditySimulation);
    if (
      amount0Raw <= BigInt(0) ||
      amount1Raw <= BigInt(0) ||
      liquidityRaw <= BigInt(0)
    ) {
      setV4Status("Ingresá montos válidos antes de operar V4.");
      return null;
    }

    const signer = await getV3Signer("robinhood");
    const owner = await signer.getAddress();
    const manager = new ethers.Contract(
      V4_ROBINHOOD_CONTRACTS.positionManager,
      V4_POSITION_MANAGER_VIEW_ABI,
      signer
    );
    const amount0Max = addV4AmountBuffer(amount0Raw);
    const amount1Max = addV4AmountBuffer(amount1Raw);
    const unlockData = encodeV4IncreaseLiquidityData(
      v4Position,
      liquidityRaw,
      amount0Max,
      amount1Max,
      owner
    );
    const value = v4NativeValue(v4Position, amount0Max, amount1Max);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    if (!signer.provider) {
      throw new Error("MetaMask no devolvió provider para Robinhood.");
    }

    return { signer, provider: signer.provider, manager, unlockData, deadline, value };
  };

  const handleV4EstimateGas = async () => {
    try {
      setV4EstimatingGas(true);
      setV4GasEstimate(null);
      const prepared = await prepareV4LiquidityCall();
      if (!prepared) {
        return;
      }

      setV4Status("Estimando gas V4. No se firma ni se envía transacción.");
      const gas = (await prepared.manager.modifyLiquidities.estimateGas(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      )) as bigint;
      const feeData = await prepared.provider.getFeeData();
      const gasPrice =
        feeData.maxFeePerGas ?? feeData.gasPrice ?? BigInt(0);
      const estimatedCost = gasPrice > BigInt(0) ? gas * gasPrice : BigInt(0);
      const costText =
        estimatedCost > BigInt(0)
          ? `Costo estimado: ${ethers.formatEther(estimatedCost)} ETH.`
          : "El provider no devolvió precio de gas.";

      if (gas > V4_DANGER_GAS) {
        setV4GasEstimate({
          status: "error",
          title: "Gas bloqueado",
          detail: `${formatGasUnits(
            gas
          )} unidades. Supera el límite extremo de ${formatGasUnits(
            V4_DANGER_GAS
          )}. ${costText}`
        });
        setV4Status("Gas V4 demasiado alto. No firmes esta operación.");
        return;
      }

      if (gas > V4_MAX_REASONABLE_GAS) {
        setV4GasEstimate({
          status: "warn",
          title: "Gas alto",
          detail: `${formatGasUnits(
            gas
          )} unidades. Revisar antes de seguir. ${costText}`
        });
        setV4Status("Gas V4 alto. Conviene revisar antes de firmar.");
        return;
      }

      setV4GasEstimate({
        status: "ok",
        title: "Gas normal",
        detail: `${formatGasUnits(gas)} unidades. ${costText}`
      });
      setV4Status("Estimación de gas V4 normal.");
    } catch (error) {
      console.error(error);
      setV4GasEstimate({
        status: "error",
        title: "No se pudo estimar gas",
        detail: describeV4EstimateError(error)
      });
      setV4Status("No se pudo estimar gas V4. No firmes todavía.");
    } finally {
      setV4EstimatingGas(false);
    }
  };

  const handleV4AddLiquidity = async () => {
    let sentHash = "";
    let liquidityBefore = BigInt(0);
    try {
      setV4AddingLiquidity(true);
      setV4LastTxHash("");
      setV4LiquidityChange(null);
      if (!v4Position) {
        setV4Status("Primero leé el NFT V4.");
        return;
      }
      if (v4GasEstimate?.status !== "ok") {
        setV4Status("Primero necesitás una estimación de gas V4 en verde.");
        return;
      }
      if (!v4ValueEstimate) {
        setV4Status("Primero necesitás una valuación V4 visible.");
        return;
      }

      setV4Status(
        `Preparando operación real: agregar liquidez al NFT #${v4Position.tokenId}.`
      );
      const prepared = await prepareV4LiquidityCall();
      if (!prepared) {
        return;
      }

      const gas = (await prepared.manager.modifyLiquidities.estimateGas(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      )) as bigint;
      if (gas > V4_MAX_REASONABLE_GAS) {
        setV4GasEstimate({
          status: gas > V4_DANGER_GAS ? "error" : "warn",
          title: gas > V4_DANGER_GAS ? "Gas bloqueado" : "Gas alto",
          detail: `${formatGasUnits(
            gas
          )} unidades antes de firmar. Operación detenida.`
        });
        setV4Status("Gas V4 dejó de estar normal. No se abrió firma.");
        return;
      }

      setV4Status(
        `MetaMask va a pedir firma real para agregar liquidez al NFT #${v4Position.tokenId}.`
      );
      liquidityBefore = await readV4PositionLiquidity(v4Position.tokenId);
      const tx = await prepared.manager.modifyLiquidities(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      );
      sentHash = tx.hash;
      setV4LastTxHash(tx.hash);
      setV4Status(
        `Transacción enviada: ${tx.hash.slice(
          0,
          10
        )}... Esperando confirmación.`
      );
      await waitForV3Receipt(tx.hash, "robinhood", 300000);
      const liquidityAfter = await readV4PositionLiquidity(v4Position.tokenId);
      const delta =
        liquidityAfter > liquidityBefore
          ? liquidityAfter - liquidityBefore
          : BigInt(0);
      const beforeValue = estimateV4ValueFromLiquidity(
        liquidityBefore,
        v4Position.liquidity,
        v4ValueEstimate.currentValue
      );
      const afterValue = estimateV4ValueFromLiquidity(
        liquidityAfter,
        v4Position.liquidity,
        v4ValueEstimate.currentValue
      );
      const liquidityChange = {
        beforeValue,
        afterValue,
        deltaValue: Math.max(afterValue - beforeValue, 0),
        currency: v4ValueEstimate.currency
      };
      setV4Status(
        delta > BigInt(0)
          ? `Liquidez V4 agregada al NFT #${v4Position.tokenId}.`
          : `La tx confirmó, pero la liquidez del NFT #${v4Position.tokenId} no cambió.`
      );
      await handleV4ReadPosition();
      setV4LastTxHash(tx.hash);
      setV4LiquidityChange(liquidityChange);
    } catch (error) {
      console.error(error);
      const timeoutHash = sentHash || v4LastTxHash;
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout") &&
        timeoutHash
      ) {
        try {
          if (v4Position && liquidityBefore > BigInt(0)) {
            const liquidityAfter = await readV4PositionLiquidity(
              v4Position.tokenId
            );
            const delta =
              liquidityAfter > liquidityBefore
                ? liquidityAfter - liquidityBefore
                : BigInt(0);
            if (v4ValueEstimate) {
              const beforeValue = estimateV4ValueFromLiquidity(
                liquidityBefore,
                v4Position.liquidity,
                v4ValueEstimate.currentValue
              );
              const afterValue = estimateV4ValueFromLiquidity(
                liquidityAfter,
                v4Position.liquidity,
                v4ValueEstimate.currentValue
              );
              setV4LiquidityChange({
                beforeValue,
                afterValue,
                deltaValue: Math.max(afterValue - beforeValue, 0),
                currency: v4ValueEstimate.currency
              });
            }
            if (delta > BigInt(0)) {
              setV4Status(
                `La app no vio la confirmación, pero la liquidez del NFT #${v4Position.tokenId} aumentó.`
              );
              return;
            }
          }
        } catch {
          // Keep the timeout path below if the post-check also cannot read.
        }
        setV4Status(
          `La transacción fue enviada pero no confirmó en la app. Revisá el explorer: ${timeoutHash.slice(
            0,
            10
          )}...`
        );
        setV4LastTxHash(timeoutHash);
        return;
      }
      setV4Status(
        error instanceof Error
          ? `No se pudo agregar liquidez V4: ${describeV4EstimateError(error)}`
          : "No se pudo agregar liquidez V4."
      );
    } finally {
      setV4AddingLiquidity(false);
    }
  };

  const prepareV4DecreaseCall = async (
    mode: "collect" | "withdraw"
  ): Promise<V4LiquidityCall | null> => {
    if (!v4Position) {
      setV4Status("Primero leé el NFT V4.");
      return null;
    }

    const signer = await getV3Signer("robinhood");
    const owner = await signer.getAddress();
    if (!signer.provider) {
      throw new Error("MetaMask no devolvió provider para Robinhood.");
    }

    const manager = new ethers.Contract(
      V4_ROBINHOOD_CONTRACTS.positionManager,
      V4_POSITION_MANAGER_VIEW_ABI,
      signer
    );
    const nftOwner = (await manager.ownerOf(v4Position.tokenId)) as string;
    if (nftOwner.toLowerCase() !== owner.toLowerCase()) {
      setV4Status("Ese NFT V4 no pertenece a la MetaMask conectada.");
      return null;
    }

    const liveLiquidity = (await manager.getPositionLiquidity(
      v4Position.tokenId
    )) as bigint;
    if (mode === "withdraw" && liveLiquidity <= BigInt(0)) {
      setV4Status("Ese NFT V4 ya no tiene liquidez para retirar.");
      return null;
    }

    const unlockData = encodeV4DecreaseLiquidityData(
      v4Position,
      mode === "collect" ? BigInt(0) : liveLiquidity,
      owner
    );
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

    return {
      signer,
      provider: signer.provider,
      manager,
      unlockData,
      deadline,
      value: BigInt(0)
    };
  };

  const executeV4Decrease = async (mode: "collect" | "withdraw") => {
    const isWithdraw = mode === "withdraw";
    let sentHash = "";
    try {
      if (isWithdraw) {
        setV4WithdrawingLiquidity(true);
      } else {
        setV4CollectingFees(true);
      }
      setV4LastTxHash("");
      setV4LiquidityChange(null);
      setV4GasEstimate(null);
      if (
        isWithdraw &&
        !window.confirm(
          "Vas a retirar toda la liquidez V4 con minimos recibidos en 0. MetaMask mostrara la transaccion real. Continuar?"
        )
      ) {
        setV4Status("Retiro V4 cancelado antes de abrir MetaMask.");
        return;
      }
      setV4Status(
        isWithdraw
          ? "Preparando retiro V4. MetaMask pedirá confirmación real."
          : "Preparando cobro de fees V4. MetaMask pedirá confirmación real."
      );

      const prepared = await prepareV4DecreaseCall(mode);
      if (!prepared) {
        return;
      }

      const gas = (await prepared.manager.modifyLiquidities.estimateGas(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      )) as bigint;
      if (gas > V4_MAX_REASONABLE_GAS) {
        setV4GasEstimate({
          status: gas > V4_DANGER_GAS ? "error" : "warn",
          title: gas > V4_DANGER_GAS ? "Gas bloqueado" : "Gas alto",
          detail: `${formatGasUnits(
            gas
          )} unidades antes de firmar. Operación detenida.`
        });
        setV4Status("Gas V4 alto. No se abrió firma.");
        return;
      }

      const tx = await prepared.manager.modifyLiquidities(
        prepared.unlockData,
        prepared.deadline,
        { value: prepared.value }
      );
      sentHash = tx.hash;
      setV4LastTxHash(tx.hash);
      setV4Status(`Tx V4 enviada: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      const refreshed = (await prepared.manager.getPositionLiquidity(
        v4Position?.tokenId
      )) as bigint;
      if (v4Position) {
        setV4Position({
          ...v4Position,
          liquidity: refreshed.toString(),
          checkedAt: new Date().toLocaleTimeString()
        });
      }
      setV4Status(
        isWithdraw
          ? `Liquidez retirada del NFT V4 #${v4Position?.tokenId}.`
          : `Fees V4 cobradas del NFT #${v4Position?.tokenId}.`
      );
    } catch (error) {
      console.error(error);
      if (sentHash) {
        setV4LastTxHash(sentHash);
      }
      setV4Status(
        error instanceof Error
          ? `No se pudo completar la operación V4: ${describeV4EstimateError(error)}`
          : "No se pudo completar la operación V4."
      );
    } finally {
      if (isWithdraw) {
        setV4WithdrawingLiquidity(false);
      } else {
        setV4CollectingFees(false);
      }
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

        const contracts = v3Contracts(v3Chain);
        if (!contracts.quoter) {
          setV3Status("Esta red no tiene quoter V3 configurado para swap interno.");
          return;
        }
        const quoter = new ethers.Contract(contracts.quoter, V3_QUOTER_ABI, signer);
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
          contracts.swapRouter,
          swapAmount,
          signer,
          `${inputSymbol} para swap`,
          v3Chain
        );

        const outputBalanceBefore = (await outputTokenContract.balanceOf(
          owner
        )) as bigint;
        const router = new ethers.Contract(
          contracts.swapRouter,
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
        setV3Status(`Swap enviado: ${swapTx.hash.slice(0, 10)}...`);
        await waitForV3Receipt(swapTx.hash, v3Chain);

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

      const contracts = v3Contracts(v3Chain);
      const manager = new ethers.Contract(
        contracts.positionManager,
        V3_POSITION_MANAGER_ABI,
        signer
      );
      const poolAlreadyExists =
        selectedV3Scan?.poolAddress?.toLowerCase() !== ZERO_ADDRESS;

      if (canInitializeSeedPool && !poolAlreadyExists) {
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
        setV3Status(`Inicialización enviada: ${initTx.hash.slice(0, 10)}...`);
        await waitForV3Receipt(initTx.hash, v3Chain);
        setV3Status("Pool inicializada. Preparando approvals para mint.");
      } else if (canInitializeSeedPool) {
        setV3Status("Pool existente. Preparando approvals para mint.");
      }

      await ensureV3Allowance(
        token0.address,
        contracts.positionManager,
        amount0Desired,
        signer,
        `${selectedV3Pool.token0} para mint`,
        v3Chain
      );
      await ensureV3Allowance(
        token1.address,
        contracts.positionManager,
        amount1Desired,
        signer,
        `${selectedV3Pool.token1} para mint`,
        v3Chain
      );

      setV3Status("Enviando mint al Position Manager.");
      const mintParams = {
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
      };
      const mintGas = (await manager.mint.estimateGas(mintParams)) as bigint;
      assertReasonableV3Gas(mintGas, v3Chain, `Mint ${selectedV3Pool.label}`);
      const mintGasLimit = bufferedGasLimit(mintGas);
      setV3Status(
        `Enviando mint al Position Manager. Gas estimado ${formatGasUnits(
          mintGas
        )}, límite ${formatGasUnits(mintGasLimit)}.`
      );
      const mintTx = await manager.mint(mintParams, {
        gasLimit: mintGasLimit
      });
      setV3Status(`Mint enviado: ${mintTx.hash.slice(0, 10)}...`);
      const receipt = await waitForV3Receipt(mintTx.hash, v3Chain);
      const mintedTokenId = extractMintedV3TokenId(
        receipt,
        owner,
        contracts.positionManager
      );
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
        v3Contracts(v3Chain).positionManager,
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
        v3Contracts(v3Chain).positionManager,
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

  const handleV3DiscoverPositions = async () => {
    try {
      setV3Discovering(true);
      const signer = await getV3Signer();
      const owner = await signer.getAddress();
      setV3Wallet(owner);
      const manager = new ethers.Contract(
        v3Contracts(v3Chain).positionManager,
        V3_POSITION_MANAGER_ABI,
        signer
      );
      const balance = (await manager.balanceOf(owner)) as bigint;
      if (balance === BigInt(0)) {
        const ownerKey = owner.toLowerCase();
        const raw = localStorage.getItem(V3_POSITION_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, V3Position[]>) : {};
        const remaining = (parsed[ownerKey] ?? []).filter(
          (item) => item.chain !== v3Chain
        );
        parsed[ownerKey] = remaining;
        localStorage.setItem(V3_POSITION_KEY, JSON.stringify(parsed));
        setV3Positions(remaining);
        setV3Status(`No hay NFTs V3 para ${shortAddress(owner)} en ${v3Chain}.`);
        return;
      }

      setV3Status(`Buscando ${balance.toString()} NFT(s) V3 en ${v3Chain}.`);
      const discovered: V3Position[] = [];
      for (let index = BigInt(0); index < balance; index += BigInt(1)) {
        const tokenId = await manager.tokenOfOwnerByIndex(owner, index);
        discovered.push(
          await readV3Position(manager, tokenId.toString(), v3Chain, owner)
        );
      }

      const ownerKey = owner.toLowerCase();
      const raw = localStorage.getItem(V3_POSITION_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, V3Position[]>) : {};
      const existing = parsed[ownerKey] ?? [];
      const otherChains = existing.filter((item) => item.chain !== v3Chain);
      const usedRaw = localStorage.getItem(V3_USED_POSITION_KEY);
      const usedParsed = usedRaw
        ? (JSON.parse(usedRaw) as Record<string, V3UsedPosition[]>)
        : {};
      const hidden = usedParsed[ownerKey] ?? [];
      const visibleDiscovered = discovered.filter(
        (position) =>
          !hidden.some(
            (item) =>
              item.chain === position.chain &&
              item.tokenId === position.tokenId
          )
      );
      const merged = [...visibleDiscovered, ...otherChains];
      parsed[ownerKey] = merged;
      localStorage.setItem(V3_POSITION_KEY, JSON.stringify(parsed));
      setV3Positions(merged);
      setV3Status(
        `Encontrados ${discovered.length} NFT(s) V3 en ${v3Chain}; ${visibleDiscovered.length} visibles.`
      );
    } catch (error) {
      console.error(error);
      setV3Status("No se pudieron buscar los NFTs V3 de esta wallet.");
    } finally {
      setV3Discovering(false);
    }
  };

  const handleV3Collect = async (position: V3Position) => {
    try {
      if (!v3HasCollectibleFees(position)) {
        setV3Status(`NFT #${position.tokenId} no tiene fees para cobrar.`);
        return;
      }
      setV3Chain(position.chain);
      const signer = await getV3Signer(position.chain);
      const recipient = await signer.getAddress();
      const manager = new ethers.Contract(
        v3Contracts(position.chain).positionManager,
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
        v3Contracts(position.chain).positionManager,
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
                nativo. No transfieras ZUM manualmente al contrato premium:
                usá el botón de pago de la app.
              </p>
              <div className={styles.zumActions}>
                <button className={styles.softButton} onClick={addZumToMetaMask}>
                  Agregar ZUM a MetaMask
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
              <div className={styles.strategyGrid}>
                <div className={styles.strategyCard}>
                  <div>
                    <span>Blue Chip Rotation V3</span>
                    <strong>WBTC/WETH · Arbitrum · 0.05%</strong>
                    <small>
                      No es estable. Sirve si aceptarías quedar 100% en WBTC o
                      100% en WETH.
                    </small>
                  </div>
                  <button
                    className={styles.softButton}
                    onClick={() => {
                      setV3Chain("arbitrum");
                      setV3PoolId("arb-wbtc-weth-500");
                      setV3Profile("conservative");
                      setV3EntryMode("single");
                      setV3Status(
                        "Blue Chip Rotation cargada: WBTC/WETH 0.05% en Arbitrum."
                      );
                    }}
                    disabled={isLocked || v3Scanning || v3Executing}
                  >
                    Cargar
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <label>Red</label>
                <select
                  value={v3Chain}
                  onChange={(event) => setV3Chain(event.target.value as V3ChainKey)}
                >
                  <option value="arbitrum">Arbitrum</option>
                  <option value="ethereum">Ethereum</option>
                  <option value="polygon">Polygon</option>
                  <option value="robinhood">Robinhood Chain</option>
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
                <>
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
                  <p className={styles.v3ManualHint}>{v3ManualRatioHint}</p>
                </>
              )}
              {v3EntryMode === "single" ? (
                <div className={styles.field}>
                  <label>Slippage máximo (%)</label>
                  <input
                    value={v3Slippage}
                    onChange={(event) => setV3Slippage(event.target.value)}
                    placeholder="1"
                    inputMode="decimal"
                  />
                </div>
              ) : (
                <p className={styles.v3ManualHint}>
                  En manual no hay swap interno: el slippage no aplica. La
                  posición usa los dos montos que cargás.
                </p>
              )}
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
              {v3Chain === "robinhood" ? (
                <p className={styles.v3ManualHint}>
                  Robinhood está en modo experimental: usá modo manual dos
                  tokens. Antes de aprobar o mintear, la app corta si el gas
                  estimado supera el límite de la red.
                </p>
              ) : null}
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
                  <span>
                    {v3EntryMode === "single"
                      ? "Mínimo con slippage"
                      : "Control manual"}
                  </span>
                  <strong>
                    {v3EntryMode === "single"
                      ? `${v3EntryEstimate.minAfterSlippage.toLocaleString(
                          "en-US",
                          { maximumFractionDigits: 6 }
                        )} ${selectedV3Pool.inputToken}`
                      : "Sin swap interno"}
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
                <button
                  className={styles.outline}
                  onClick={handleV3DiscoverPositions}
                  disabled={isLocked || v3Discovering}
                >
                  {v3Discovering ? "Buscando..." : "Buscar mis NFTs V3"}
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
                        <div className={styles.v3PositionHeader}>
                          <p className={styles.txHash}>NFT #{position.tokenId}</p>
                          <span
                            className={`${styles.v3RangeBadge} ${
                              position.liquidity === "0"
                                ? styles.v3RangeNeutral
                                : position.inRange === true
                                  ? styles.v3RangeIn
                                  : position.inRange === false
                                    ? styles.v3RangeOut
                                    : styles.v3RangeNeutral
                            }`}
                          >
                            {position.liquidity === "0"
                              ? "Sin liquidez"
                              : position.inRange === true
                                ? "En rango"
                                : position.inRange === false
                                  ? "Fuera de rango"
                                  : "Actualizar estado"}
                          </span>
                        </div>
                        <p className={styles.txMeta}>
                          {position.label} · {position.feeLabel} ·{" "}
                          {position.chain}
                        </p>
                        <p className={styles.txTime}>
                          Liquidez: {position.liquidity} · Rango:{" "}
                          {position.tickLower} / {position.tickUpper}
                        </p>
                        {typeof position.currentTick === "number" ? (
                          <p className={styles.txTime}>
                            Tick actual: {position.currentTick}
                          </p>
                        ) : null}
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
                          disabled={isLocked || !v3HasCollectibleFees(position)}
                        >
                          {v3HasCollectibleFees(position)
                            ? "Collect fees"
                            : "Sin fees"}
                        </button>
                        <button
                          className={styles.outline}
                          onClick={() => handleV3Withdraw(position)}
                          disabled={isLocked || position.liquidity === "0"}
                        >
                          Retirar
                        </button>
                        <button
                          className={styles.outline}
                          onClick={() => handleV3HidePosition(position)}
                          disabled={isLocked}
                        >
                          Ocultar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {v3UsedPositions.length > 0 ? (
                <div className={styles.v3UsedBox}>
                  <div>
                    <h4>NFTs usados</h4>
                    <p>
                      Ocultos solo en Zumpay. Siguen existiendo on-chain y se
                      pueden restaurar.
                    </p>
                  </div>
                  <div className={styles.v3PositionList}>
                    {v3UsedPositions.map((position) => (
                      <div
                        key={`used-${position.chain}-${position.tokenId}`}
                        className={styles.v3UsedRow}
                      >
                        <div>
                          <strong>NFT #{position.tokenId}</strong>
                          <span>
                            {position.label} · {position.feeLabel} ·{" "}
                            {position.chain}
                          </span>
                          <small>
                            Liquidez: {position.liquidity} · Fees:{" "}
                            {position.fees0 ?? "0"}{" "}
                            {position.token0Symbol ?? "token0"} /{" "}
                            {position.fees1 ?? "0"}{" "}
                            {position.token1Symbol ?? "token1"}
                          </small>
                        </div>
                        <button
                          className={styles.outline}
                          onClick={() => handleV3RestorePosition(position)}
                          disabled={isLocked}
                        >
                          Restaurar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {v3Status ? <p className={styles.status}>{v3Status}</p> : null}
            </div>
          </div>
        </section>

        <section className={styles.sectionBlock}>
          <div>
            <h2>Pools V4 Robinhood</h2>
            <p className={styles.subtitle}>
              Scanner read-only para oportunidades V4. No firma ni mueve fondos.
            </p>
          </div>
          <div className={styles.sectionGrid}>
            <div className={styles.walletCard}>
              <h3>Scanner V4</h3>
              <div className={styles.ctas}>
                <button
                  className={styles.outline}
                  onClick={() => {
                    resetV4LoadedPosition();
                    setV4CurrencyA(V3_TOKENS.robinhood.WETH.address);
                    setV4CurrencyB(V3_TOKENS.robinhood.USDG.address);
                    setV4Fee("500");
                    setV4TickSpacing("10");
                    setV4Hooks(ZERO_ADDRESS);
                    setV4Status("Preset WETH/USDG cargado.");
                  }}
                  disabled={v4Scanning || v4MultiScanning}
                >
                  WETH/USDG
                </button>
                <button
                  className={styles.outline}
                  onClick={() => {
                    resetV4LoadedPosition();
                    setV4CurrencyA(V3_TOKENS.robinhood.USDe.address);
                    setV4CurrencyB(V3_TOKENS.robinhood.USDG.address);
                    setV4Fee("100");
                    setV4TickSpacing("1");
                    setV4Hooks(ZERO_ADDRESS);
                    setV4Status("Preset USDe/USDG Stable Core cargado.");
                  }}
                  disabled={v4Scanning || v4MultiScanning}
                >
                  USDe/USDG
                </button>
                <button
                  className={styles.outline}
                  onClick={() => {
                    resetV4LoadedPosition();
                    setV4CurrencyA("");
                    setV4CurrencyB(V3_TOKENS.robinhood.USDG.address);
                    setV4Fee("3000");
                    setV4TickSpacing("60");
                    setV4Hooks(ZERO_ADDRESS);
                    setV4Status("Pegá el contrato del token contra USDG.");
                  }}
                  disabled={v4Scanning || v4MultiScanning}
                >
                  Token/USDG
                </button>
              </div>
              <div className={styles.v3ManualGrid}>
                <div className={styles.field}>
                  <label>Token A</label>
                  <input
                    value={v4CurrencyA}
                    onChange={(event) => setV4CurrencyA(event.target.value)}
                    placeholder="0x... o ETH"
                  />
                </div>
                <div className={styles.field}>
                  <label>Token B</label>
                  <input
                    value={v4CurrencyB}
                    onChange={(event) => setV4CurrencyB(event.target.value)}
                    placeholder="0x..."
                  />
                </div>
              </div>
              <div className={styles.v4QuickGuide}>
                <strong>Uso normal</strong>
                <span>
                  Escanear multi-pool prueba las combinaciones conocidas. Cargar
                  copia automaticamente el fee, spacing y hooks correctos.
                </span>
              </div>
              <details className={styles.v4Advanced}>
                <summary>PoolKey avanzado</summary>
                <p>
                  Solo hace falta tocar esto si queres buscar una pool exacta
                  que no esta en la lista. En V4 estos valores identifican otra
                  pool distinta.
                </p>
                <div className={styles.v3ManualGrid}>
                  <div className={styles.field}>
                    <label>Fee tier</label>
                    <select
                      value={v4Fee}
                      onChange={(event) => {
                        const selectedFee = event.target.value;
                        setV4Fee(selectedFee);
                        setV4TickSpacing(
                          selectedFee === "100"
                            ? "1"
                            : selectedFee === "500"
                            ? "10"
                            : selectedFee === "3000"
                              ? "60"
                              : "200"
                        );
                      }}
                    >
                      <option value="100">0.01% LP / spacing 1</option>
                      <option value="500">0.05% LP / spacing 10</option>
                      <option value="3000">0.3% LP / spacing 60</option>
                      <option value="10000">1% LP / spacing 200</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Tick spacing</label>
                    <input
                      value={v4TickSpacing}
                      onChange={(event) =>
                        setV4TickSpacing(event.target.value)
                      }
                      placeholder="10 / 60 / 200"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Hooks</label>
                  <input
                    value={v4Hooks}
                    onChange={(event) => setV4Hooks(event.target.value)}
                    placeholder="0x000... si no tiene hooks"
                  />
                </div>
              </details>
              <div className={styles.strategyGrid}>
                <div className={styles.strategyCard}>
                  <div>
                    <span>Stable Core V4</span>
                    <strong>USDe/USDG · 0.01%</strong>
                    <small>
                      Rango sugerido 0.98-1.02. Entrada desde USDG, sin hooks.
                    </small>
                  </div>
                  <button
                    className={styles.softButton}
                    onClick={() => {
                      resetV4LoadedPosition();
                      setV4CurrencyA(V3_TOKENS.robinhood.USDe.address);
                      setV4CurrencyB(V3_TOKENS.robinhood.USDG.address);
                      setV4Fee("100");
                      setV4TickSpacing("1");
                      setV4Hooks(ZERO_ADDRESS);
                      setV4MintProfile("conservative");
                      setV4Status(
                        "Stable Core cargada: USDe/USDG 0.01%, spacing 1. Escaneá antes de crear."
                      );
                    }}
                    disabled={v4Scanning || v4MultiScanning}
                  >
                    Cargar
                  </button>
                </div>
              </div>
              <div className={styles.ctas}>
                <button
                  className={styles.primary}
                  onClick={handleV4ScanPool}
                  disabled={v4Scanning || v4MultiScanning}
                >
                  {v4Scanning ? "Escaneando..." : "Escanear pool cargada"}
                </button>
                <button
                  className={styles.outline}
                  onClick={handleV4ScanMultiplePools}
                  disabled={v4Scanning || v4MultiScanning}
                >
                  {v4MultiScanning ? "Barriendo..." : "Buscar pools conocidas"}
                </button>
              </div>
              <p className={styles.v3ManualHint}>
                Tip: primero usa Buscar pools conocidas. Cuando una fila diga
                Usable, toca Cargar y la app completa la PoolKey exacta.
              </p>
              <div className={styles.v4PoolList}>
                {(v4MultiResults.length > 0
                  ? v4MultiResults
                  : V4_ROBINHOOD_POOL_CANDIDATES.map((candidate) => ({
                      candidate,
                      result: null,
                      error: null,
                      checkedAt: ""
                    }))
                ).map((item) => (
                  <div key={item.candidate.id} className={styles.v4PoolRow}>
                    <div>
                      <span>
                        {item.candidate.label} · {item.candidate.fee / 10000}%
                        {" · read-only"}
                      </span>
                      <strong>
                        {item.result
                          ? `${item.result.status} · ${item.result.usability} · ${item.result.lpFee} LP`
                          : item.error
                            ? "Error"
                            : "Preset"}
                      </strong>
                      <small>
                        {item.result
                          ? `${formatV4Price(
                              item.result.price,
                              item.result.token0Symbol,
                              item.result.token1Symbol
                            )} · L ${Number(
                              item.result.liquidity
                            ).toLocaleString("en-US", {
                              maximumFractionDigits: 0
                            })} · ${item.checkedAt}`
                          : item.error
                            ? item.error
                            : item.candidate.note}
                      </small>
                      {item.result ? (
                        <small>{item.result.usabilityDetail}</small>
                      ) : null}
                    </div>
                    <button
                      className={styles.softButton}
                      onClick={() =>
                        handleV4LoadCandidate(item.candidate, item.result)
                      }
                      disabled={v4Scanning || v4MultiScanning}
                    >
                      Cargar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.walletCard}>
              <h3>Resultado V4</h3>
              {isLocked ? (
                <p className={styles.v3ManualHint}>
                  La lectura del scanner está abierta. Operar NFT V4 requiere
                  premium.
                </p>
              ) : null}
              <div className={styles.field}>
                <label>Leer NFT V4</label>
                <input
                  value={v4TokenId}
                  onChange={(event) => setV4TokenId(event.target.value)}
                  placeholder="TokenId V4"
                  inputMode="numeric"
                />
                <button
                  className={styles.primary}
                  onClick={handleV4ReadPosition}
                  disabled={isLocked || v4ReadingPosition}
                >
                  {v4ReadingPosition ? "Leyendo..." : "Leer NFT V4"}
                </button>
              </div>
              <div className={styles.v3MetricGrid}>
                <div>
                  <span>Estado</span>
                  <strong>{v4Result ? v4Result.status : "Pendiente"}</strong>
                </div>
                <div>
                  <span>Uso</span>
                  <strong>{v4Result ? v4Result.usability : "Pendiente"}</strong>
                </div>
                <div>
                  <span>Par</span>
                  <strong>
                    {v4Result
                      ? `${v4Result.token0Symbol}/${v4Result.token1Symbol}`
                      : "Sin escanear"}
                  </strong>
                </div>
                <div>
                  <span>Precio</span>
                  <strong>
                    {v4Result
                      ? formatV4Price(
                          v4Result.price,
                          v4Result.token0Symbol,
                          v4Result.token1Symbol
                        )
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Tick</span>
                  <strong>{v4Result ? v4Result.tick : "—"}</strong>
                </div>
                <div>
                  <span>LP fee</span>
                  <strong>{v4Result ? v4Result.lpFee : "—"}</strong>
                </div>
                <div>
                  <span>Pool fee</span>
                  <strong>
                    {v4Result
                      ? `${v4Result.fee / 10000}% / spacing ${v4Result.tickSpacing}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>NFT V4</span>
                  <strong>{v4Position ? `#${v4Position.tokenId}` : "—"}</strong>
                </div>
                <div>
                  <span>Rango NFT</span>
                  <strong>
                    {v4Position
                      ? `${v4Position.rangePriceLower.toLocaleString("en-US", {
                          maximumFractionDigits: 2
                        })} / ${v4Position.rangePriceUpper.toLocaleString(
                          "en-US",
                          { maximumFractionDigits: 2 }
                        )}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Estado rango</span>
                  <strong>
                    {v4Position
                      ? v4Position.inRange
                        ? "Dentro"
                        : "Fuera"
                      : "—"}
                  </strong>
                </div>
              </div>
              {v4Result ? (
                <div className={styles.v4UseBox}>
                  <strong>{v4Result.usabilityDetail}</strong>
                  <span>{v4Result.nextAction}</span>
                </div>
              ) : null}
              {v4Result ? (
                <div className={styles.v4MintPanel}>
                  <div>
                    <h4>Crear NFT V4</h4>
                    <p>
                      Prepara el split, valida balances y permisos, estima gas
                      y habilita la firma real de MINT_POSITION.
                    </p>
                  </div>
                  <div className={styles.v3ManualGrid}>
                    <div className={styles.field}>
                      <label>Perfil de rango</label>
                      <select
                        value={v4MintProfile}
                        onChange={(event) =>
                          setV4MintProfile(
                            event.target.value as keyof typeof V3_PROFILES
                          )
                        }
                        disabled={!v4CanSimulateMint}
                      >
                        {Object.entries(V3_PROFILES).map(([key, profile]) => (
                          <option key={key} value={key}>
                            {profile.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>Estado de pool</label>
                      <div className={styles.address}>
                        {v4CanSimulateMint
                          ? "Lista para simular mint"
                          : `${v4Result.usability}: ${v4Result.usabilityDetail}`}
                      </div>
                    </div>
                  </div>
                  {v4MintRange ? (
                    <div className={styles.v4RangeGrid}>
                      <div>
                        <span>Rango precio</span>
                        <strong>
                          {v4MintRange.lowerPrice.toLocaleString("en-US", {
                            maximumFractionDigits: 2
                          })}{" "}
                          /{" "}
                          {v4MintRange.upperPrice.toLocaleString("en-US", {
                            maximumFractionDigits: 2
                          })}
                        </strong>
                      </div>
                      <div>
                        <span>Ticks</span>
                        <strong>
                          {v4MintRange.lowerTick} / {v4MintRange.upperTick}
                        </strong>
                      </div>
                      <div>
                        <span>PoolKey</span>
                        <strong>
                          {v4Result.fee / 10000}% · spacing{" "}
                          {v4Result.tickSpacing}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                  {v4Result.token1Symbol.toUpperCase() === "USDG" ? (
                    <div className={styles.v4UseBox}>
                      <strong>Paso 1 · Split desde USDG</strong>
                      <span>
                        Ingresá un monto único en USDG. Zumpay calcula cuánto
                        conviene convertir al otro token y cuánto dejar como
                        USDG para este rango. Si falta el otro token, primero
                        hay que hacer ese swap.
                      </span>
                      <div className={styles.v4AssistGrid}>
                        <div className={styles.field}>
                          <label>Total USDG</label>
                          <input
                            value={v4MintUsdAmount}
                            onChange={(event) =>
                              setV4MintUsdAmount(event.target.value)
                            }
                            placeholder="Ej: 10"
                            inputMode="decimal"
                            disabled={!v4CanSimulateMint}
                          />
                        </div>
                        <div className={styles.field}>
                          <label>Slippage</label>
                          <input
                            value={v4MintSlippage}
                            onChange={(event) =>
                              setV4MintSlippage(event.target.value)
                            }
                            placeholder="1"
                            inputMode="decimal"
                            disabled={!v4CanSimulateMint}
                          />
                        </div>
                        <button
                          className={styles.outline}
                          onClick={handleApplyV4UsdAssist}
                          disabled={!v4CanSimulateMint || !v4UsdAssistPlan}
                        >
                          Cargar split
                        </button>
                      </div>
                      {v4UsdAssistPlan ? (
                        <small>
                          Cambiar aprox{" "}
                          {formatHumanTokenAmount(
                            v4UsdAssistPlan.sourceToSwap,
                            v4UsdAssistPlan.sourceSymbol
                          )}{" "}
                          {v4UsdAssistPlan.sourceSymbol} a{" "}
                          {formatHumanTokenAmount(
                            v4UsdAssistPlan.targetAmount,
                            v4UsdAssistPlan.targetSymbol
                          )}{" "}
                          {v4UsdAssistPlan.targetSymbol}; mantener{" "}
                          {formatHumanTokenAmount(
                            v4UsdAssistPlan.sourceToKeep,
                            v4UsdAssistPlan.sourceSymbol
                          )}{" "}
                          {v4UsdAssistPlan.sourceSymbol}.
                        </small>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.v3ManualGrid}>
                    <div className={styles.field}>
                      <label>Monto {v4Result.token0Symbol}</label>
                      <input
                        value={v4MintAmount0}
                        onChange={(event) =>
                          handleV4MintAmount0Change(event.target.value)
                        }
                        placeholder={`Capital en ${v4Result.token0Symbol}`}
                        inputMode="decimal"
                        disabled={!v4CanSimulateMint}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Monto {v4Result.token1Symbol}</label>
                      <input
                        value={v4MintAmount1}
                        onChange={(event) =>
                          handleV4MintAmount1Change(event.target.value)
                        }
                        placeholder={`Capital en ${v4Result.token1Symbol}`}
                        inputMode="decimal"
                        disabled={!v4CanSimulateMint}
                      />
                    </div>
                  </div>
                  {v4MintSimulation ? (
                    <div className={styles.v4BalanceGrid}>
                      <div>
                        <span>Liquidez estimada</span>
                        <strong>
                          {v4MintSimulation.liquidityToAdd.toLocaleString(
                            "en-US",
                            { maximumFractionDigits: 0 }
                          )}
                        </strong>
                        <small>
                          Limita {v4MintSimulation.limitingToken}. No crea NFT
                          ni firma.
                        </small>
                      </div>
                      <div>
                        <span>Uso de capital</span>
                        <strong>
                          {formatHumanTokenAmount(
                            v4MintSimulation.usedToken0,
                            v4Result.token0Symbol
                          )}{" "}
                          {v4Result.token0Symbol} +{" "}
                          {formatHumanTokenAmount(
                            v4MintSimulation.usedToken1,
                            v4Result.token1Symbol
                          )}{" "}
                          {v4Result.token1Symbol}
                        </strong>
                        <small>
                          Sobrante estimado:{" "}
                          {formatHumanTokenAmount(
                            v4MintSimulation.leftoverToken0,
                            v4Result.token0Symbol
                          )}{" "}
                          {v4Result.token0Symbol} /{" "}
                          {formatHumanTokenAmount(
                            v4MintSimulation.leftoverToken1,
                            v4Result.token1Symbol
                          )}{" "}
                          {v4Result.token1Symbol}.
                        </small>
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.v4UseBox}>
                    <strong>Paso 2 · Crear posición</strong>
                    <span>
                      Probá balances y Permit2, estimá gas y recién después
                      abrí MetaMask para crear el NFT V4 nuevo.
                    </span>
                  </div>
                  <div className={styles.ctas}>
                    <button
                      className={styles.outline}
                      onClick={handleV4MintPreflight}
                      disabled={
                        !v4CanSimulateMint ||
                        v4MintPreflighting ||
                        v4Minting
                      }
                    >
                      {v4MintPreflighting
                        ? "Probando..."
                        : "Probar balances y Permit2"}
                    </button>
                    <button
                      className={styles.primary}
                      onClick={handleV4MintEstimateGas}
                      disabled={
                        !v4CanSimulateMint ||
                        v4MintEstimatingGas ||
                        v4Minting
                      }
                    >
                      {v4MintEstimatingGas
                        ? "Estimando..."
                        : "Estimar gas MINT_POSITION"}
                    </button>
                    <button
                      className={styles.primary}
                      onClick={handleV4MintPosition}
                      disabled={
                        !v4CanSimulateMint ||
                        v4Minting ||
                        v4MintGasEstimate?.status !== "ok"
                      }
                    >
                      {v4Minting ? "Creando..." : "Crear NFT V4"}
                    </button>
                    <button
                      className={styles.primary}
                      onClick={handleV4CreateFromUsd}
                      disabled={
                        !v4CanSimulateMint ||
                        v4Minting ||
                        !v4UsdAssistPlan
                      }
                    >
                      {v4Minting ? "Operando..." : "Swap + Crear desde USDG"}
                    </button>
                  </div>
                  {v4MintPreflightChecks.length > 0 ? (
                    <div className={styles.v4PreflightGrid}>
                      {v4MintPreflightChecks.map((check) => (
                        <div
                          key={check.label}
                          className={
                            check.ok
                              ? styles.v4PreflightOk
                              : styles.v4PreflightWarn
                          }
                        >
                          <span>{check.label}</span>
                          <strong>{check.ok ? "OK" : "Revisar"}</strong>
                          <small>{check.value}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {v4MintGasEstimate ? (
                    <div
                      className={`${styles.v4GasBox} ${
                        v4MintGasEstimate.status === "ok"
                          ? styles.v4GasOk
                          : v4MintGasEstimate.status === "warn"
                            ? styles.v4GasWarn
                            : styles.v4GasError
                      }`}
                    >
                      <strong>{v4MintGasEstimate.title}</strong>
                      <span>{v4MintGasEstimate.detail}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {v4Result ? (
                <div className={styles.field}>
                  <label>PoolId</label>
                  <div className={styles.address}>{v4Result.poolId}</div>
                </div>
              ) : null}
              {v4Position ? (
                <div className={styles.field}>
                  <label>Dueño NFT</label>
                  <div className={styles.address}>{v4Position.owner}</div>
                </div>
              ) : null}
              {v4Position ? (
                <>
                  <div className={styles.v4UseBox}>
                    <strong>Gestionar NFT V4 existente</strong>
                    <span>
                      Cobrar fees usa DECREASE_LIQUIDITY con liquidez cero.
                      Retirar liquidez usa la liquidez actual del NFT. Ambas
                      acciones abren MetaMask.
                    </span>
                  </div>
                  <div className={styles.ctas}>
                    <button
                      className={styles.outline}
                      onClick={() => executeV4Decrease("collect")}
                      disabled={
                        isLocked ||
                        v4CollectingFees ||
                        v4WithdrawingLiquidity
                      }
                    >
                      {v4CollectingFees ? "Cobrando..." : "Cobrar fees V4"}
                    </button>
                    <button
                      className={styles.primary}
                      onClick={() => executeV4Decrease("withdraw")}
                      disabled={
                        isLocked ||
                        v4CollectingFees ||
                        v4WithdrawingLiquidity ||
                        v4Position.liquidity === "0"
                      }
                    >
                      {v4WithdrawingLiquidity
                        ? "Retirando..."
                        : "Retirar liquidez V4"}
                    </button>
                  </div>
                  <div className={styles.v3ManualGrid}>
                    <div className={styles.field}>
                      <label>Monto {v4Position.token0Symbol}</label>
                      <input
                        value={v4AddAmount0}
                        onChange={(event) =>
                          handleV4AddAmount0Change(event.target.value)
                        }
                        placeholder={`Monto en ${v4Position.token0Symbol}`}
                        inputMode="decimal"
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Monto {v4Position.token1Symbol}</label>
                      <input
                        value={v4AddAmount1}
                        onChange={(event) =>
                          handleV4AddAmount1Change(event.target.value)
                        }
                        placeholder={`Monto en ${v4Position.token1Symbol}`}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  <button
                    className={styles.primary}
                    onClick={handleV4TwoTokenPreflight}
                    disabled={isLocked || v4Preflighting}
                  >
                    {v4Preflighting
                      ? "Probando balances..."
                      : "Probar balances y permisos"}
                  </button>
                  {v4LiquiditySimulation ? (
                    <div className={styles.v4BalanceGrid}>
                      <div>
                        <span>Desde {v4Position.token0Symbol}</span>
                        <strong>
                          {formatHumanTokenAmount(
                            parseHumanAmount(v4AddAmount0) || 0,
                            v4Position.token0Symbol
                          )}{" "}
                          {v4Position.token0Symbol} +{" "}
                          {formatHumanTokenAmount(
                            v4LiquiditySimulation.suggestedToken1,
                            v4Position.token1Symbol
                          )}{" "}
                          {v4Position.token1Symbol}
                        </strong>
                        <small>
                          Colocá también{" "}
                          {formatHumanTokenAmount(
                            v4LiquiditySimulation.suggestedToken1,
                            v4Position.token1Symbol
                          )}{" "}
                          {v4Position.token1Symbol}.
                        </small>
                      </div>
                      <div>
                        <span>Desde {v4Position.token1Symbol}</span>
                        <strong>
                          {formatHumanTokenAmount(
                            v4LiquiditySimulation.suggestedToken0,
                            v4Position.token0Symbol
                          )}{" "}
                          {v4Position.token0Symbol} +{" "}
                          {formatHumanTokenAmount(
                            parseHumanAmount(v4AddAmount1) || 0,
                            v4Position.token1Symbol
                          )}{" "}
                          {v4Position.token1Symbol}
                        </strong>
                        <small>
                          Colocá también{" "}
                          {formatHumanTokenAmount(
                            v4LiquiditySimulation.suggestedToken0,
                            v4Position.token0Symbol
                          )}{" "}
                          {v4Position.token0Symbol}.
                        </small>
                      </div>
                    </div>
                  ) : null}
                  {v4ValueEstimate ? (
                    <div className={styles.v4ValueGrid}>
                      <div>
                        <span>Valor NFT ahora</span>
                        <strong>
                          {formatV4Value(
                            v4ValueEstimate.currentValue,
                            v4ValueEstimate.currency
                          )}
                        </strong>
                        <small>Estimado por liquidez actual.</small>
                      </div>
                      <div>
                        <span>Valor a sumar</span>
                        <strong>
                          {formatV4Value(
                            v4ValueEstimate.addValue,
                            v4ValueEstimate.currency
                          )}
                        </strong>
                        <small>Según montos cargados.</small>
                      </div>
                      <div>
                        <span>Total aproximado</span>
                        <strong>
                          {formatV4Value(
                            v4ValueEstimate.totalValue,
                            v4ValueEstimate.currency
                          )}
                        </strong>
                        <small>Después de agregar.</small>
                      </div>
                    </div>
                  ) : null}
                  {v4PreflightChecks.length > 0 ? (
                    <div className={styles.v4PreflightGrid}>
                      {v4PreflightChecks.map((check) => (
                        <div
                          key={check.label}
                          className={
                            check.ok
                              ? styles.v4PreflightOk
                              : styles.v4PreflightWarn
                          }
                        >
                          <span>{check.ok ? "OK" : "Revisar"}</span>
                          <strong>{check.label}</strong>
                          <small>{check.value}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className={styles.outline}
                    onClick={handleV4EstimateGas}
                    disabled={isLocked || v4EstimatingGas}
                  >
                    {v4EstimatingGas ? "Estimando gas..." : "Estimar gas V4"}
                  </button>
                  {v4GasEstimate ? (
                    <div
                      className={`${styles.v4GasBox} ${
                        v4GasEstimate.status === "ok"
                          ? styles.v4GasOk
                          : v4GasEstimate.status === "warn"
                            ? styles.v4GasWarn
                            : styles.v4GasError
                      }`}
                    >
                      <strong>{v4GasEstimate.title}</strong>
                      <span>{v4GasEstimate.detail}</span>
                    </div>
                  ) : null}
                  <button
                    className={styles.primary}
                    onClick={handleV4AddLiquidity}
                    disabled={
                      isLocked ||
                      v4AddingLiquidity ||
                      v4GasEstimate?.status !== "ok"
                    }
                  >
                    {v4AddingLiquidity
                      ? "Agregando liquidez..."
                      : `Agregar liquidez real al NFT #${v4Position.tokenId}`}
                  </button>
                  {v4LastTxHash ? (
                    <a
                      className={styles.v4TxLink}
                      href={`${EXPLORERS.robinhood}${v4LastTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver última transacción V4{" "}
                      {v4LastTxHash.slice(0, 10)}...
                    </a>
                  ) : null}
                  {v4LiquidityChange ? (
                    <div className={styles.v4LiquidityChange}>
                      <div>
                        <span>Valor antes</span>
                        <strong>
                          {formatV4Value(
                            v4LiquidityChange.beforeValue,
                            v4LiquidityChange.currency
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Valor después</span>
                        <strong>
                          {formatV4Value(
                            v4LiquidityChange.afterValue,
                            v4LiquidityChange.currency
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Valor agregado</span>
                        <strong>
                          {v4LiquidityChange.deltaValue > 0
                            ? `+${formatV4Value(
                                v4LiquidityChange.deltaValue,
                                v4LiquidityChange.currency
                              )}`
                            : "Sin cambio"}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              {v4Status ? <p className={styles.status}>{v4Status}</p> : null}
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
            <span>Robinhood</span>
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

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

const STORAGE_KEY = "zumpay_wallet_v1";
const TOKEN_KEY = "zumpay_tokens_v1";
const TX_KEY = "zumpay_txs_v1";

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
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const DEFAULT_TOKENS: Record<string, TokenMeta[]> = {
  polygon: [
    {
      address: ZUM_ADDRESS,
      symbol: "ZUM",
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
  const [payerAddress, setPayerAddress] = useState<string | null>(null);

  const network = useMemo(
    () => NETWORKS.find((item) => item.key === networkKey) ?? NETWORKS[0],
    [networkKey]
  );

  const provider = useMemo(
    () => new ethers.JsonRpcProvider(network.rpcUrl, network.chainId),
    [network]
  );

  const explorerBase = EXPLORERS[networkKey] ?? EXPLORERS.polygon;
  const isLocked = !premiumPaid;

  const evmAssets = useMemo(() => {
    const list = [
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

  const checkPremium = async () => {
    const target = payerAddress ?? address;
    if (!target) return;
    try {
      setCheckingPremium(true);
      const res = await fetch(`/api/zum/paid?address=${target}`);
      const data = await res.json();
      if (data?.paid) {
        setPremiumPaid(true);
        setPremiumStatus("Premium activo.");
      } else {
        setPremiumPaid(false);
        setPremiumStatus("Bloqueado: requiere pago de 10 ZUM.");
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
      let selected: typeof utxos = [];
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
            value: utxo.value
          }
        });
      }
      psbt.addOutput({ address: btcSendTo, value: targetSats });
      if (outputs === 2) {
        psbt.addOutput({ address: btcAddress, value: change });
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
        const gasLimit = 21000n;
        const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
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
      const ethereum = (window as unknown as { ethereum?: any }).ethereum;
      if (!ethereum) {
        setPremiumStatus("MetaMask no está instalado.");
        return;
      }
      const accounts: string[] = await ethereum.request({
        method: "eth_requestAccounts"
      });
      if (accounts?.length) {
        setPayerAddress(accounts[0]);
        setPremiumStatus("Wallet conectada. Verificá el pago.");
      }
    } catch (error) {
      console.error(error);
      setPremiumStatus("No se pudo conectar MetaMask.");
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
              <p>Wallet bloqueada. Pagá 10 ZUM para desbloquear.</p>
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
              Para usar la wallet necesitás pagar una única vez <strong>10 ZUM</strong>.
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
                <button className={styles.outline} onClick={checkPremium}>
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
                  <p>Enviá 10 ZUM a la dirección del owner.</p>
                </div>
                <div>
                  <span>3</span>
                  <p>Volvé y tocá “Verificar pago”.</p>
                </div>
              </div>
              <div className={styles.ctas}>
                <button
                  className={styles.primary}
                  onClick={() =>
                    copyToClipboard(ZUM_OWNER, "Dirección del owner copiada.")
                  }
                >
                  Copiar dirección de pago
                </button>
                <button
                  className={styles.outline}
                  onClick={() =>
                    copyToClipboard(ZUM_ADDRESS, "Contrato ZUM copiado.")
                  }
                >
                  Copiar contrato ZUM
                </button>
              </div>
              <p className={styles.muted}>
                Red: Polygon. Wallet destino: {ZUM_OWNER.slice(0, 6)}...
                {ZUM_OWNER.slice(-4)}.
              </p>
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
              <p>Wallet bloqueada. Pagá 10 ZUM para desbloquear.</p>
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
                      disabled={isLocked || (revealedMnemonic && !seedConfirmed)}
                    >
                      Enviar {selectedAsset.symbol}
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
                      disabled={isLocked || (revealedMnemonic && !seedConfirmed)}
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

























import {
  type PlatformSkill,
  type LaunchParams,
  type LaunchResult,
  type TokenInfo,
  type ListTokensParams,
  type WalletConfig,
  type TradeParams,
  type TradeResult,
  type PriceQuoteParams,
  type PriceQuote,
  type TradeHistoryItem,
  type TrendingParams,
} from "../../shared/types.js";

const PUMPPORTAL_API = "https://pumpportal.fun/api";
const PUMPFUN_API = "https://frontend-api-v3.pump.fun";

export class PumpFunSkill implements PlatformSkill {
  platform = "pumpfun" as const;
  chain = "solana" as const;

  private wallet: WalletConfig["solana"];

  constructor(wallet: WalletConfig["solana"]) {
    this.wallet = wallet;
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    // Step 1: Upload metadata (image + token info) via PumpPortal
    const formData = new FormData();
    formData.append("name", params.name);
    formData.append("symbol", params.symbol);
    if (params.description) formData.append("description", params.description);
    if (params.imageUrl) {
      const imageResp = await fetch(params.imageUrl);
      const imageBlob = await imageResp.blob();
      formData.append("file", imageBlob, "token-image.png");
    }
    formData.append("showName", "true");
    if (params.links?.twitter) formData.append("twitter", params.links.twitter);
    if (params.links?.telegram) formData.append("telegram", params.links.telegram);
    if (params.links?.website) formData.append("website", params.links.website);

    const metadataResp = await fetch(`${PUMPPORTAL_API}/ipfs`, {
      method: "POST",
      body: formData,
    });
    if (!metadataResp.ok) {
      throw new Error(`PumpFun IPFS upload failed: ${await metadataResp.text()}`);
    }
    const metadata = (await metadataResp.json()) as {
      metadataUri: string;
    };

    // Step 2: Create token via PumpPortal Trading API
    const { Keypair } = await import("@solana/web3.js");
    const bs58 = await import("bs58");

    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const mintKeypair = Keypair.generate();

    const createResp = await fetch(`${PUMPPORTAL_API}/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: signerKeypair.publicKey.toBase58(),
        action: "create",
        tokenMetadata: {
          name: params.name,
          symbol: params.symbol,
          uri: metadata.metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: params.initialBuyAmount || "0",
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });

    if (!createResp.ok) {
      throw new Error(`PumpFun launch failed: ${await createResp.text()}`);
    }

    // Step 3: Sign and send the transaction
    const txBytes = new Uint8Array(await createResp.arrayBuffer());
    const { Connection, Transaction } = await import("@solana/web3.js");
    const connection = new Connection(
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com"
    );
    const tx = Transaction.from(txBytes);
    tx.sign(signerKeypair, mintKeypair);
    const txHash = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txHash);

    return {
      platform: "pumpfun",
      chain: "solana",
      tokenAddress: mintKeypair.publicKey.toBase58(),
      txHash,
      tokenName: params.name,
      tokenSymbol: params.symbol,
      creatorAddress: signerKeypair.publicKey.toBase58(),
      timestamp: Date.now(),
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const resp = await fetch(`${PUMPFUN_API}/coins/${tokenAddress}`);
    if (!resp.ok) throw new Error(`Token not found: ${tokenAddress}`);
    const data = (await resp.json()) as Record<string, any>;

    return {
      platform: "pumpfun",
      chain: "solana",
      tokenAddress,
      name: data.name,
      symbol: data.symbol,
      description: data.description,
      imageUrl: data.image_uri,
      creatorAddress: data.creator,
      marketCap: data.usd_market_cap,
      price: data.virtual_sol_reserves
        ? data.virtual_sol_reserves / data.virtual_token_reserves
        : undefined,
      priceUsd: data.usd_market_cap
        ? data.usd_market_cap / (data.total_supply || 1)
        : undefined,
      totalSupply: data.total_supply?.toString(),
      bondingCurveProgress: data.bonding_curve_progress,
      isGraduated: data.complete === true,
      createdAt: data.created_timestamp
        ? new Date(data.created_timestamp).getTime()
        : undefined,
    };
  }

  async listTokens(params?: ListTokensParams): Promise<TokenInfo[]> {
    const limit = params?.limit || 20;
    const offset = params?.offset || 0;
    const sortBy = params?.sortBy === "marketCap" ? "market_cap" : "created_timestamp";
    const sortOrder = params?.sortOrder || "desc";

    const resp = await fetch(
      `${PUMPFUN_API}/coins?limit=${limit}&offset=${offset}&sort=${sortBy}&order=${sortOrder}&includeNsfw=false`
    );
    if (!resp.ok) throw new Error(`Failed to list tokens: ${resp.statusText}`);
    const data = (await resp.json()) as any[];

    return data.map((d: any) => ({
      platform: "pumpfun" as const,
      chain: "solana" as const,
      tokenAddress: d.mint,
      name: d.name,
      symbol: d.symbol,
      description: d.description,
      imageUrl: d.image_uri,
      creatorAddress: d.creator,
      marketCap: d.usd_market_cap,
      bondingCurveProgress: d.bonding_curve_progress,
      isGraduated: d.complete === true,
      createdAt: d.created_timestamp
        ? new Date(d.created_timestamp).getTime()
        : undefined,
    }));
  }

  async buy(params: TradeParams): Promise<TradeResult> {
    const { Keypair, Connection, Transaction } = await import("@solana/web3.js");
    const bs58 = await import("bs58");
    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const connection = new Connection(
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com"
    );

    const createResp = await fetch(`${PUMPPORTAL_API}/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: signerKeypair.publicKey.toBase58(),
        action: "buy",
        mint: params.tokenAddress,
        denominatedInSol: "true",
        amount: params.amount,
        slippage: params.slippage || 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });

    if (!createResp.ok) {
      throw new Error(`PumpFun buy failed: ${await createResp.text()}`);
    }

    const txBytes = new Uint8Array(await createResp.arrayBuffer());
    const tx = Transaction.from(txBytes);
    tx.sign(signerKeypair);
    const txHash = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txHash);

    return {
      platform: "pumpfun",
      chain: "solana",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "buy",
      nativeAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async sell(params: TradeParams): Promise<TradeResult> {
    const { Keypair, Connection, Transaction } = await import("@solana/web3.js");
    const bs58 = await import("bs58");
    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const connection = new Connection(
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com"
    );

    const createResp = await fetch(`${PUMPPORTAL_API}/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: signerKeypair.publicKey.toBase58(),
        action: "sell",
        mint: params.tokenAddress,
        denominatedInSol: "false",
        amount: params.amount,
        slippage: params.slippage || 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });

    if (!createResp.ok) {
      throw new Error(`PumpFun sell failed: ${await createResp.text()}`);
    }

    const txBytes = new Uint8Array(await createResp.arrayBuffer());
    const tx = Transaction.from(txBytes);
    tx.sign(signerKeypair);
    const txHash = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txHash);

    return {
      platform: "pumpfun",
      chain: "solana",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "sell",
      tokenAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async getTrending(params?: TrendingParams): Promise<TokenInfo[]> {
    const category = params?.category || "gainers";
    const limit = params?.limit || 20;

    // "new" category: reuse listTokens sorted by createdAt
    if (category === "new") {
      return this.listTokens({ limit, sortBy: "createdAt", sortOrder: "desc" });
    }

    let url: string;
    if (category === "graduated") {
      url = `${PUMPFUN_API}/coins?sort=market_cap&order=desc&complete=true&limit=${limit}`;
    } else if (category === "volume") {
      url = `${PUMPFUN_API}/coins?sort=market_cap&order=desc&limit=${limit}&includeNsfw=false`;
    } else {
      // "gainers": try king-of-the-hill first, fallback to market_cap sort
      url = `${PUMPFUN_API}/coins/king-of-the-hill?includeNsfw=false`;
    }

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to get trending: ${resp.statusText}`);
    const text = await resp.text();
    let data: any[];
    try {
      data = text ? JSON.parse(text) : [];
    } catch {
      data = [];
    }

    // Fallback if king-of-the-hill returns empty
    if (data.length === 0 && category !== "graduated" && category !== "volume") {
      const fallbackResp = await fetch(
        `${PUMPFUN_API}/coins?sort=market_cap&order=desc&limit=${limit}&includeNsfw=false`
      );
      if (fallbackResp.ok) {
        data = (await fallbackResp.json()) as any[];
      }
    }

    return data.slice(0, limit).map((d: any) => ({
      platform: "pumpfun" as const,
      chain: "solana" as const,
      tokenAddress: d.mint,
      name: d.name,
      symbol: d.symbol,
      description: d.description,
      imageUrl: d.image_uri,
      creatorAddress: d.creator,
      marketCap: d.usd_market_cap,
      bondingCurveProgress: d.bonding_curve_progress,
      isGraduated: d.complete === true,
      createdAt: d.created_timestamp
        ? new Date(d.created_timestamp).getTime()
        : undefined,
    }));
  }

  async getTradeHistory(
    tokenAddress: string,
    params?: { limit?: number }
  ): Promise<TradeHistoryItem[]> {
    const limit = params?.limit || 20;

    // Try multiple endpoints as PumpFun API changes frequently
    const urls = [
      `${PUMPFUN_API}/trades/latest?mint=${tokenAddress}&limit=${limit}&offset=0`,
      `${PUMPFUN_API}/trades/${tokenAddress}?limit=${limit}&offset=0`,
    ];

    for (const url of urls) {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text) continue;

      try {
        const data = JSON.parse(text) as any[];
        if (!Array.isArray(data)) continue;

        return data.map((d: any) => ({
          txHash: d.signature || d.tx_hash || "",
          action: d.is_buy ? ("buy" as const) : ("sell" as const),
          tokenAmount: d.token_amount?.toString(),
          nativeAmount: d.sol_amount?.toString(),
          timestamp: d.timestamp ? new Date(d.timestamp).getTime() : Date.now(),
          walletAddress: d.user,
        }));
      } catch {
        continue;
      }
    }

    // Fallback: return empty if all endpoints fail
    return [];
  }
}

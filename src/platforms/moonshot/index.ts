import {
  type PlatformSkill,
  type LaunchParams,
  type LaunchResult,
  type TokenInfo,
  type ListTokensParams,
  type WalletConfig,
  type TradeParams,
  type TradeResult,
  type TradeHistoryItem,
  type TrendingParams,
} from "../../shared/types.js";

const DEXSCREENER_API = "https://api.dexscreener.com/latest";

export class MoonshotSkill implements PlatformSkill {
  platform = "moonshot" as const;
  chain = "solana" as const;

  private wallet: WalletConfig["solana"];

  constructor(wallet: WalletConfig["solana"]) {
    this.wallet = wallet;
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const { Moonit, Environment, CurveType, MigrationDex } = await import(
      "@moonit/sdk"
    );
    const { Keypair, VersionedTransaction } = await import(
      "@solana/web3.js"
    );
    const bs58 = await import("bs58");

    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );

    const rpcUrl =
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com";

    const moonit = new Moonit({
      rpcUrl,
      environment: Environment.MAINNET,
      chainOptions: {
        solana: { confirmOptions: { commitment: "confirmed" } },
      },
    });

    // Icon must be base64 encoded
    let iconBase64 = "";
    if (params.imageUrl) {
      const resp = await fetch(params.imageUrl);
      const buf = Buffer.from(await resp.arrayBuffer());
      iconBase64 = buf.toString("base64");
    }

    // Banner (optional, base64 encoded, max 5MB)
    let bannerBase64: string | undefined;
    if (params.bannerUrl) {
      const resp = await fetch(params.bannerUrl);
      const buf = Buffer.from(await resp.arrayBuffer());
      bannerBase64 = buf.toString("base64");
    }

    // Step 1: prepareMintTx — returns tokenId, transaction (serialized), token
    const prepared = await moonit.prepareMintTx({
      creator: signerKeypair.publicKey.toBase58(),
      name: params.name,
      symbol: params.symbol,
      curveType: CurveType.CONSTANT_PRODUCT_V1,
      migrationDex: MigrationDex.RAYDIUM,
      icon: iconBase64,
      banner: bannerBase64,
      description: params.description,
      links: [
        ...(params.links?.twitter ? [{ label: "Twitter", url: params.links.twitter }] : []),
        ...(params.links?.telegram ? [{ label: "Telegram", url: params.links.telegram }] : []),
        ...(params.links?.website ? [{ label: "Website", url: params.links.website }] : []),
        ...(params.links?.discord ? [{ label: "Discord", url: params.links.discord }] : []),
      ],
      tokenAmount: params.initialBuyAmount,
    });

    // Step 2: Deserialize, sign, and re-serialize the transaction
    const txBuf = Buffer.from(prepared.transaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([signerKeypair]);
    const signedTx = Buffer.from(tx.serialize()).toString("base64");

    // Step 3: submitMintTx
    const result = await moonit.submitMintTx({
      tokenId: prepared.tokenId,
      token: prepared.token,
      signedTransaction: signedTx,
    });

    return {
      platform: "moonshot",
      chain: "solana",
      tokenAddress: prepared.tokenId,
      txHash: result.txSignature,
      tokenName: params.name,
      tokenSymbol: params.symbol,
      creatorAddress: signerKeypair.publicKey.toBase58(),
      timestamp: Date.now(),
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const resp = await fetch(
      `${DEXSCREENER_API}/dex/tokens/${tokenAddress}`
    );
    if (!resp.ok) throw new Error(`Token not found: ${tokenAddress}`);
    const data = (await resp.json()) as { pairs: any[] };

    const pair = data.pairs?.[0];
    if (!pair) throw new Error(`No pairs found for token: ${tokenAddress}`);

    return {
      platform: "moonshot",
      chain: "solana",
      tokenAddress,
      name: pair.baseToken?.name || "",
      symbol: pair.baseToken?.symbol || "",
      creatorAddress: "",
      marketCap: pair.marketCap || pair.fdv,
      price: pair.priceNative ? parseFloat(pair.priceNative) : undefined,
      priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : undefined,
      liquidityUsd: pair.liquidity?.usd,
      volume24h: pair.volume?.h24,
      extra: {
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
        url: pair.url,
      },
    };
  }

  async listTokens(params?: ListTokensParams): Promise<TokenInfo[]> {
    const limit = params?.limit || 20;

    // Use DEX Screener search for Moonshot-specific tokens
    const resp = await fetch(
      `${DEXSCREENER_API}/dex/search?q=moonshot`
    );
    if (!resp.ok) throw new Error("Failed to list Moonshot tokens");
    const data = (await resp.json()) as { pairs: any[] };

    return (data.pairs || [])
      .filter((p: any) => p.chainId === "solana")
      .slice(0, limit)
      .map((p: any) => ({
        platform: "moonshot" as const,
        chain: "solana" as const,
        tokenAddress: p.baseToken?.address || "",
        name: p.baseToken?.name || "",
        symbol: p.baseToken?.symbol || "",
        imageUrl: p.info?.imageUrl,
        creatorAddress: "",
        marketCap: p.marketCap || p.fdv,
        price: p.priceNative ? parseFloat(p.priceNative) : undefined,
        priceUsd: p.priceUsd ? parseFloat(p.priceUsd) : undefined,
        liquidityUsd: p.liquidity?.usd,
        volume24h: p.volume?.h24,
        createdAt: p.pairCreatedAt,
      }));
  }

  async buy(params: TradeParams): Promise<TradeResult> {
    const { Moonit, Environment, FixedSide } = await import("@moonit/sdk");
    const {
      Keypair,
      Connection,
      ComputeBudgetProgram,
      TransactionMessage,
      VersionedTransaction,
    } = await import("@solana/web3.js");
    const bs58 = await import("bs58");

    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const rpcUrl =
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl);

    const moonit = new Moonit({
      rpcUrl,
      environment: Environment.MAINNET,
      chainOptions: {
        solana: { confirmOptions: { commitment: "confirmed" } },
      },
    });

    const token = moonit.Token({ mintAddress: params.tokenAddress });

    // Calculate how many tokens we get for the SOL amount
    const tokenAmount = 10000n * 1000000000n; // placeholder, adjusted by collateral
    const collateralAmount = await token.getCollateralAmountByTokens({
      tokenAmount,
      tradeDirection: "BUY",
    });

    const { ixs } = await token.prepareIxs({
      slippageBps: (params.slippage || 10) * 100,
      creatorPK: signerKeypair.publicKey.toBase58(),
      tokenAmount,
      collateralAmount,
      tradeDirection: "BUY",
      fixedSide: FixedSide.OUT,
    });

    const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 200_000,
    });
    const blockhash = await connection.getLatestBlockhash("confirmed");
    const messageV0 = new TransactionMessage({
      payerKey: signerKeypair.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: [priorityIx, ...ixs],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([signerKeypair]);
    const txHash = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 0,
      preflightCommitment: "confirmed",
    });

    return {
      platform: "moonshot",
      chain: "solana",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "buy",
      nativeAmount: params.amount,
      tokenAmount: tokenAmount.toString(),
      timestamp: Date.now(),
    };
  }

  async sell(params: TradeParams): Promise<TradeResult> {
    const { Moonit, Environment, FixedSide } = await import("@moonit/sdk");
    const {
      Keypair,
      Connection,
      ComputeBudgetProgram,
      TransactionMessage,
      VersionedTransaction,
    } = await import("@solana/web3.js");
    const bs58 = await import("bs58");

    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const rpcUrl =
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl);

    const moonit = new Moonit({
      rpcUrl,
      environment: Environment.MAINNET,
      chainOptions: {
        solana: { confirmOptions: { commitment: "confirmed" } },
      },
    });

    const token = moonit.Token({ mintAddress: params.tokenAddress });
    const tokenAmount = BigInt(params.amount);

    const collateralAmount = await token.getCollateralAmountByTokens({
      tokenAmount,
      tradeDirection: "SELL",
    });

    const { ixs } = await token.prepareIxs({
      slippageBps: (params.slippage || 10) * 100,
      creatorPK: signerKeypair.publicKey.toBase58(),
      tokenAmount,
      collateralAmount,
      tradeDirection: "SELL",
      fixedSide: FixedSide.IN,
    });

    const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 200_000,
    });
    const blockhash = await connection.getLatestBlockhash("confirmed");
    const messageV0 = new TransactionMessage({
      payerKey: signerKeypair.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: [priorityIx, ...ixs],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([signerKeypair]);
    const txHash = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 0,
      preflightCommitment: "confirmed",
    });

    return {
      platform: "moonshot",
      chain: "solana",
      txHash,
      tokenAddress: params.tokenAddress,
      action: "sell",
      tokenAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async getTradeHistory(
    tokenAddress: string,
    params?: { limit?: number }
  ): Promise<TradeHistoryItem[]> {
    const limit = params?.limit || 50;

    try {
      const resp = await fetch(
        `https://api.moonshot.cc/trades/v1/latest/solana?tokenId=${tokenAddress}&limit=${limit}`
      );
      if (!resp.ok) throw new Error(`Moonshot trades API returned ${resp.status}`);
      const trades = (await resp.json()) as any[];

      return trades.map((t: any) => ({
        txHash: t.txHash || t.txSignature || t.signature || "",
        action: (t.type === "sell" || t.side === "sell" ? "sell" : "buy") as "buy" | "sell",
        tokenAmount: String(t.tokenAmount ?? t.amount ?? "0"),
        nativeAmount: t.solAmount != null
          ? String(t.solAmount)
          : t.nativeAmount != null
            ? String(t.nativeAmount)
            : undefined,
        priceUsd: t.priceUsd != null ? Number(t.priceUsd) : undefined,
        timestamp: t.timestamp ? Number(t.timestamp) : Date.now(),
        walletAddress: t.walletAddress || t.maker || t.user || undefined,
      }));
    } catch {
      // Fallback: return empty array if Moonshot API is unavailable
      return [];
    }
  }

  async getTrending(params?: TrendingParams): Promise<TokenInfo[]> {
    const limit = params?.limit || 20;
    const category = params?.category || "volume";

    try {
      // Try Moonshot Data API for new tokens
      if (category === "new") {
        const resp = await fetch(
          `https://api.moonshot.cc/tokens/v1/new/solana?limit=${limit}`
        );
        if (resp.ok) {
          const tokens = (await resp.json()) as any[];
          return tokens.map((t: any) => ({
            platform: "moonshot" as const,
            chain: "solana" as const,
            tokenAddress: t.mintAddress || t.tokenAddress || t.address || "",
            name: t.name || "",
            symbol: t.symbol || "",
            description: t.description,
            imageUrl: t.image || t.icon || t.imageUrl,
            creatorAddress: t.creator || "",
            marketCap: t.marketCap,
            priceUsd: t.priceUsd != null ? Number(t.priceUsd) : undefined,
            volume24h: t.volume24h,
            createdAt: t.createdAt ? Number(t.createdAt) : undefined,
          }));
        }
      }

      // Fallback: DexScreener boosted tokens filtered for Solana
      const resp = await fetch(
        "https://api.dexscreener.com/token-boosts/top/v1"
      );
      if (!resp.ok) throw new Error(`DexScreener boosts API returned ${resp.status}`);
      const boosted = (await resp.json()) as any[];

      // Filter for Solana tokens only
      let filtered = boosted.filter((t: any) => t.chainId === "solana");

      // Fetch detailed pair data for the filtered tokens
      const addresses = filtered.slice(0, limit).map((t: any) => t.tokenAddress);
      if (addresses.length === 0) return [];

      // DexScreener supports comma-separated addresses (max 30)
      const detailResp = await fetch(
        `${DEXSCREENER_API}/dex/tokens/${addresses.join(",")}`
      );
      if (!detailResp.ok) throw new Error(`DexScreener tokens API returned ${detailResp.status}`);
      const detailData = (await detailResp.json()) as { pairs: any[] };

      // Deduplicate by token address, keeping the first (most liquid) pair
      const seen = new Set<string>();
      let pairs = (detailData.pairs || []).filter((p: any) => {
        const addr = p.baseToken?.address;
        if (!addr || seen.has(addr)) return false;
        seen.add(addr);
        return true;
      });

      // Sort based on category
      if (category === "gainers") {
        pairs.sort(
          (a: any, b: any) =>
            (b.priceChange?.h24 ?? 0) - (a.priceChange?.h24 ?? 0)
        );
      } else if (category === "volume") {
        pairs.sort(
          (a: any, b: any) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0)
        );
      }
      // "graduated" and default: keep DexScreener's default ordering

      return pairs.slice(0, limit).map((p: any) => ({
        platform: "moonshot" as const,
        chain: "solana" as const,
        tokenAddress: p.baseToken?.address || "",
        name: p.baseToken?.name || "",
        symbol: p.baseToken?.symbol || "",
        imageUrl: p.info?.imageUrl,
        creatorAddress: "",
        marketCap: p.marketCap || p.fdv,
        price: p.priceNative ? parseFloat(p.priceNative) : undefined,
        priceUsd: p.priceUsd ? parseFloat(p.priceUsd) : undefined,
        liquidityUsd: p.liquidity?.usd,
        volume24h: p.volume?.h24,
        createdAt: p.pairCreatedAt,
      }));
    } catch {
      return [];
    }
  }
}

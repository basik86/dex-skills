import {
  type PlatformSkill,
  type LaunchParams,
  type LaunchResult,
  type TokenInfo,
  type ListTokensParams,
  type WalletConfig,
  type TradeParams,
  type TradeResult,
} from "../../shared/types.js";

const PUMPPORTAL_API = "https://pumpportal.fun/api";
const BITQUERY_API = "https://streaming.bitquery.io/graphql";

export class LetsBonkSkill implements PlatformSkill {
  platform = "letsbonk" as const;
  chain = "solana" as const;

  private wallet: WalletConfig["solana"];
  private bitqueryApiKey?: string;

  constructor(wallet: WalletConfig["solana"], bitqueryApiKey?: string) {
    this.wallet = wallet;
    this.bitqueryApiKey = bitqueryApiKey;
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    // PumpPortal supports LetsBonk/BONKfun launches
    const { Keypair, Connection, Transaction } = await import(
      "@solana/web3.js"
    );
    const bs58 = await import("bs58");

    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const mintKeypair = Keypair.generate();

    // Upload metadata
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
      throw new Error(`LetsBonk IPFS upload failed: ${await metadataResp.text()}`);
    }
    const metadata = (await metadataResp.json()) as { metadataUri: string };

    // Create token via PumpPortal (bonk pool)
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
        pool: "bonk",
      }),
    });

    if (!createResp.ok) {
      throw new Error(`LetsBonk launch failed: ${await createResp.text()}`);
    }

    const txBytes = new Uint8Array(await createResp.arrayBuffer());
    const connection = new Connection(
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com"
    );
    const tx = Transaction.from(txBytes);
    tx.sign(signerKeypair, mintKeypair);
    const txHash = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txHash);

    return {
      platform: "letsbonk",
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
    // Sanitize input to prevent GraphQL injection
    const sanitizedAddress = tokenAddress.replace(/[^a-zA-Z0-9]/g, "");

    const query = `{
      Solana {
        DEXTradeByTokens(
          where: {
            Trade: { Currency: { MintAddress: { is: "${sanitizedAddress}" } } }
            Transaction: { Result: { Success: true } }
          }
          limit: { count: 1 }
          orderBy: { descending: Block_Time }
        ) {
          Trade {
            Currency {
              Name
              Symbol
              MintAddress
              Decimals
              Uri
            }
            Price
            PriceInUSD
          }
        }
      }
    }`;

    const resp = await fetch(BITQUERY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.bitqueryApiKey
          ? { Authorization: `Bearer ${this.bitqueryApiKey}` }
          : {}),
      },
      body: JSON.stringify({ query }),
    });

    const result = (await resp.json()) as any;
    const trade = result?.data?.Solana?.DEXTradeByTokens?.[0]?.Trade;

    if (!trade) throw new Error(`Token not found: ${tokenAddress}`);

    return {
      platform: "letsbonk",
      chain: "solana",
      tokenAddress,
      name: trade.Currency.Name,
      symbol: trade.Currency.Symbol,
      creatorAddress: "",
      price: trade.Price,
      priceUsd: trade.PriceInUSD,
      extra: { uri: trade.Currency.Uri },
    };
  }

  async listTokens(params?: ListTokensParams): Promise<TokenInfo[]> {
    const limit = Math.min(Math.max(1, Math.floor(params?.limit || 20)), 100);

    const query = `{
      Solana {
        DEXTradeByTokens(
          where: {
            Trade: { Dex: { ProtocolName: { is: "bonk" } } }
            Transaction: { Result: { Success: true } }
          }
          limit: { count: ${limit} }
          orderBy: { descending: Block_Time }
        ) {
          Trade {
            Currency {
              Name
              Symbol
              MintAddress
            }
            Price
            PriceInUSD
          }
          Block {
            Time
          }
        }
      }
    }`;

    const resp = await fetch(BITQUERY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.bitqueryApiKey
          ? { Authorization: `Bearer ${this.bitqueryApiKey}` }
          : {}),
      },
      body: JSON.stringify({ query }),
    });

    const result = (await resp.json()) as any;
    const trades = result?.data?.Solana?.DEXTradeByTokens || [];

    return trades.map((t: any) => ({
      platform: "letsbonk" as const,
      chain: "solana" as const,
      tokenAddress: t.Trade.Currency.MintAddress,
      name: t.Trade.Currency.Name,
      symbol: t.Trade.Currency.Symbol,
      creatorAddress: "",
      price: t.Trade.Price,
      priceUsd: t.Trade.PriceInUSD,
      createdAt: t.Block?.Time ? new Date(t.Block.Time).getTime() : undefined,
    }));
  }

  async buy(params: TradeParams): Promise<TradeResult> {
    const { Keypair, Connection, Transaction } = await import(
      "@solana/web3.js"
    );
    const bs58 = await import("bs58");

    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const connection = new Connection(
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com"
    );

    const resp = await fetch(`${PUMPPORTAL_API}/trade-local`, {
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
        pool: "bonk",
      }),
    });

    if (!resp.ok) {
      throw new Error(`LetsBonk buy failed: ${await resp.text()}`);
    }

    const txBytes = new Uint8Array(await resp.arrayBuffer());
    const tx = Transaction.from(txBytes);
    tx.sign(signerKeypair);
    const txHash = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txHash);

    return {
      platform: "letsbonk",
      chain: "solana",
      action: "buy",
      tokenAddress: params.tokenAddress,
      nativeAmount: params.amount,
      txHash,
      timestamp: Date.now(),
    };
  }

  async sell(params: TradeParams): Promise<TradeResult> {
    const { Keypair, Connection, Transaction } = await import(
      "@solana/web3.js"
    );
    const bs58 = await import("bs58");

    const signerKeypair = Keypair.fromSecretKey(
      bs58.default.decode(this.wallet!.privateKey)
    );
    const connection = new Connection(
      this.wallet!.rpcUrl || "https://api.mainnet-beta.solana.com"
    );

    const resp = await fetch(`${PUMPPORTAL_API}/trade-local`, {
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
        pool: "bonk",
      }),
    });

    if (!resp.ok) {
      throw new Error(`LetsBonk sell failed: ${await resp.text()}`);
    }

    const txBytes = new Uint8Array(await resp.arrayBuffer());
    const tx = Transaction.from(txBytes);
    tx.sign(signerKeypair);
    const txHash = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txHash);

    return {
      platform: "letsbonk",
      chain: "solana",
      action: "sell",
      tokenAddress: params.tokenAddress,
      tokenAmount: params.amount,
      txHash,
      timestamp: Date.now(),
    };
  }
}

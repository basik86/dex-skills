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
} from "../../shared/types.js";

// Four.meme contract addresses on BSC
const TOKEN_MANAGER2 = "0x5c952063c7fc8610FFDB798152D69F0B9550762b";
const TOKEN_MANAGER_HELPER3 = "0xF251F83e40a78868FcfA3FA4599Dad6494E46034";
const FOURMEME_API = "https://four.meme/meme-api";

// TokenManager2 ABI (from official docs)
const TOKEN_MANAGER2_ABI = [
  "function createToken(bytes args, bytes signature) payable",
  "function buyTokenAMAP(address token, uint256 funds, uint256 minAmount) payable",
  "function buyToken(address token, uint256 amount, uint256 maxFunds) payable",
  "function sellToken(address token, uint256 amount)",
  "function _tokenInfos(address) view returns (address base, address quote, uint256 template, uint256 totalSupply, uint256 maxOffers, uint256 maxRaising, uint256 launchTime, uint256 offers, uint256 funds, uint256 lastPrice, uint256 K, uint256 T, uint256 status)",
  "function _tokenCount() view returns (uint256)",
  "function _tokens(uint256) view returns (address)",
  "event TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime, uint256 launchFee)",
  "event TokenPurchase(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)",
  "event TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)",
] as const;

// TokenManagerHelper3 ABI
const HELPER3_ABI = [
  "function getTokenInfo(address token) view returns (uint256 version, address tokenManager, address quote, uint256 lastPrice, uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime, uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded)",
  "function tryBuy(address token, uint256 amount, uint256 funds) view returns (address tokenManager, address quote, uint256 estimatedAmount, uint256 estimatedCost, uint256 estimatedFee, uint256 amountMsgValue, uint256 amountApproval, uint256 amountFunds)",
  "function trySell(address token, uint256 amount) view returns (address tokenManager, address quote, uint256 funds, uint256 fee)",
] as const;

export class FourMemeSkill implements PlatformSkill {
  platform = "fourmeme" as const;
  chain = "bnb" as const;

  private wallet: WalletConfig["bnb"];

  constructor(wallet: WalletConfig["bnb"]) {
    this.wallet = wallet;
  }

  private getRpcUrl() {
    return this.wallet!.rpcUrl || "https://bsc-dataseed1.binance.org";
  }

  /**
   * Four.meme token creation is a 2-step process:
   * 1. API call to get createArg + signature (requires auth)
   * 2. On-chain createToken(createArg, signature) with msg.value
   */
  async launch(params: LaunchParams): Promise<LaunchResult> {
    const { ethers } = await import("ethers");

    const provider = new ethers.JsonRpcProvider(this.getRpcUrl());
    const signer = new ethers.Wallet(this.wallet!.privateKey, provider);

    // Step 1: Auth — get nonce
    const nonceResp = await fetch(
      `${FOURMEME_API}/v1/private/user/nonce/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountAddress: signer.address,
          verifyType: "LOGIN",
          networkCode: "BSC",
        }),
      }
    );
    const nonceData = (await nonceResp.json()) as { data: string };
    const nonce = nonceData.data;

    // Step 2: Sign message and login
    const message = `You are sign in Meme ${nonce}`;
    const signature = await signer.signMessage(message);

    const loginResp = await fetch(
      `${FOURMEME_API}/v1/private/user/login/dex`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: "WEB",
          langType: "EN",
          loginIp: "",
          inviteCode: "",
          verifyInfo: {
            address: signer.address,
            networkCode: "BSC",
            signature,
            verifyType: "LOGIN",
          },
          walletName: "Agent",
        }),
      }
    );
    const loginData = (await loginResp.json()) as { data: string };
    const accessToken = loginData.data;

    // Step 3: Upload image if provided
    let imgUrl = "";
    if (params.imageUrl) {
      const imageResp = await fetch(params.imageUrl);
      const imageBlob = await imageResp.blob();
      const formData = new FormData();
      formData.append("file", imageBlob, "token-image.png");

      const uploadResp = await fetch(
        `${FOURMEME_API}/v1/private/token/upload`,
        {
          method: "POST",
          headers: { "meme-web-access": accessToken },
          body: formData,
        }
      );
      const uploadData = (await uploadResp.json()) as { data: string };
      imgUrl = uploadData.data;
    }

    // Step 4: Create token via API — get createArg + signature
    const createApiResp = await fetch(
      `${FOURMEME_API}/v1/private/token/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "meme-web-access": accessToken,
        },
        body: JSON.stringify({
          name: params.name,
          shortName: params.symbol,
          desc: params.description || "",
          imgUrl,
          label: (params.extra?.label as string) || "Meme",
          launchTime: Date.now(),
          lpTradingFee: 0.0025,
          totalSupply: 1000000000,
          raisedAmount: 24,
          saleRate: 0.8,
          reserveRate: 0,
          symbol: "BNB",
          preSale: params.initialBuyAmount || "0",
          onlyMPC: false,
          funGroup: false,
          clickFun: false,
          webUrl: params.links?.website || (params.extra?.webUrl as string) || "",
          twitterUrl: params.links?.twitter || (params.extra?.twitterUrl as string) || "",
          telegramUrl: params.links?.telegram || (params.extra?.telegramUrl as string) || "",
        }),
      }
    );
    const createData = (await createApiResp.json()) as {
      data: { createArg: string; signature: string };
    };

    if (!createData.data?.createArg) {
      throw new Error(
        `Four.meme API create failed: ${JSON.stringify(createData)}`
      );
    }

    // Step 5: On-chain createToken
    const contract = new ethers.Contract(
      TOKEN_MANAGER2,
      TOKEN_MANAGER2_ABI,
      signer
    );

    const preSaleBnb = params.initialBuyAmount
      ? ethers.parseEther(params.initialBuyAmount)
      : 0n;
    const launchFee = ethers.parseEther("0.01");

    const tx = await contract.createToken(
      ethers.getBytes(createData.data.createArg),
      ethers.getBytes(createData.data.signature),
      { value: launchFee + preSaleBnb }
    );

    const receipt = await tx.wait();

    // Step 6: Extract token address from TokenCreate event
    const iface = new ethers.Interface(TOKEN_MANAGER2_ABI);
    let tokenAddress: string | undefined;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "TokenCreate") {
          tokenAddress = parsed.args.token;
          break;
        }
      } catch {
        // skip non-matching logs
      }
    }

    if (!tokenAddress) {
      throw new Error(
        `Four.meme token created but could not extract token address from tx: ${receipt.hash}`
      );
    }

    return {
      platform: "fourmeme",
      chain: "bnb",
      tokenAddress,
      txHash: receipt.hash,
      tokenName: params.name,
      tokenSymbol: params.symbol,
      creatorAddress: signer.address,
      timestamp: Date.now(),
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(this.getRpcUrl());

    const helper = new ethers.Contract(
      TOKEN_MANAGER_HELPER3,
      HELPER3_ABI,
      provider
    );

    const info = await helper.getTokenInfo(tokenAddress);

    // Also fetch from API for metadata
    let apiData: Record<string, any> = {};
    try {
      const resp = await fetch(
        `${FOURMEME_API}/v1/private/token/get?address=${tokenAddress}`
      );
      if (resp.ok) {
        const result = (await resp.json()) as { data: Record<string, any> };
        apiData = result.data || {};
      }
    } catch {
      // API might require auth, fall back to on-chain only
    }

    return {
      platform: "fourmeme",
      chain: "bnb",
      tokenAddress,
      name: apiData.name || "",
      symbol: apiData.shortName || apiData.symbol || "",
      description: apiData.desc,
      imageUrl: apiData.imgUrl,
      creatorAddress: apiData.creator || "",
      price: info.lastPrice ? Number(info.lastPrice) / 1e18 : undefined,
      isGraduated: info.liquidityAdded,
      bondingCurveProgress: info.maxFunds > 0
        ? Number(info.funds * 100n / info.maxFunds)
        : undefined,
      extra: {
        version: Number(info.version),
        tokenManager: info.tokenManager,
        quote: info.quote,
        tradingFeeRate: Number(info.tradingFeeRate) / 10000,
        offers: info.offers.toString(),
        maxOffers: info.maxOffers.toString(),
        funds: info.funds.toString(),
        maxFunds: info.maxFunds.toString(),
        launchTime: Number(info.launchTime),
      },
    };
  }

  async listTokens(params?: ListTokensParams): Promise<TokenInfo[]> {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(this.getRpcUrl());

    const manager = new ethers.Contract(
      TOKEN_MANAGER2,
      TOKEN_MANAGER2_ABI,
      provider
    );

    const helper = new ethers.Contract(
      TOKEN_MANAGER_HELPER3,
      HELPER3_ABI,
      provider
    );

    const totalTokens = await manager._tokenCount();
    const limit = params?.limit || 20;
    const start = Number(totalTokens) - 1 - (params?.offset || 0);
    const end = Math.max(start - limit + 1, 0);

    // Fetch token addresses in parallel
    const indices = Array.from({ length: start - end + 1 }, (_, k) => start - k);
    const addrs = await Promise.all(
      indices.map((i) => manager._tokens(i).catch(() => null))
    );

    // Fetch token info in parallel
    const validAddrs = addrs.filter((a): a is string => a !== null);
    const infos = await Promise.all(
      validAddrs.map((addr) =>
        helper.getTokenInfo(addr).then(
          (info: any) => ({ addr, info }),
          () => null
        )
      )
    );

    return infos
      .filter((r): r is { addr: string; info: any } => r !== null)
      .map(({ addr, info }) => ({
        platform: "fourmeme" as const,
        chain: "bnb" as const,
        tokenAddress: addr,
        name: "",
        symbol: "",
        creatorAddress: "",
        price: info.lastPrice ? Number(info.lastPrice) / 1e18 : undefined,
        isGraduated: info.liquidityAdded,
        bondingCurveProgress: info.maxFunds > 0
          ? Number(info.funds * 100n / info.maxFunds)
          : undefined,
        createdAt: Number(info.launchTime) * 1000,
        extra: {
          version: Number(info.version),
          funds: info.funds.toString(),
          maxFunds: info.maxFunds.toString(),
        },
      }));
  }

  async buy(params: TradeParams): Promise<TradeResult> {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(this.getRpcUrl());
    const signer = new ethers.Wallet(this.wallet!.privateKey, provider);
    const contract = new ethers.Contract(
      TOKEN_MANAGER2,
      TOKEN_MANAGER2_ABI,
      signer
    );

    // buyTokenAMAP(token, funds, minAmount) payable
    // funds = amount of BNB, minAmount = minimum tokens to receive (use 0 for simplicity with slippage)
    const value = ethers.parseEther(params.amount);
    const tx = await contract.buyTokenAMAP(
      params.tokenAddress,
      value,
      0n,
      { value }
    );
    const receipt = await tx.wait();

    // Try to extract amount from TokenPurchase event
    let tokenAmount: string | undefined;
    const iface = new ethers.Interface(TOKEN_MANAGER2_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "TokenPurchase") {
          tokenAmount = parsed.args.amount.toString();
          break;
        }
      } catch {
        // skip non-matching logs
      }
    }

    return {
      platform: "fourmeme",
      chain: "bnb",
      txHash: receipt.hash,
      tokenAddress: params.tokenAddress,
      action: "buy",
      tokenAmount,
      nativeAmount: params.amount,
      timestamp: Date.now(),
    };
  }

  async sell(params: TradeParams): Promise<TradeResult> {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(this.getRpcUrl());
    const signer = new ethers.Wallet(this.wallet!.privateKey, provider);
    const contract = new ethers.Contract(
      TOKEN_MANAGER2,
      TOKEN_MANAGER2_ABI,
      signer
    );

    // sellToken(token, amount) - amount is token amount
    const tx = await contract.sellToken(
      params.tokenAddress,
      BigInt(params.amount)
    );
    const receipt = await tx.wait();

    // Try to extract proceeds from TokenSale event
    let nativeAmount: string | undefined;
    const iface = new ethers.Interface(TOKEN_MANAGER2_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "TokenSale") {
          nativeAmount = ethers.formatEther(parsed.args.cost);
          break;
        }
      } catch {
        // skip non-matching logs
      }
    }

    return {
      platform: "fourmeme",
      chain: "bnb",
      txHash: receipt.hash,
      tokenAddress: params.tokenAddress,
      action: "sell",
      tokenAmount: params.amount,
      nativeAmount,
      timestamp: Date.now(),
    };
  }

  async estimatePrice(params: PriceQuoteParams): Promise<PriceQuote> {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(this.getRpcUrl());
    const helper = new ethers.Contract(
      TOKEN_MANAGER_HELPER3,
      HELPER3_ABI,
      provider
    );

    if (params.action === "buy") {
      // tryBuy(token, amount, funds) view returns (tokenManager, quote, estimatedAmount, estimatedCost, estimatedFee, ...)
      const result = await helper.tryBuy(
        params.tokenAddress,
        0,
        ethers.parseEther(params.amount)
      );
      return {
        estimatedAmount: result.estimatedAmount.toString(),
        estimatedCost: ethers.formatEther(result.estimatedCost),
        fee: ethers.formatEther(result.estimatedFee),
      };
    } else {
      // trySell(token, amount) view returns (tokenManager, quote, funds, fee)
      const result = await helper.trySell(
        params.tokenAddress,
        BigInt(params.amount)
      );
      return {
        estimatedAmount: ethers.formatEther(result.funds),
        estimatedCost: params.amount,
        fee: ethers.formatEther(result.fee),
      };
    }
  }
}

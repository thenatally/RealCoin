export type PriceHistoryData = {
    coinId: string;
    timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};
export type PortfolioHistoryData = {
    userId: string;
    timestamp: Date;
    totalValue: number;
    holdingsValue: number;
    cashValue: number;
    holdings: Record<string, {
        amount: number;
        value: number;
        avgCost: number;
    }>;
};
declare class PriceHistoryManager {
    priceData: Map<string, Array<{
        price: number;
        timestamp: Date;
        volume: number;
    }>>;
    constructor();
    recordPrice(coinId: string, price: number, volume?: number): Promise<void>;
    private getTimeframeInterval;
    getPriceHistory(coinId: string, timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w', limit?: number): Promise<PriceHistoryData[]>;
}
export type CoinData = {
    id: string;
    name: string;
    price: number;
    baseVol: number;
    liquidity: number;
    lastUpdated: Date;
};
export type OrderData = {
    id: string;
    userId: string;
    coinId: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    price?: number;
    amount: number;
    createdAt: Date;
    status: 'pending' | 'filled' | 'cancelled';
};
export type TradeData = {
    id: string;
    coinId: string;
    price: number;
    amount: number;
    buyerId: string;
    sellerId: string;
    timestamp: Date;
};
export type BotData = {
    id: string;
    personality?: BotPersonality;
    targetCoin: string;
    watchedCoins?: string[];
    parameters: Record<string, any>;
    lastAction: Date;
    enabled: boolean;
    portfolio: {
        cash: number;
        holdings: Record<string, {
            amount: number;
            averageCost: number;
        }>;
    };
};
declare class Coin {
    id: string;
    name: string;
    price: number;
    baseVol: number;
    liquidity: number;
    lastUpdated: Date;
    constructor(data: CoinData);
    applyPriceImpact(tradeVolume: number, side: 'buy' | 'sell', priceHistoryManager?: PriceHistoryManager): number;
    addVolatility(priceHistoryManager?: PriceHistoryManager): void;
    save(): Promise<void>;
    static load(id: string): Promise<Coin | null>;
    static loadAll(): Promise<Coin[]>;
}
type BotPersonality = 'momentum-maxine' | 'mean-revertor-marvin' | 'whale-wendy' | 'pattern-prophet' | 'stoploss-steve' | 'copycat-carla' | 'contrarian-carl' | 'fomo-fiona' | 'longterm-larry' | 'ape-alex' | 'quant-quinn' | 'doom-daniel' | 'lazy-lisa' | 'arbitrage-arnie' | 'influencer-izzy' | 'scalper-sally' | 'daytrader-danny' | 'swingtrader-sam' | 'news-nancy' | 'technical-ted' | 'fundamental-frank' | 'random-rick' | 'correlation-cora' | 'volatility-victor' | 'liquidity-lucy' | 'breakout-bob' | 'support-sarah' | 'marketmaker-mike' | 'sniper-steve' | 'panic-pete' | 'patient-paul' | 'trendfollower-tim' | 'meanreversionmary' | 'fibonacci-fran' | 'volume-vince';
interface PersonalityTraits {
    name: string;
    description: string;
    tradingStyle: string;
    aggressiveness: number;
    frequency: number;
    volatilityLove: number;
    herdMentality: number;
    announcement?: boolean;
}
declare class Bot {
    id: string;
    personality: BotPersonality;
    traits: PersonalityTraits;
    targetCoin: string;
    watchedCoins: string[];
    parameters: Record<string, any>;
    lastAction: Date;
    enabled: boolean;
    portfolio: {
        cash: number;
        holdings: Record<string, {
            amount: number;
            averageCost: number;
        }>;
    };
    constructor(data: BotData);
    private getRandomPersonality;
    tick(marketState: MarketEngine): Promise<void>;
    private tradeWithPersonality;
    private momentumMaxineTrade;
    private meanRevertorMarvinTrade;
    private whaleWendyTrade;
    private patternProphetTrade;
    private stoplossSteveTrade;
    private copycatCarlaTrade;
    private contrarianCarlTrade;
    private fomoFionaTrade;
    private longtermLarryTrade;
    private apeAlexTrade;
    private quantQuinnTrade;
    private calculateRSI;
    private calculateVolatility;
    private doomDanielTrade;
    private lazyLisaTrade;
    private arbitrageArnieTrade;
    private influencerIzzyTrade;
    private getPriceChangePercent;
    private getMovingAverage;
    private isTrendUp;
    private isTrendDown;
    private getTradeSize;
    private makeTrade;
    private executeTrade;
    private getMarketSentiment;
    private getBestPerformingCoin;
    private getWorstPerformingCoin;
    private updateMarketHistory;
    private shouldSwitchFocus;
    private scalperSallyTrade;
    private daytraderDannyTrade;
    private swingtraderSamTrade;
    private newsNancyTrade;
    private technicalTedTrade;
    private fundamentalFrankTrade;
    private randomRickTrade;
    private correlationCoraTrade;
    private volatilityVictorTrade;
    private liquidityLucyTrade;
    private breakoutBobTrade;
    private supportSarahTrade;
    private marketmakerMikeTrade;
    private sniperSteveTrade;
    private panicPeteTrade;
    private patientPaulTrade;
    private trendfollowerTimTrade;
    private meanreversionMaryTrade;
    private fibonacciFranTrade;
    private volumeVinceTrade;
    save(): Promise<void>;
    forceSave(): Promise<void>;
    static load(id: string): Promise<Bot | null>;
    static loadAll(): Promise<Bot[]>;
    getCurrentStrategy(): string;
    getRecentActions(limit?: number): Array<{
        action: string;
        timestamp: Date;
        details: string;
    }>;
    get marketHistory(): Record<string, number[]>;
}
interface MarketAnalytics {
    totalMarketCap: number;
    totalVolume24h: number;
    marketSentiment: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
    topGainers: Array<{
        coinId: string;
        change24h: number;
        price: number;
    }>;
    topLosers: Array<{
        coinId: string;
        change24h: number;
        price: number;
    }>;
    mostActive: Array<{
        coinId: string;
        volume24h: number;
        trades: number;
    }>;
    volatilityIndex: number;
    correlationMatrix: Record<string, Record<string, number>>;
}
declare class MarketAnalyticsEngine {
    private analytics;
    calculateAnalytics(coins: Map<string, Coin>, priceHistory: PriceHistoryManager, trades: TradeData[]): MarketAnalytics;
    getAnalytics(): MarketAnalytics;
}
interface MarketEvent {
    id: string;
    type: 'flash_crash' | 'pump' | 'rug_pull' | 'whale_dump' | 'news_spike' | 'correlation_break' | 'liquidity_crisis';
    targetCoin?: string;
    severity: 'minor' | 'moderate' | 'major' | 'extreme';
    duration: number;
    priceMultiplier: number;
    volatilityMultiplier: number;
    message: string;
    timestamp: Date;
    active: boolean;
}
declare class MarketEventsSystem {
    private activeEvents;
    private eventIdCounter;
    generateRandomEvent(coins: Map<string, Coin>): MarketEvent | null;
    applyEventEffects(coins: Map<string, Coin>, priceHistoryManager: PriceHistoryManager): void;
    private applyEventToCoin;
    getActiveEvents(): MarketEvent[];
}
export declare class MarketEngine {
    private static instance;
    coins: Map<string, Coin>;
    private bots;
    private orderIdCounter;
    private tradeIdCounter;
    priceHistoryManager: PriceHistoryManager;
    marketEvents: MarketEventsSystem;
    analytics: MarketAnalyticsEngine;
    private botSaveQueue;
    private coinSaveQueue;
    constructor();
    static getInstance(): MarketEngine;
    private startBatchSaveTimer;
    queueBotSave(botId: string): void;
    queueCoinSave(coinId: string): void;
    getAllBots(): Bot[];
    init(): Promise<void>;
    private initializeDefaultCoins;
    private initializeDefaultBots;
    private initializePriceHistory;
    private startMarketTick;
    private runFastForwardSimulation;
    placeOrder(orderData: OrderData): Promise<OrderData | null>;
    private updatePortfolio;
    getPortfolioWithGains(portfolio: any, coins: Map<string, Coin>): {
        cash: any;
        holdings: Record<string, {
            amount: number;
            averageCost: number;
            currentPrice: number;
            totalValue: number;
            totalCost: number;
            unrealizedGain: number;
            unrealizedGainPercent: number;
        }>;
        totalValue: any;
        totalCost: any;
        totalUnrealizedGain: number;
        totalUnrealizedGainPercent: number;
    };
    getCoin(coinId: string): Coin | undefined;
    getAllCoins(): Coin[];
}
export {};

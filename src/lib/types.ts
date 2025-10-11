

export type CoinData = {
	id: string;
	name: string;
	price: number;
	lastUpdated: string;
	baseVol?: number;
	liquidity?: number;
};

export type OrderData = {
	id: string;
	userId: string;
	coinId: string;
	side: 'buy' | 'sell';
	type: 'market' | 'limit';
	price?: number;
	amount: number;
	createdAt: string; 
	status: 'pending' | 'filled' | 'cancelled';
};

export type TradeData = {
	id: string;
	coinId: string;
	price: number;
	amount: number;
	buyerId: string;
	sellerId: string;
	timestamp: string; 
};

export type PortfolioData = {
	cash: number;
	holdings: Record<string, {
		amount: number;
		averageCost: number;
		currentPrice: number;
		totalValue: number;
		totalCost: number;
		unrealizedGain: number;
		unrealizedGainPercent: number;
	}>;
	totalValue: number;
	totalCost: number;
	totalUnrealizedGain: number;
	totalUnrealizedGainPercent: number;
};

export type BotData = {
	id: string;
	type: 'drunk' | 'momentum' | 'meanReverter' | 'whale' | 'frontRunner' | 'copycat';
	targetCoin: string;
	parameters: Record<string, any>;
	lastAction: string; 
	enabled: boolean;
};


export type WSMessage = 
	| PriceUpdateMessage
	| TradeMessage
	| RoomJoinedMessage;

export type PriceUpdateMessage = {
	type: 'price_update';
	prices: Record<string, {
		price: number;
		lastUpdated: string;
	}>;
};

export type TradeMessage = {
	type: 'trade';
	trade: TradeData;
};

export type RoomJoinedMessage = {
	type: 'room_joined';
	room: string;
};


export type OrderRequest = {
	coinId: string;
	side: 'buy' | 'sell';
	type: 'market' | 'limit';
	amount: number;
	price?: number;
};

export type APIResponse<T = any> = {
	success: boolean;
	error?: string;
	details?: any;
} & T;


export type TradingAPIResponse = {
	success: boolean;
	error?: string;
};

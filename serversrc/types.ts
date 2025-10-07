

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

export type PortfolioData = {
	cash: number;
	holdings: Record<string, number>; 
};

export type BotData = {
	id: string;
	type: 'drunk' | 'momentum' | 'meanReverter' | 'whale' | 'frontRunner' | 'copycat';
	targetCoin: string;
	parameters: Record<string, any>;
	lastAction: Date;
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

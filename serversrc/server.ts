import http from 'http';
import httpProxy from 'http-proxy';
import { WebSocketServer } from 'ws';
import * as speakeasy from 'speakeasy';
const useProxy = process.argv.includes('--proxy');
console.log(`Starting in ${useProxy ? 'proxy' : 'standalone'} mode`);
const BACKEND_TARGET = 'http://localhost:7070';

const proxy = httpProxy.createProxyServer({
	target: BACKEND_TARGET,
	ws: true
});
proxy.on('proxyReq', (_, req) => {
	useProxy && console.log(`[HTTP] Proxying request: ${req.method} ${req.url}`);
});

const wss = new WebSocketServer({ noServer: true });

import type { WebSocket } from 'ws';
import { DBMap, DBSingleton } from './db.js';
import z from 'zod';
import { createHash } from 'crypto';


const rooms = new Map<string, Set<WebSocket>>();
const clientRooms = new Map<WebSocket, string>();


function addClientToRoom(ws: WebSocket, roomId: string) {
	
	removeClientFromRoom(ws);

	
	if (!rooms.has(roomId)) {
		rooms.set(roomId, new Set());
	}
	rooms.get(roomId)!.add(ws);
	clientRooms.set(ws, roomId);
}

function removeClientFromRoom(ws: WebSocket) {
	const currentRoom = clientRooms.get(ws);
	if (currentRoom) {
		const roomClients = rooms.get(currentRoom);
		if (roomClients) {
			roomClients.delete(ws);
			
			if (roomClients.size === 0) {
				rooms.delete(currentRoom);
			}
		}
		clientRooms.delete(ws);
	}
}

function broadcastToRoom(roomId: string, message: string, excludeWs?: WebSocket) {
	const roomClients = rooms.get(roomId);
	if (roomClients) {
		for (const client of roomClients) {
			if (client !== excludeWs && client.readyState === client.OPEN) {
				client.send(message);
			}
		}
	}
}

function broadcastToAllRooms(message: string, excludeWs?: WebSocket) {
	for (const [roomId, roomClients] of rooms) {
		for (const client of roomClients) {
			if (client !== excludeWs && client.readyState === client.OPEN) {
				client.send(message);
			}
		}
	}
}

function getRoomInfo() {
	const roomInfo: Record<string, number> = {};
	for (const [roomId, roomClients] of rooms) {
		roomInfo[roomId] = roomClients.size;
	}
	return roomInfo;
}

import crypto, { verify } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const SECRET_KEY = process.env.TOTP_MASTER_KEY!;
if (!SECRET_KEY || SECRET_KEY.length !== 64) {
	console.error('Please set the TOTP_MASTER_KEY environment variable to a 32-byte hex string');
	process.exit(1);
}

function encryptSecret(secret: string) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(ALGO, Buffer.from(SECRET_KEY, 'hex'), iv);
	const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(encrypted: string) {
	const [ivHex, tagHex, dataHex] = encrypted.split(':');
	const decipher = crypto.createDecipheriv(
		ALGO,
		Buffer.from(SECRET_KEY, 'hex'),
		Buffer.from(ivHex, 'hex')
	);
	decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
	const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
	return decrypted.toString('utf8');
}

function verifyTOTP(token: string, secret: string): boolean {
	const verified = speakeasy.totp.verify({
		secret: secret,
		encoding: 'hex',
		token: token,
		window: 1
	});
	return verified;
}

function hash(password: string): string {
	return createHash('sha256').update(password).digest('hex');
}

const accountDB = new DBMap(
	'accounts',
	z.object({
		displayName: z.string().optional(),
		passwordHash: z.string(),
		avatarUrl: z.string().optional(),
		totp: z
			.object({
				secret: z.string(),
				backupCodes: z.array(z.string()).max(10).min(10)
			})
			.optional()
	}),
	null
);

const tokenDB = new DBMap(
	'tokens',
	z.object({
		userId: z.string(),
		createdAt: z.date(),
		expiresAt: z.date(),
		pendingTOTP: z
			.object({
				secretBase32: z.string(),
				secretHex: z.string(),
				otpauth_url: z.string(),
				backupCodes: z.array(z.string()).max(10).min(10),
				expiresAt: z.date()
			})
			.optional()
	}),
	null
);


const coinSchema = z.object({
	id: z.string(),
	name: z.string(),
	price: z.number(),
	baseVol: z.number(),
	liquidity: z.number(),
	lastUpdated: z.date()
});

const orderSchema = z.object({
	id: z.string(),
	userId: z.string(),
	coinId: z.string(),
	side: z.enum(['buy', 'sell']),
	type: z.enum(['market', 'limit']),
	price: z.number().optional(),
	amount: z.number(),
	createdAt: z.date(),
	status: z.enum(['pending', 'filled', 'cancelled'])
});

const tradeSchema = z.object({
	id: z.string(),
	coinId: z.string(),
	price: z.number(),
	amount: z.number(),
	buyerId: z.string(),
	sellerId: z.string(),
	timestamp: z.date()
});

const portfolioSchema = z.object({
	cash: z.number(),
	holdings: z.record(z.string(), z.object({
		amount: z.number(), 
		averageCost: z.number() 
	}))
});

const botSchema = z.object({
	id: z.string(),
	personality: z.string().optional(),
	targetCoin: z.string(),
	parameters: z.record(z.string(), z.any()),
	lastAction: z.date(),
	enabled: z.boolean(),
	portfolio: z.object({
		cash: z.number(),
		holdings: z.record(z.string(), z.object({
			amount: z.number(),
			averageCost: z.number()
		}))
	})
});


const coinsDB = new DBMap('coins', coinSchema, null);
const ordersDB = new DBMap('orders', orderSchema, null);
const tradesDB = new DBMap('trades', tradeSchema, null);
const portfoliosDB = new DBMap('portfolios', portfolioSchema, null);
const botsDB = new DBMap('bots', botSchema, null);


const priceHistorySchema = z.object({
	coinId: z.string(),
	timeframe: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']),  
	timestamp: z.date(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number()
});

const priceHistoryDB = new DBMap('priceHistory', priceHistorySchema, null);

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

class PriceHistoryManager {
	public priceData: Map<string, Array<{price: number, timestamp: Date, volume: number}>> = new Map(); 
	
	constructor() {
		
	}

	async recordPrice(coinId: string, price: number, volume: number = 0): Promise<void> {
		const timestamp = new Date();
		
		
		if (!this.priceData.has(coinId)) {
			this.priceData.set(coinId, []);
		}
		
		const data = this.priceData.get(coinId)!;
		data.push({ price, timestamp, volume });
		
		
		if (data.length > 14400) {
			data.splice(0, data.length - 14400);
		}
	}

	
	private getTimeframeInterval(timeframe: string): number {
		switch (timeframe) {
			case '1m': return 1; 
			case '5m': return 5; 
			case '15m': return 15; 
			case '30m': return 30; 
			case '1h': return 60; 
			case '4h': return 240; 
			case '1d': return 1440; 
			case '1w': return 10080; 
			default: return 1;
		}
	}

	async getPriceHistory(
		coinId: string, 
		timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w',
		limit: number = 60
	): Promise<PriceHistoryData[]> {
		try {
			const priceData = this.priceData.get(coinId);
			if (!priceData || priceData.length === 0) {
				console.log(`No price data found for ${coinId}`);
				return [];
			}

			
			limit = Math.min(limit, 100);
			
			const intervalSeconds = this.getTimeframeInterval(timeframe);
			const now = new Date();
			const results: PriceHistoryData[] = [];

			
			const sortedData = [...priceData].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
			
			
			const latestDataTime = sortedData.length > 0 ? sortedData[0].timestamp : now;

			
			for (let i = 0; i < limit; i++) {
				const endTime = new Date(latestDataTime.getTime() - (i * intervalSeconds * 1000));
				const startTime = new Date(endTime.getTime() - (intervalSeconds * 1000));

				
				const intervalPrices = sortedData.filter(p => 
					p.timestamp >= startTime && p.timestamp < endTime
				);

				if (intervalPrices.length > 0) {
					
					intervalPrices.reverse();

					const prices = intervalPrices.map(p => p.price);
					const volumes = intervalPrices.map(p => p.volume);
					
					
					const open = prices[0] || 1.0;
					const close = prices[prices.length - 1] || open;
					const high = prices.length > 0 ? Math.max(...prices) : open;
					const low = prices.length > 0 ? Math.min(...prices) : open;
					const volume = volumes.reduce((sum, v) => sum + (v || 0), 0);

					results.unshift({ 
						coinId,
						timeframe: timeframe as any,
						timestamp: startTime,
						open,
						high,
						low,
						close,
						volume
					});
				} else {
					
					let fallbackPrice = 1.0;
					if (sortedData.length > 0) {
						
						const closestData = sortedData.find(p => p.timestamp <= endTime);
						fallbackPrice = closestData ? closestData.price : sortedData[sortedData.length - 1].price;
					}
					
					results.unshift({
						coinId,
						timeframe: timeframe as any,
						timestamp: startTime,
						open: fallbackPrice,
						high: fallbackPrice,
						low: fallbackPrice,
						close: fallbackPrice,
						volume: 0
					});
				}
			}

			console.log(`Generated ${results.length} ${timeframe} candles for ${coinId}`);
			return results;
		} catch (error) {
			console.error('Error fetching price history:', error);
			return [];
		}
	}
}

function generateToken(): string {
	return crypto.randomBytes(32).toString('hex');
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

class Coin {
	public id: string;
	public name: string;
	public price: number;
	public baseVol: number;
	public liquidity: number;
	public lastUpdated: Date;

	constructor(data: CoinData) {
		this.id = data.id;
		this.name = data.name;
		this.price = data.price;
		this.baseVol = data.baseVol;
		this.liquidity = data.liquidity;
		this.lastUpdated = data.lastUpdated;
	}

	applyPriceImpact(tradeVolume: number, side: 'buy' | 'sell', priceHistoryManager?: PriceHistoryManager): number {
		if (!Number.isFinite(tradeVolume) || tradeVolume <= 0) return this.price;
		
		
		const liquidityDepth = this.liquidity;
		const baseImpact = 0.05; 
		
		
		const relativeSize = tradeVolume / liquidityDepth;
		
		
		let impactMultiplier: number;
		if (relativeSize < 0.01) {
			
			impactMultiplier = relativeSize * 0.5;
		} else if (relativeSize < 0.1) {
			
			impactMultiplier = relativeSize;
		} else {
			
			impactMultiplier = 0.1 + Math.pow(relativeSize - 0.1, 1.3);
		}
		
		
		const impact = baseImpact * impactMultiplier * (side === 'buy' ? 1 : -1);
		const multiplier = Math.exp(impact);
		const newPrice = this.price * multiplier;
		
		
		if (Number.isFinite(newPrice) && newPrice > 0 && newPrice < 1e12) {
			this.price = newPrice;
			
			
			const liquidityConsumption = Math.min(tradeVolume * 0.1, liquidityDepth * 0.05);
			this.liquidity = Math.max(liquidityDepth * 0.5, liquidityDepth - liquidityConsumption);
			
			
			setTimeout(() => {
				this.liquidity = Math.min(liquidityDepth, this.liquidity + liquidityConsumption * 0.1);
			}, 5000);
		}
		
		this.lastUpdated = new Date();
		
		
		if (priceHistoryManager) {
			priceHistoryManager.recordPrice(this.id, this.price, tradeVolume);
		}
		
		return this.price;
	}

	addVolatility(priceHistoryManager?: PriceHistoryManager): void {
		
		const dt = 0.001; 
		
		
		const u1 = Math.random();
		const u2 = Math.random();
		const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
		
		
		const drift = -0.0001; 
		const diffusion = this.baseVol * Math.sqrt(dt) * z0;
		const baseChange = Math.exp((drift - 0.5 * this.baseVol * this.baseVol) * dt + diffusion);
		
		
		let jumpComponent = 1.0;
		if (Math.random() < 0.002) {
			
			const jumpIntensity = this.baseVol * 5; 
			const jumpDirection = Math.random() < 0.5 ? -1 : 1;
			jumpComponent = 1 + (jumpDirection * jumpIntensity * Math.random());
		}
		
		
		let newPrice = this.price * baseChange * jumpComponent;
		
		
		const longTermPrice = 1.0; 
		const reversionStrength = 0.0001;
		const reversionFactor = 1 - reversionStrength * Math.log(newPrice / longTermPrice);
		newPrice *= reversionFactor;
		
		
		if (Number.isFinite(newPrice) && newPrice > 0.00001 && newPrice < 1e6) {
			this.price = newPrice;
		} else {
			
			this.price = Math.max(0.001, Math.min(1000, this.price));
		}
		
		this.lastUpdated = new Date();
		
		
		if (priceHistoryManager) {
			
			const priceChange = Math.abs(baseChange * jumpComponent - 1);
			const estimatedVolume = priceChange * this.liquidity * 0.1;
			priceHistoryManager.recordPrice(this.id, this.price, estimatedVolume);
		}
	}

	async save(): Promise<void> {
		
		const validatedData = {
			id: this.id,
			name: this.name,
			price: Number.isFinite(this.price) && this.price > 0 && this.price < 1e12 ? this.price : 1.0,
			baseVol: Number.isFinite(this.baseVol) && this.baseVol > 0 && this.baseVol < 1 ? this.baseVol : 0.02,
			liquidity: Number.isFinite(this.liquidity) && this.liquidity > 0 && this.liquidity < 1e9 ? this.liquidity : 1000,
			lastUpdated: this.lastUpdated
		};

		
		this.price = validatedData.price;
		this.baseVol = validatedData.baseVol;
		this.liquidity = validatedData.liquidity;

		await coinsDB.set(this.id, validatedData);
	}

	static async load(id: string): Promise<Coin | null> {
		const data = await coinsDB.get(id);
		return data ? new Coin(data) : null;
	}

	static async loadAll(): Promise<Coin[]> {
		const keys = await coinsDB.allKeys();
		const coins: Coin[] = [];
		for (const key of keys) {
			const data = await coinsDB.get(key);
			if (data) {
				coins.push(new Coin(data));
			}
		}
		return coins;
	}
}


type BotPersonality = 
	| 'momentum-maxine' | 'mean-revertor-marvin' | 'whale-wendy' | 'pattern-prophet'
	| 'stoploss-steve' | 'copycat-carla' | 'contrarian-carl' | 'fomo-fiona'
	| 'longterm-larry' | 'ape-alex' | 'quant-quinn' | 'doom-daniel'
	| 'lazy-lisa' | 'arbitrage-arnie' | 'influencer-izzy'
	| 'scalper-sally' | 'daytrader-danny' | 'swingtrader-sam' | 'news-nancy'
	| 'technical-ted' | 'fundamental-frank' | 'random-rick' | 'correlation-cora'
	| 'volatility-victor' | 'liquidity-lucy' | 'breakout-bob' | 'support-sarah'
	| 'marketmaker-mike' | 'sniper-steve' | 'panic-pete' | 'patient-paul'
	| 'trendfollower-tim' | 'meanreversionmary' | 'fibonacci-fran' | 'volume-vince';

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

const PERSONALITY_TRAITS: Record<BotPersonality, PersonalityTraits> = {
	'momentum-maxine': {
		name: 'Momentum Maxine',
		description: 'it went up yesterday so it\'ll go up forever, right?',
		tradingStyle: 'momentum-chaser',
		aggressiveness: 7,
		frequency: 3,
		volatilityLove: 9,
		herdMentality: 8
	},
	'mean-revertor-marvin': {
		name: 'Mean Revertor Marvin',
		description: 'everything returns to average… except my portfolio.',
		tradingStyle: 'contrarian',
		aggressiveness: 8,
		frequency: 2,
		volatilityLove: 4,
		herdMentality: 2
	},
	'whale-wendy': {
		name: 'Whale Wendy',
		description: 'i woke up and chose financial destruction.',
		tradingStyle: 'whale',
		aggressiveness: 10,
		frequency: 0.5,
		volatilityLove: 10,
		herdMentality: 1
	},
	'pattern-prophet': {
		name: 'Pattern Prophet',
		description: 'i see triangles in the candles.',
		tradingStyle: 'technical',
		aggressiveness: 4,
		frequency: 5,
		volatilityLove: 6,
		herdMentality: 3
	},
	'stoploss-steve': {
		name: 'Stoploss Steve',
		description: 'i panic instantly.',
		tradingStyle: 'panic',
		aggressiveness: 6,
		frequency: 4,
		volatilityLove: 2,
		herdMentality: 7
	},
	'copycat-carla': {
		name: 'Copycat Carla',
		description: 'if everyone\'s buying, so am i!',
		tradingStyle: 'follower',
		aggressiveness: 5,
		frequency: 4,
		volatilityLove: 5,
		herdMentality: 10
	},
	'contrarian-carl': {
		name: 'Contrarian Carl',
		description: 'if everyone\'s buying, i\'m selling.',
		tradingStyle: 'contrarian',
		aggressiveness: 6,
		frequency: 3,
		volatilityLove: 7,
		herdMentality: 1
	},
	'fomo-fiona': {
		name: 'FOMO Fiona',
		description: 'it\'s pumping, I can\'t miss out!',
		tradingStyle: 'fomo',
		aggressiveness: 9,
		frequency: 2,
		volatilityLove: 10,
		herdMentality: 9
	},
	'longterm-larry': {
		name: 'Long-Term Larry',
		description: 'i believe in fundamentals. (there are none.)',
		tradingStyle: 'hodler',
		aggressiveness: 3,
		frequency: 0.2,
		volatilityLove: 3,
		herdMentality: 2
	},
	'ape-alex': {
		name: 'Ape Alex',
		description: 'ape strong together.',
		tradingStyle: 'herd',
		aggressiveness: 8,
		frequency: 3,
		volatilityLove: 8,
		herdMentality: 10
	},
	'quant-quinn': {
		name: 'Quant Quinn',
		description: 'trust the math, not emotions.',
		tradingStyle: 'quant',
		aggressiveness: 4,
		frequency: 1,
		volatilityLove: 3,
		herdMentality: 1
	},
	'doom-daniel': {
		name: 'Doom Daniel',
		description: 'the crash is *always* coming.',
		tradingStyle: 'bear',
		aggressiveness: 5,
		frequency: 2,
		volatilityLove: 8,
		herdMentality: 2
	},
	'lazy-lisa': {
		name: 'Lazy Lisa',
		description: 'i\'ll trade later…',
		tradingStyle: 'lazy',
		aggressiveness: 2,
		frequency: 0.3,
		volatilityLove: 1,
		herdMentality: 3
	},
	'arbitrage-arnie': {
		name: 'Arbitrage Arnie',
		description: 'spot inefficiencies, badly.',
		tradingStyle: 'arbitrage',
		aggressiveness: 6,
		frequency: 4,
		volatilityLove: 5,
		herdMentality: 1
	},
	'influencer-izzy': {
		name: 'Influencer Izzy',
		description: 'this coin\'s going to the moon! (because I said so)',
		tradingStyle: 'influencer',
		aggressiveness: 8,
		frequency: 1,
		volatilityLove: 9,
		herdMentality: 5,
		announcement: true
	},
	'scalper-sally': {
		name: 'Scalper Sally',
		description: 'tiny profits, massive frequency. death by a thousand cuts.',
		tradingStyle: 'scalping',
		aggressiveness: 3,
		frequency: 10,
		volatilityLove: 8,
		herdMentality: 2
	},
	'daytrader-danny': {
		name: 'Day Trader Danny',
		description: 'in at 9am, out by 5pm. no overnight risk!',
		tradingStyle: 'daytrading',
		aggressiveness: 6,
		frequency: 5,
		volatilityLove: 7,
		herdMentality: 4
	},
	'swingtrader-sam': {
		name: 'Swing Trader Sam',
		description: 'hold for days, not minutes. patience is virtue.',
		tradingStyle: 'swing',
		aggressiveness: 4,
		frequency: 0.5,
		volatilityLove: 5,
		herdMentality: 3
	},
	'news-nancy': {
		name: 'News Nancy',
		description: 'trades on every headline and rumor.',
		tradingStyle: 'news',
		aggressiveness: 7,
		frequency: 1,
		volatilityLove: 9,
		herdMentality: 6
	},
	'technical-ted': {
		name: 'Technical Ted',
		description: 'RSI, MACD, Bollinger Bands... has indicators for days.',
		tradingStyle: 'technical',
		aggressiveness: 5,
		frequency: 3,
		volatilityLove: 6,
		herdMentality: 2
	},
	'fundamental-frank': {
		name: 'Fundamental Frank',
		description: 'analyzing tokenomics of meme coins. good luck.',
		tradingStyle: 'fundamental',
		aggressiveness: 3,
		frequency: 0.3,
		volatilityLove: 2,
		herdMentality: 1
	},
	'random-rick': {
		name: 'Random Rick',
		description: 'coin flips and dice rolls. surprisingly effective.',
		tradingStyle: 'random',
		aggressiveness: 5,
		frequency: 2,
		volatilityLove: 10,
		herdMentality: 5
	},
	'correlation-cora': {
		name: 'Correlation Cora',
		description: 'if PIZZA goes up, TACO must follow... right?',
		tradingStyle: 'correlation',
		aggressiveness: 4,
		frequency: 2,
		volatilityLove: 4,
		herdMentality: 3
	},
	'volatility-victor': {
		name: 'Volatility Victor',
		description: 'loves chaos, hates boring sideways action.',
		tradingStyle: 'volatility',
		aggressiveness: 8,
		frequency: 4,
		volatilityLove: 10,
		herdMentality: 3
	},
	'liquidity-lucy': {
		name: 'Liquidity Lucy',
		description: 'only trades where there\'s volume. avoids thin markets.',
		tradingStyle: 'liquidity',
		aggressiveness: 3,
		frequency: 1,
		volatilityLove: 3,
		herdMentality: 4
	},
	'breakout-bob': {
		name: 'Breakout Bob',
		description: 'waiting for that explosive move above resistance.',
		tradingStyle: 'breakout',
		aggressiveness: 7,
		frequency: 1,
		volatilityLove: 9,
		herdMentality: 5
	},
	'support-sarah': {
		name: 'Support Sarah',
		description: 'buys the dip at every support level.',
		tradingStyle: 'support',
		aggressiveness: 6,
		frequency: 2,
		volatilityLove: 4,
		herdMentality: 2
	},
	'marketmaker-mike': {
		name: 'Market Maker Mike',
		description: 'provides liquidity for tiny spreads. the real MVP.',
		tradingStyle: 'market-making',
		aggressiveness: 2,
		frequency: 8,
		volatilityLove: 1,
		herdMentality: 1
	},
	'sniper-steve': {
		name: 'Sniper Steve',
		description: 'waits for the perfect setup. then strikes hard.',
		tradingStyle: 'sniper',
		aggressiveness: 9,
		frequency: 0.1,
		volatilityLove: 6,
		herdMentality: 1
	},
	'panic-pete': {
		name: 'Panic Pete',
		description: 'sells at the first sign of trouble. paper hands incarnate.',
		tradingStyle: 'panic',
		aggressiveness: 8,
		frequency: 6,
		volatilityLove: 2,
		herdMentality: 9
	},
	'patient-paul': {
		name: 'Patient Paul',
		description: 'waits months for the right opportunity.',
		tradingStyle: 'patient',
		aggressiveness: 2,
		frequency: 0.05,
		volatilityLove: 1,
		herdMentality: 1
	},
	'trendfollower-tim': {
		name: 'Trend Follower Tim',
		description: 'the trend is your friend... until it ends.',
		tradingStyle: 'trend',
		aggressiveness: 6,
		frequency: 2,
		volatilityLove: 7,
		herdMentality: 7
	},
	'meanreversionmary': {
		name: 'Mean Reversion Mary',
		description: 'everything that goes up must come down.',
		tradingStyle: 'mean-reversion',
		aggressiveness: 5,
		frequency: 3,
		volatilityLove: 5,
		herdMentality: 2
	},
	'fibonacci-fran': {
		name: 'Fibonacci Fran',
		description: 'sees golden ratios in every price movement.',
		tradingStyle: 'fibonacci',
		aggressiveness: 4,
		frequency: 1,
		volatilityLove: 6,
		herdMentality: 2
	},
	'volume-vince': {
		name: 'Volume Vince',
		description: 'price follows volume. volume never lies.',
		tradingStyle: 'volume',
		aggressiveness: 5,
		frequency: 4,
		volatilityLove: 8,
		herdMentality: 4
	}
};

class Bot {
	public id: string;
	public personality: BotPersonality;
	public traits: PersonalityTraits;
	public targetCoin: string; 
	public watchedCoins: string[]; 
	public parameters: Record<string, any>;
	public lastAction: Date;
	public enabled: boolean;
	public portfolio: {
		cash: number;
		holdings: Record<string, {
			amount: number;
			averageCost: number;
		}>;
	};

	constructor(data: BotData) {
		this.id = data.id;
		this.personality = data.personality || this.getRandomPersonality();
		this.traits = PERSONALITY_TRAITS[this.personality];
		this.targetCoin = data.targetCoin;
		this.parameters = data.parameters;
		this.lastAction = data.lastAction;
		this.enabled = data.enabled;
		this.portfolio = data.portfolio;
		
		
		
		this.watchedCoins = data.watchedCoins || [data.targetCoin];
	}

	private getRandomPersonality(): BotPersonality {
		const personalities = Object.keys(PERSONALITY_TRAITS) as BotPersonality[];
		return personalities[Math.floor(Math.random() * personalities.length)];
	}

	async tick(marketState: MarketEngine): Promise<void> {
		if (!this.enabled) return;

		const now = new Date();
		const timeSinceLastAction = now.getTime() - this.lastAction.getTime();

		
		const baseInterval = 60000 / Math.max(0.1, this.traits.frequency); 
		const jitter = baseInterval * (0.5 + Math.random()); 
		const minInterval = baseInterval + jitter;

		if (timeSinceLastAction < minInterval) return;

		try {
			await this.tradeWithPersonality(marketState);
			this.lastAction = now;
		} catch (error) {
			console.error(`Bot ${this.id} (${this.traits.name}) error:`, error);
		}
	}

	private async tradeWithPersonality(marketState: MarketEngine): Promise<void> {
		
		this.updateMarketHistory(marketState);

		
		const newFocus = this.shouldSwitchFocus(marketState);
		if (newFocus) {
			this.targetCoin = newFocus;
		}

		switch (this.personality) {
			case 'momentum-maxine':
				await this.momentumMaxineTrade(marketState);
				break;
			case 'mean-revertor-marvin':
				await this.meanRevertorMarvinTrade(marketState);
				break;
			case 'whale-wendy':
				await this.whaleWendyTrade(marketState);
				break;
			case 'pattern-prophet':
				await this.patternProphetTrade(marketState);
				break;
			case 'stoploss-steve':
				await this.stoplossSteveTrade(marketState);
				break;
			case 'copycat-carla':
				await this.copycatCarlaTrade(marketState);
				break;
			case 'contrarian-carl':
				await this.contrarianCarlTrade(marketState);
				break;
			case 'fomo-fiona':
				await this.fomoFionaTrade(marketState);
				break;
			case 'longterm-larry':
				await this.longtermLarryTrade(marketState);
				break;
			case 'ape-alex':
				await this.apeAlexTrade(marketState);
				break;
			case 'quant-quinn':
				await this.quantQuinnTrade(marketState);
				break;
			case 'doom-daniel':
				await this.doomDanielTrade(marketState);
				break;
			case 'lazy-lisa':
				await this.lazyLisaTrade(marketState);
				break;
			case 'arbitrage-arnie':
				await this.arbitrageArnieTrade(marketState);
				break;
			case 'influencer-izzy':
				await this.influencerIzzyTrade(marketState);
				break;
			case 'scalper-sally':
				await this.scalperSallyTrade(marketState);
				break;
			case 'daytrader-danny':
				await this.daytraderDannyTrade(marketState);
				break;
			case 'swingtrader-sam':
				await this.swingtraderSamTrade(marketState);
				break;
			case 'news-nancy':
				await this.newsNancyTrade(marketState);
				break;
			case 'technical-ted':
				await this.technicalTedTrade(marketState);
				break;
			case 'fundamental-frank':
				await this.fundamentalFrankTrade(marketState);
				break;
			case 'random-rick':
				await this.randomRickTrade(marketState);
				break;
			case 'correlation-cora':
				await this.correlationCoraTrade(marketState);
				break;
			case 'volatility-victor':
				await this.volatilityVictorTrade(marketState);
				break;
			case 'liquidity-lucy':
				await this.liquidityLucyTrade(marketState);
				break;
			case 'breakout-bob':
				await this.breakoutBobTrade(marketState);
				break;
			case 'support-sarah':
				await this.supportSarahTrade(marketState);
				break;
			case 'marketmaker-mike':
				await this.marketmakerMikeTrade(marketState);
				break;
			case 'sniper-steve':
				await this.sniperSteveTrade(marketState);
				break;
			case 'panic-pete':
				await this.panicPeteTrade(marketState);
				break;
			case 'patient-paul':
				await this.patientPaulTrade(marketState);
				break;
			case 'trendfollower-tim':
				await this.trendfollowerTimTrade(marketState);
				break;
			case 'meanreversionmary':
				await this.meanreversionMaryTrade(marketState);
				break;
			case 'fibonacci-fran':
				await this.fibonacciFranTrade(marketState);
				break;
			case 'volume-vince':
				await this.volumeVinceTrade(marketState);
				break;
		}
	}

	
	private async momentumMaxineTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		if (!this.parameters.priceHistory) this.parameters.priceHistory = [];
		this.parameters.priceHistory.push(coin.price);
		if (this.parameters.priceHistory.length > 10) this.parameters.priceHistory.shift();
		if (this.parameters.priceHistory.length < 3) return;

		const pctChange = this.getPriceChangePercent(coin, 10);
		const threshold = 0.5; 
		
		if (pctChange > threshold) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'aggressive'));
		} else if (pctChange < -threshold) {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'aggressive'));
		}
	}

	
	private async meanRevertorMarvinTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		if (!this.parameters.priceHistory) this.parameters.priceHistory = [];
		this.parameters.priceHistory.push(coin.price);
		if (this.parameters.priceHistory.length > 20) this.parameters.priceHistory.shift();
		if (this.parameters.priceHistory.length < 10) return;

		const movingAvg = this.getMovingAverage(50);
		const diff = (coin.price - movingAvg) / movingAvg;

		if (diff < -0.05) {
			
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'huge'));
		} else if (diff > 0.05) {
			
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'huge'));
		}
	}

	
	private async whaleWendyTrade(marketState: MarketEngine): Promise<void> {
		if (Math.random() < 0.01) { 
			const coin = marketState.getCoin(this.targetCoin);
			if (!coin) return;

			const side: 'buy' | 'sell' = Math.random() < 0.5 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'whale'));
		}
	}

	
	private async patternProphetTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		if (!this.parameters.priceHistory) this.parameters.priceHistory = [];
		this.parameters.priceHistory.push(coin.price);
		if (this.parameters.priceHistory.length > 5) this.parameters.priceHistory.shift();
		if (this.parameters.priceHistory.length < 3) return;

		const trendUp = this.isTrendUp(3);
		const trendDown = this.isTrendDown(3);

		if (trendUp) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'small'));
		} else if (trendDown) {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'small'));
		}
	}

	
	private async stoplossSteveTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		if (!this.parameters.entryPrice) this.parameters.entryPrice = coin.price;

		const pctChange = this.getPriceChangePercent(coin, 5);
		
		
		if (coin.price < this.parameters.entryPrice * 0.97) {
			const holding = this.portfolio.holdings[coin.id];
			if (holding && holding.amount > 0) {
				await this.makeTrade(marketState, coin, 'sell', holding.amount);
				this.parameters.entryPrice = coin.price; 
			}
		}

		
		if (pctChange > 2) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'small'));
			this.parameters.entryPrice = coin.price;
		}
	}

	
	private async copycatCarlaTrade(marketState: MarketEngine): Promise<void> {
		
		const bestCoin = this.getBestPerformingCoin(marketState);
		if (!bestCoin) return;

		const bestHistory = this.parameters.marketHistory?.[bestCoin.id] || [];
		if (bestHistory.length < 5) return;

		
		const recentTrend = bestHistory.slice(-3);
		const isUptrend = recentTrend.every((price: number, i: number) => i === 0 || price >= recentTrend[i - 1]);
		const isDowntrend = recentTrend.every((price: number, i: number) => i === 0 || price <= recentTrend[i - 1]);

		
		if (isUptrend && Math.random() < 0.4) {
			
			const targetCoin = marketState.getCoin(this.targetCoin);
			if (targetCoin) {
				await this.makeTrade(marketState, targetCoin, 'buy', this.getTradeSize(targetCoin, 'small'));
			}
		} else if (isDowntrend && Math.random() < 0.3) {
			
			const targetCoin = marketState.getCoin(this.targetCoin);
			if (targetCoin && this.portfolio.holdings[this.targetCoin]?.amount > 0) {
				await this.makeTrade(marketState, targetCoin, 'sell', this.getTradeSize(targetCoin, 'small'));
			}
		} else if (Math.random() < 0.2) {
			
			if (this.portfolio.cash > bestCoin.price * 5) {
				await this.makeTrade(marketState, bestCoin, 'buy', this.getTradeSize(bestCoin, 'small'));
			}
		}
	}

	
	private async contrarianCarlTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		
		const pctChange = this.getPriceChangePercent(coin, 10);
		
		if (pctChange > 3) {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'moderate'));
		} else if (pctChange < -3) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		}
	}

	
	private async fomoFionaTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const pctChange = this.getPriceChangePercent(coin, 5);
		
		
		if (pctChange > 10) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'aggressive'));
			this.parameters.fomoEntry = coin.price;
		}

		
		if (this.parameters.fomoEntry && coin.price < this.parameters.fomoEntry * 0.95) {
			const holding = this.portfolio.holdings[coin.id];
			if (holding && holding.amount > 0) {
				await this.makeTrade(marketState, coin, 'sell', holding.amount);
				delete this.parameters.fomoEntry;
			}
		}
	}

	
	private async longtermLarryTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		if (!this.parameters.avgBuyPrice) this.parameters.avgBuyPrice = coin.price;

		const pctChange = this.getPriceChangePercent(coin, 100);
		
		
		if (pctChange < -10) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'aggressive'));
		}

		
		if (coin.price > this.parameters.avgBuyPrice * 2) {
			const holding = this.portfolio.holdings[coin.id];
			if (holding && holding.amount > 0) {
				await this.makeTrade(marketState, coin, 'sell', holding.amount * 0.5);
			}
		}
	}

	
	private async apeAlexTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		
		if (Math.random() < 0.3) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'aggressive'));
		}
	}

	
	private async quantQuinnTrade(marketState: MarketEngine): Promise<void> {
		
		const coinAnalysis: Array<{ coin: Coin; signal: number; strength: number }> = [];

		for (const coinId of this.watchedCoins) {
			const coin = marketState.getCoin(coinId);
			if (!coin) continue;

			const history = this.parameters.marketHistory?.[coinId] || [];
			if (history.length < 20) continue;

			
			const maFast = history.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
			const maSlow = history.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
			const rsi = this.calculateRSI(history);
			const volatility = this.calculateVolatility(history);

			
			let signal = 0;
			let strength = 0;

			
			if (maFast > maSlow) signal += 0.4;
			else signal -= 0.4;

			
			if (rsi < 30) signal += 0.3; 
			else if (rsi > 70) signal -= 0.3; 

			
			signal += (volatility - 0.02) * 5; 

			strength = Math.abs(signal);
			coinAnalysis.push({ coin, signal, strength });
		}

		
		coinAnalysis.sort((a, b) => b.strength - a.strength);

		for (let i = 0; i < Math.min(2, coinAnalysis.length); i++) {
			const analysis = coinAnalysis[i];
			if (analysis.strength < 0.5) break; 

			if (analysis.signal > 0.5) {
				
				await this.makeTrade(marketState, analysis.coin, 'buy', this.getTradeSize(analysis.coin, 'moderate'));
			} else if (analysis.signal < -0.5 && this.portfolio.holdings[analysis.coin.id]?.amount > 0) {
				
				await this.makeTrade(marketState, analysis.coin, 'sell', this.getTradeSize(analysis.coin, 'moderate'));
			}
		}
	}

	private calculateRSI(prices: number[]): number {
		if (prices.length < 14) return 50;
		
		let gains = 0, losses = 0;
		for (let i = 1; i < Math.min(15, prices.length); i++) {
			const change = prices[i] - prices[i - 1];
			if (change > 0) gains += change;
			else losses -= change;
		}
		
		const avgGain = gains / 14;
		const avgLoss = losses / 14;
		const rs = avgGain / (avgLoss || 0.001);
		return 100 - (100 / (1 + rs));
	}

	private calculateVolatility(prices: number[]): number {
		if (prices.length < 10) return 0.02;
		
		const returns: number[] = [];
		for (let i = 1; i < prices.length; i++) {
			returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
		}
		
		const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
		const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
		return Math.sqrt(variance);
	}

	
	private async doomDanielTrade(marketState: MarketEngine): Promise<void> {
		
		const marketSentiment = this.getMarketSentiment(marketState);
		
		
		if (marketSentiment === 'bullish') {
			
			for (const coinId of this.watchedCoins) {
				const coin = marketState.getCoin(coinId);
				if (coin && this.portfolio.holdings[coinId]?.amount > 0) {
					await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'moderate'));
				}
			}
		} else if (marketSentiment === 'bearish') {
			
			if (Math.random() < 0.3) {
				
				const worstCoin = this.getWorstPerformingCoin(marketState);
				if (worstCoin) {
					await this.makeTrade(marketState, worstCoin, 'buy', this.getTradeSize(worstCoin, 'small'));
				}
			} else {
				
				const coin = marketState.getCoin(this.targetCoin);
				if (coin) {
					await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'tiny'));
				}
			}
		}
	}

	
	private async lazyLisaTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		
		if (Math.random() < 0.05) {
			const side: 'buy' | 'sell' = Math.random() < 0.5 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'tiny'));
		}
	}

	
	private async arbitrageArnieTrade(marketState: MarketEngine): Promise<void> {
		
		let bestBuy: { coin: Coin; score: number } | null = null;
		let bestSell: { coin: Coin; score: number } | null = null;

		for (const coinId of this.watchedCoins) {
			const coin = marketState.getCoin(coinId);
			if (!coin) continue;

			const priceHistory = this.parameters.marketHistory?.[coinId] || [];
			if (priceHistory.length < 10) continue;

			
			const recentAvg = priceHistory.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
			const longerAvg = priceHistory.slice(-10).reduce((a: number, b: number) => a + b, 0) / 10;
			const deviation = (coin.price - longerAvg) / longerAvg;

			
			if (deviation < -0.03) { 
				if (!bestBuy || Math.abs(deviation) > Math.abs(bestBuy.score)) {
					bestBuy = { coin, score: deviation };
				}
			} else if (deviation > 0.03) { 
				if (!bestSell || Math.abs(deviation) > Math.abs(bestSell.score)) {
					bestSell = { coin, score: deviation };
				}
			}
		}

		
		if (bestSell && this.portfolio.holdings[bestSell.coin.id]?.amount > 0) {
			await this.makeTrade(marketState, bestSell.coin, 'sell', this.getTradeSize(bestSell.coin, 'moderate'));
		}
		
		if (bestBuy && this.portfolio.cash > bestBuy.coin.price * 10) {
			await this.makeTrade(marketState, bestBuy.coin, 'buy', this.getTradeSize(bestBuy.coin, 'moderate'));
		}
	}

	
	private async influencerIzzyTrade(marketState: MarketEngine): Promise<void> {
		
		if (Math.random() < 0.001) {
			
			const campaign = Math.random();
			
			if (campaign < 0.3) {
				
				console.log(`🌊 ${this.traits.name}: ALTCOIN SEASON IS HERE! Time to diversify! 🌊`);
				for (const coinId of this.watchedCoins) {
					if (coinId !== 'RCOIN') { 
						const coin = marketState.getCoin(coinId);
						if (coin && this.portfolio.cash > coin.price * 20) {
							await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'aggressive'));
						}
					}
				}
				this.parameters.campaignType = 'altseason';
			} else if (campaign < 0.6) {
				
				console.log(`💀 ${this.traits.name}: MAJOR CORRECTION INCOMING! Take profits NOW! 💀`);
				for (const coinId of this.watchedCoins) {
					const coin = marketState.getCoin(coinId);
					if (coin && this.portfolio.holdings[coinId]?.amount > 0) {
						await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'aggressive'));
					}
				}
				this.parameters.campaignType = 'crash';
			} else {
				
				const bestCoin = this.getBestPerformingCoin(marketState) || marketState.getCoin(this.targetCoin);
				if (bestCoin) {
					console.log(`🚀🚀 ${this.traits.name}: ${bestCoin.name} IS THE NEXT 100X! GET IN NOW! 🚀🚀`);
					await this.makeTrade(marketState, bestCoin, 'buy', this.getTradeSize(bestCoin, 'whale'));
					this.parameters.pumpedCoin = bestCoin.id;
					this.parameters.campaignType = 'pump';
				}
			}
			
			this.parameters.campaignActive = 5; 
		} else if (this.parameters.campaignActive > 0) {
			this.parameters.campaignActive--;
			
			
			if (this.parameters.campaignType === 'pump' && this.parameters.pumpedCoin && Math.random() < 0.3) {
				
				const coin = marketState.getCoin(this.parameters.pumpedCoin);
				if (coin && this.portfolio.holdings[this.parameters.pumpedCoin]?.amount > 0) {
					await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'whale'));
				}
			}
		}
	}

	
	private getPriceChangePercent(coin: Coin, periods: number): number {
		if (!this.parameters.priceHistory || this.parameters.priceHistory.length < periods) {
			return 0;
		}

		const history = this.parameters.priceHistory;
		const oldPrice = history[Math.max(0, history.length - periods)];
		return ((coin.price - oldPrice) / oldPrice) * 100;
	}

	private getMovingAverage(periods: number): number {
		if (!this.parameters.priceHistory || this.parameters.priceHistory.length < periods) {
			return this.parameters.priceHistory?.[0] || 0;
		}

		const slice = this.parameters.priceHistory.slice(-periods);
		return slice.reduce((sum: number, price: number) => sum + price, 0) / slice.length;
	}

	private isTrendUp(periods: number): boolean {
		if (!this.parameters.priceHistory || this.parameters.priceHistory.length < periods) {
			return false;
		}

		const recent = this.parameters.priceHistory.slice(-periods);
		for (let i = 1; i < recent.length; i++) {
			if (recent[i] <= recent[i - 1]) return false;
		}
		return true;
	}

	private isTrendDown(periods: number): boolean {
		if (!this.parameters.priceHistory || this.parameters.priceHistory.length < periods) {
			return false;
		}

		const recent = this.parameters.priceHistory.slice(-periods);
		for (let i = 1; i < recent.length; i++) {
			if (recent[i] >= recent[i - 1]) return false;
		}
		return true;
	}

	private getTradeSize(coin: Coin, intensity: 'tiny' | 'small' | 'moderate' | 'aggressive' | 'huge' | 'whale'): number {
		const aggressiveness = this.traits.aggressiveness / 10;
		const baseSize = 0.05; 
		
		let multiplier = 1;
		switch (intensity) {
			case 'tiny': multiplier = 0.1; break;
			case 'small': multiplier = 0.3; break;
			case 'moderate': multiplier = 1; break;
			case 'aggressive': multiplier = 2; break;
			case 'huge': multiplier = 5; break;
			case 'whale': multiplier = 10; break;
		}

		const portfolioSize = baseSize * aggressiveness * multiplier;
		const maxAffordable = this.portfolio.cash / coin.price * portfolioSize;
		const liquidityLimit = coin.liquidity * Math.min(0.1, portfolioSize);
		
		return Math.min(maxAffordable, liquidityLimit) * (0.5 + Math.random() * 0.5);
	}

	private async makeTrade(marketState: MarketEngine, coin: Coin, side: 'buy' | 'sell', amount: number): Promise<void> {
		if (!Number.isFinite(amount) || amount <= 0.000001) return;

		if (side === 'sell') {
			const holding = this.portfolio.holdings[coin.id];
			const availableAmount = holding ? holding.amount : 0;
			amount = Math.min(amount, availableAmount);
		}

		if (amount > 0.000001) {
			await this.executeTrade(marketState, coin, side, amount);
		}
	}

	private async executeTrade(marketState: MarketEngine, coin: Coin, side: 'buy' | 'sell', amount: number): Promise<void> {
		
		if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
			return;
		}

		
		const cost = amount * coin.price;
		if (!Number.isFinite(cost) || cost > 1e15) {
			return;
		}

		if (side === 'buy') {
			if (this.portfolio.cash < cost) return;
			
			
			this.portfolio.cash -= cost;
			const currentHolding = this.portfolio.holdings[coin.id];
			if (currentHolding) {
				
				const totalValue = (currentHolding.amount * currentHolding.averageCost) + cost;
				const totalAmount = currentHolding.amount + amount;
				this.portfolio.holdings[coin.id] = {
					amount: totalAmount,
					averageCost: totalValue / totalAmount
				};
			} else {
				
				this.portfolio.holdings[coin.id] = {
					amount: amount,
					averageCost: coin.price
				};
			}
			
			
			coin.applyPriceImpact(amount, side, marketState.priceHistoryManager);
			
		} else {
			const currentHolding = this.portfolio.holdings[coin.id];
			if (!currentHolding || currentHolding.amount < amount) return;
			
			
			this.portfolio.cash += cost;
			const remainingAmount = currentHolding.amount - amount;
			if (remainingAmount <= 0.000001) {
				delete this.portfolio.holdings[coin.id];
			} else {
				this.portfolio.holdings[coin.id] = {
					amount: remainingAmount,
					averageCost: currentHolding.averageCost
				};
			}
			
			
			coin.applyPriceImpact(amount, side, marketState.priceHistoryManager);
		}

		
		await this.save();
	}

	
	private getMarketSentiment(marketState: MarketEngine): 'bullish' | 'bearish' | 'neutral' {
		const coins = Array.from(marketState.coins.values());
		let totalChange = 0;
		let coinCount = 0;

		for (const coin of coins) {
			if (this.watchedCoins.includes(coin.id)) {
				const priceHistory = this.parameters.marketHistory?.[coin.id] || [];
				if (priceHistory.length >= 5) {
					const recentChange = (coin.price - priceHistory[priceHistory.length - 5]) / priceHistory[priceHistory.length - 5];
					totalChange += recentChange;
					coinCount++;
				}
			}
		}

		if (coinCount === 0) return 'neutral';
		const avgChange = totalChange / coinCount;

		if (avgChange > 0.02) return 'bullish';
		if (avgChange < -0.02) return 'bearish';
		return 'neutral';
	}

	private getBestPerformingCoin(marketState: MarketEngine): Coin | null {
		let bestCoin: Coin | null = null;
		let bestPerformance = -Infinity;

		for (const coinId of this.watchedCoins) {
			const coin = marketState.getCoin(coinId);
			if (!coin) continue;

			const priceHistory = this.parameters.marketHistory?.[coinId] || [];
			if (priceHistory.length >= 10) {
				const performance = (coin.price - priceHistory[priceHistory.length - 10]) / priceHistory[priceHistory.length - 10];
				if (performance > bestPerformance) {
					bestPerformance = performance;
					bestCoin = coin;
				}
			}
		}

		return bestCoin;
	}

	private getWorstPerformingCoin(marketState: MarketEngine): Coin | null {
		let worstCoin: Coin | null = null;
		let worstPerformance = Infinity;

		for (const coinId of this.watchedCoins) {
			const coin = marketState.getCoin(coinId);
			if (!coin) continue;

			const priceHistory = this.parameters.marketHistory?.[coinId] || [];
			if (priceHistory.length >= 10) {
				const performance = (coin.price - priceHistory[priceHistory.length - 10]) / priceHistory[priceHistory.length - 10];
				if (performance < worstPerformance) {
					worstPerformance = performance;
					worstCoin = coin;
				}
			}
		}

		return worstCoin;
	}

	private updateMarketHistory(marketState: MarketEngine): void {
		if (!this.parameters.marketHistory) {
			this.parameters.marketHistory = {};
		}

		for (const coinId of this.watchedCoins) {
			const coin = marketState.getCoin(coinId);
			if (!coin) continue;

			if (!this.parameters.marketHistory[coinId]) {
				this.parameters.marketHistory[coinId] = [];
			}

			this.parameters.marketHistory[coinId].push(coin.price);
			
			if (this.parameters.marketHistory[coinId].length > 100) {
				this.parameters.marketHistory[coinId].shift();
			}
		}
	}

	
	private shouldSwitchFocus(marketState: MarketEngine): string | null {
		if (Math.random() > 0.1) return null; 

		const currentCoin = marketState.getCoin(this.targetCoin);
		if (!currentCoin) return null;

		const bestCoin = this.getBestPerformingCoin(marketState);
		if (!bestCoin || bestCoin.id === this.targetCoin) return null;

		
		const currentHistory = this.parameters.marketHistory?.[this.targetCoin] || [];
		const bestHistory = this.parameters.marketHistory?.[bestCoin.id] || [];

		if (currentHistory.length >= 10 && bestHistory.length >= 10) {
			const currentPerf = (currentCoin.price - currentHistory[currentHistory.length - 10]) / currentHistory[currentHistory.length - 10];
			const bestPerf = (bestCoin.price - bestHistory[bestHistory.length - 10]) / bestHistory[bestHistory.length - 10];

			if (bestPerf - currentPerf > 0.05) { 
				return bestCoin.id;
			}
		}

		return null;
	}

	

	
	private async scalperSallyTrade(marketState: MarketEngine): Promise<void> {
		
		for (const coinId of this.watchedCoins.slice(0, 3)) { 
			const coin = marketState.getCoin(coinId);
			if (!coin) continue;

			const history = this.parameters.marketHistory?.[coinId] || [];
			if (history.length < 5) continue;

			
			const recentChange = (coin.price - history[history.length - 2]) / history[history.length - 2];
			
			if (Math.abs(recentChange) > 0.001 && Math.abs(recentChange) < 0.003) {
				
				const side: 'buy' | 'sell' = recentChange > 0 ? 'buy' : 'sell';
				await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'tiny'));
				
				
				this.parameters[`scalp_${coinId}`] = { side, entry: coin.price, timestamp: Date.now() };
			}

			
			const scalpPos = this.parameters[`scalp_${coinId}`];
			if (scalpPos && Date.now() - scalpPos.timestamp < 30000) { 
				const profitPct = scalpPos.side === 'buy' 
					? (coin.price - scalpPos.entry) / scalpPos.entry
					: (scalpPos.entry - coin.price) / scalpPos.entry;

				if (profitPct > 0.002 || profitPct < -0.001) { 
					const exitSide: 'buy' | 'sell' = scalpPos.side === 'buy' ? 'sell' : 'buy';
					await this.makeTrade(marketState, coin, exitSide, this.getTradeSize(coin, 'tiny'));
					delete this.parameters[`scalp_${coinId}`];
				}
			}
		}
	}

	
	private async daytraderDannyTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const pctChange = this.getPriceChangePercent(coin, 30);
		if (pctChange > 2) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		} else if (pctChange < -2) {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'moderate'));
		}
	}

	private async swingtraderSamTrade(marketState: MarketEngine): Promise<void> {
		if (Math.random() > 0.05) return; 

		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const longTermTrend = this.getPriceChangePercent(coin, 100);
		if (longTermTrend < -15) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'aggressive'));
		}
	}

	private async newsNancyTrade(marketState: MarketEngine): Promise<void> {
		if (Math.random() < 0.002) { 
			const coin = marketState.getCoin(this.targetCoin);
			if (!coin) return;
			const side: 'buy' | 'sell' = Math.random() < 0.5 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'aggressive'));
		}
	}

	private async technicalTedTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const history = this.parameters.marketHistory?.[this.targetCoin] || [];
		if (history.length < 50) return;

		const rsi = this.calculateRSI(history);
		if (rsi < 25) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		} else if (rsi > 75) {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'moderate'));
		}
	}

	private async fundamentalFrankTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin || Math.random() > 0.01) return;

		if (coin.liquidity > 2000 && coin.baseVol < 0.02) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		}
	}

	private async randomRickTrade(marketState: MarketEngine): Promise<void> {
		if (Math.random() < 0.1) {
			const coin = marketState.getCoin(this.targetCoin);
			if (!coin) return;
			const side: 'buy' | 'sell' = Math.random() < 0.5 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'small'));
		}
	}

	private async correlationCoraTrade(marketState: MarketEngine): Promise<void> {
		if (this.watchedCoins.length < 2) return;

		const coin1 = marketState.getCoin(this.watchedCoins[0]);
		const coin2 = marketState.getCoin(this.watchedCoins[1]);
		if (!coin1 || !coin2) return;

		const change1 = this.getPriceChangePercent(coin1, 10);
		const change2 = this.getPriceChangePercent(coin2, 10);

		if (change1 > 3 && change2 < -3) {
			await this.makeTrade(marketState, coin1, 'sell', this.getTradeSize(coin1, 'small'));
			await this.makeTrade(marketState, coin2, 'buy', this.getTradeSize(coin2, 'small'));
		}
	}

	private async volatilityVictorTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		if (coin.baseVol > 0.05) { 
			const side: 'buy' | 'sell' = Math.random() < 0.5 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'aggressive'));
		}
	}

	private async liquidityLucyTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin || coin.liquidity < 1000) return;

		const pctChange = this.getPriceChangePercent(coin, 20);
		if (Math.abs(pctChange) > 1 && Math.abs(pctChange) < 3) {
			const side: 'buy' | 'sell' = pctChange > 0 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'small'));
		}
	}

	private async breakoutBobTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const history = this.parameters.marketHistory?.[this.targetCoin] || [];
		if (history.length < 50) return;

		const recentHigh = Math.max(...history.slice(-50));
		if (coin.price > recentHigh * 1.02) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'aggressive'));
		}
	}

	private async supportSarahTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const history = this.parameters.marketHistory?.[this.targetCoin] || [];
		if (history.length < 30) return;

		const support = Math.min(...history.slice(-30));
		if (coin.price <= support * 1.01) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		}
	}

	private async marketmakerMikeTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		
		if (!this.parameters.mmLastSide || this.parameters.mmLastSide === 'sell') {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'tiny'));
			this.parameters.mmLastSide = 'buy';
		} else {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'tiny'));
			this.parameters.mmLastSide = 'sell';
		}
	}

	private async sniperSteveTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const pctChange = this.getPriceChangePercent(coin, 5);
		if (Math.abs(pctChange) > 8) { 
			const side: 'buy' | 'sell' = pctChange > 0 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'whale'));
		}
	}

	private async panicPeteTrade(marketState: MarketEngine): Promise<void> {
		for (const [coinId, holding] of Object.entries(this.portfolio.holdings)) {
			if (holding.amount > 0) {
				const coin = marketState.getCoin(coinId);
				if (!coin) continue;

				const pctChange = this.getPriceChangePercent(coin, 3);
				if (pctChange < -0.5) {
					await this.makeTrade(marketState, coin, 'sell', holding.amount);
				}
			}
		}
	}

	private async patientPaulTrade(marketState: MarketEngine): Promise<void> {
		if (Math.random() > 0.001) return; 

		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const pctChange = this.getPriceChangePercent(coin, 100);
		if (pctChange < -20) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'huge'));
		}
	}

	private async trendfollowerTimTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const shortTrend = this.getPriceChangePercent(coin, 10);
		const longTrend = this.getPriceChangePercent(coin, 50);

		if (shortTrend > 0 && longTrend > 0) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		} else if (shortTrend < 0 && longTrend < 0) {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'moderate'));
		}
	}

	private async meanreversionMaryTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const movingAvg = this.getMovingAverage(20);
		const diff = (coin.price - movingAvg) / movingAvg;

		if (diff < -0.08) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		} else if (diff > 0.08) {
			await this.makeTrade(marketState, coin, 'sell', this.getTradeSize(coin, 'moderate'));
		}
	}

	private async fibonacciFranTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const history = this.parameters.marketHistory?.[this.targetCoin] || [];
		if (history.length < 20) return;

		const high = Math.max(...history.slice(-20));
		const low = Math.min(...history.slice(-20));
		const fib618 = high - ((high - low) * 0.618);

		if (coin.price <= fib618 * 1.01 && coin.price >= fib618 * 0.99) {
			await this.makeTrade(marketState, coin, 'buy', this.getTradeSize(coin, 'moderate'));
		}
	}

	private async volumeVinceTrade(marketState: MarketEngine): Promise<void> {
		const coin = marketState.getCoin(this.targetCoin);
		if (!coin) return;

		const pctChange = this.getPriceChangePercent(coin, 5);
		if (Math.abs(pctChange) > 2) { 
			const side: 'buy' | 'sell' = pctChange > 0 ? 'buy' : 'sell';
			await this.makeTrade(marketState, coin, side, this.getTradeSize(coin, 'moderate'));
		}
	}

	async save(): Promise<void> {
		
		const marketEngine = MarketEngine.getInstance();
		if (marketEngine) {
			marketEngine.queueBotSave(this.id);
		} else {
			
			await this.forceSave();
		}
	}

	async forceSave(): Promise<void> {
		
		const validatedPortfolio = {
			cash: Number.isFinite(this.portfolio.cash) && this.portfolio.cash >= 0 && this.portfolio.cash < 1e12 ? this.portfolio.cash : 0,
			holdings: {} as Record<string, { amount: number; averageCost: number }>
		};

		
		for (const [coinId, holding] of Object.entries(this.portfolio.holdings)) {
			if (holding && Number.isFinite(holding.amount) && holding.amount > 0 && holding.amount < 1e12 && 
			    Number.isFinite(holding.averageCost) && holding.averageCost > 0) {
				validatedPortfolio.holdings[coinId] = {
					amount: holding.amount,
					averageCost: holding.averageCost
				};
			}
		}

		
		this.portfolio = validatedPortfolio;

		await botsDB.set(this.id, {
			id: this.id,
			personality: this.personality,
			targetCoin: this.targetCoin,
			watchedCoins: this.watchedCoins,
			parameters: this.parameters,
			lastAction: this.lastAction,
			enabled: this.enabled,
			portfolio: validatedPortfolio
		} as BotData);
	}

	static async load(id: string): Promise<Bot | null> {
		const data = await botsDB.get(id);
		return data ? new Bot(data as BotData) : null;
	}

	static async loadAll(): Promise<Bot[]> {
		const keys = await botsDB.allKeys();
		const bots: Bot[] = [];
		for (const key of keys) {
			const data = await botsDB.get(key);
			if (data) {
				bots.push(new Bot(data as BotData));
			}
		}
		return bots;
	}

	public getCurrentStrategy(): string {
		
		switch (this.personality) {
			case 'momentum-maxine': return 'Momentum Trading - Following price trends';
			case 'mean-revertor-marvin': return 'Mean Reversion - Betting on price corrections';
			case 'whale-wendy': return 'Whale Trading - Large position manipulation';
			case 'pattern-prophet': return 'Pattern Recognition - Technical analysis';
			case 'stoploss-steve': return 'Risk Management - Stop-loss focused';
			case 'copycat-carla': return 'Copy Trading - Following other successful trades';
			case 'contrarian-carl': return 'Contrarian - Going against the crowd';
			case 'fomo-fiona': return 'FOMO Trading - Chasing hot trends';
			case 'longterm-larry': return 'Long-term Holding - Buy and hold strategy';
			case 'ape-alex': return 'Ape Trading - High-risk, high-reward plays';
			case 'quant-quinn': return 'Quantitative Analysis - Multi-coin statistical arbitrage';
			case 'arbitrage-arnie': return 'Cross-coin Arbitrage - Price differential exploitation';
			case 'influencer-izzy': return 'Market Influence - Coordinated campaign trading';
			case 'doom-daniel': return 'Doom Trading - Betting on market crashes';
			default: return 'Unknown Strategy';
		}
	}

	public getRecentActions(limit: number = 10): Array<{action: string, timestamp: Date, details: string}> {
		
		
		const actions:any = [];
		
		
		for (const [coinId, holding] of Object.entries(this.portfolio.holdings)) {
			if (holding.amount > 0) {
				actions.push({
					action: 'HOLD',
					timestamp: this.lastAction,
					details: `Holding ${holding.amount.toFixed(6)} ${coinId} (avg cost: $${holding.averageCost.toFixed(4)})`
				});
			}
		}
		
		
		actions.push({
			action: 'FOCUS',
			timestamp: this.lastAction,
			details: `Currently targeting ${this.targetCoin}, monitoring ${this.watchedCoins.join(', ')}`
		});
		
		return actions.slice(0, limit);
	}

	get marketHistory(): Record<string, number[]> {
		return this.parameters.marketHistory || {};
	}
}


class GlobalTradeTracker {
	private recentTrades: TradeData[] = [];
	private maxTrades = 100;

	addTrade(trade: TradeData) {
		this.recentTrades.unshift(trade);
		if (this.recentTrades.length > this.maxTrades) {
			this.recentTrades = this.recentTrades.slice(0, this.maxTrades);
		}
	}

	getRecentTrades(limit: number = 50): TradeData[] {
		return this.recentTrades.slice(0, limit);
	}
}

const globalTradeTracker = new GlobalTradeTracker();


interface MarketAnalytics {
	totalMarketCap: number;
	totalVolume24h: number;
	marketSentiment: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
	topGainers: Array<{coinId: string, change24h: number, price: number}>;
	topLosers: Array<{coinId: string, change24h: number, price: number}>;
	mostActive: Array<{coinId: string, volume24h: number, trades: number}>;
	volatilityIndex: number;
	correlationMatrix: Record<string, Record<string, number>>;
}

class MarketAnalyticsEngine {
	private analytics: MarketAnalytics = {
		totalMarketCap: 0,
		totalVolume24h: 0,
		marketSentiment: 'neutral',
		topGainers: [],
		topLosers: [],
		mostActive: [],
		volatilityIndex: 0,
		correlationMatrix: {}
	};

	calculateAnalytics(coins: Map<string, Coin>, priceHistory: PriceHistoryManager, trades: TradeData[]): MarketAnalytics {
		const coinAnalytics: Array<{
			coinId: string;
			price: number;
			marketCap: number;
			volume24h: number;
			change24h: number;
			volatility: number;
			trades: number;
		}> = [];

		let totalMarketCap = 0;
		let totalVolume = 0;
		let totalVolatility = 0;

		
		for (const [coinId, coin] of coins) {
			const history = priceHistory.priceData.get(coinId) || [];
			
			
			let change24h = 0;
			if (history.length > 100) { 
				const oldPrice = history[history.length - 100].price;
				change24h = ((coin.price - oldPrice) / oldPrice) * 100;
			}

			
			const recentHistory = history.slice(-100); 
			const volume24h = recentHistory.reduce((sum, point) => sum + point.volume, 0);

			
			const estimatedSupply = coin.liquidity * 1000; 
			const marketCap = coin.price * estimatedSupply;

			
			let volatility = 0;
			if (recentHistory.length > 10) {
				const returns:any = [];
				for (let i = 1; i < recentHistory.length; i++) {
					const return_ = Math.log(recentHistory[i].price / recentHistory[i-1].price);
					returns.push(return_);
				}
				const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
				const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
				volatility = Math.sqrt(variance) * Math.sqrt(252); 
			}

			
			const recentTrades = trades.filter(t => 
				t.coinId === coinId && 
				(Date.now() - t.timestamp.getTime()) < 24 * 60 * 60 * 1000
			).length;

			coinAnalytics.push({
				coinId,
				price: coin.price,
				marketCap,
				volume24h,
				change24h,
				volatility,
				trades: recentTrades
			});

			totalMarketCap += marketCap;
			totalVolume += volume24h;
			totalVolatility += volatility;
		}

		
		const avgChange = coinAnalytics.reduce((sum, c) => sum + c.change24h, 0) / coinAnalytics.length;
		let sentiment: MarketAnalytics['marketSentiment'] = 'neutral';
		if (avgChange > 10) sentiment = 'extreme_greed';
		else if (avgChange > 3) sentiment = 'greed';
		else if (avgChange < -10) sentiment = 'extreme_fear';
		else if (avgChange < -3) sentiment = 'fear';

		
		const sorted = [...coinAnalytics].sort((a, b) => b.change24h - a.change24h);
		const topGainers = sorted.slice(0, 5).map(c => ({
			coinId: c.coinId,
			change24h: c.change24h,
			price: c.price
		}));
		const topLosers = sorted.slice(-5).reverse().map(c => ({
			coinId: c.coinId,
			change24h: c.change24h,
			price: c.price
		}));

		
		const mostActive = [...coinAnalytics]
			.sort((a, b) => b.volume24h - a.volume24h)
			.slice(0, 5)
			.map(c => ({
				coinId: c.coinId,
				volume24h: c.volume24h,
				trades: c.trades
			}));

		
		const volatilityIndex = totalVolatility / coinAnalytics.length;

		
		const correlationMatrix: Record<string, Record<string, number>> = {};
		for (const coin1 of coinAnalytics) {
			correlationMatrix[coin1.coinId] = {};
			for (const coin2 of coinAnalytics) {
				if (coin1.coinId === coin2.coinId) {
					correlationMatrix[coin1.coinId][coin2.coinId] = 1.0;
				} else {
					
					const correlation = 0.3 + (Math.random() - 0.5) * 0.6; 
					correlationMatrix[coin1.coinId][coin2.coinId] = correlation;
				}
			}
		}

		this.analytics = {
			totalMarketCap,
			totalVolume24h: totalVolume,
			marketSentiment: sentiment,
			topGainers,
			topLosers,
			mostActive,
			volatilityIndex,
			correlationMatrix
		};

		return this.analytics;
	}

	getAnalytics(): MarketAnalytics {
		return this.analytics;
	}
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

class MarketEventsSystem {
	private activeEvents: Map<string, MarketEvent> = new Map();
	private eventIdCounter = 0;

	generateRandomEvent(coins: Map<string, Coin>): MarketEvent | null {
		
		if (Math.random() > 0.0008) return null; 

		const eventTypes: MarketEvent['type'][] = [
			'flash_crash', 'pump', 'rug_pull', 'whale_dump', 'news_spike', 'correlation_break', 'liquidity_crisis'
		];
		
		const severities: MarketEvent['severity'][] = ['minor', 'moderate', 'major', 'extreme'];
		const coinIds = Array.from(coins.keys());
		
		const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
		const severity = severities[Math.floor(Math.random() * severities.length)];
		const targetCoin = coinIds[Math.floor(Math.random() * coinIds.length)];
		
		let priceMultiplier = 1.0;
		let volatilityMultiplier = 1.0;
		let duration = 30; 
		let message = '';

		switch (eventType) {
			case 'flash_crash':
				priceMultiplier = severity === 'extreme' ? 0.4 : severity === 'major' ? 0.6 : severity === 'moderate' ? 0.8 : 0.9;
				volatilityMultiplier = severity === 'extreme' ? 5.0 : severity === 'major' ? 3.0 : 2.0;
				duration = severity === 'extreme' ? 120 : severity === 'major' ? 90 : 60;
				message = `💥 FLASH CRASH: ${coins.get(targetCoin)?.name || targetCoin} plummets ${Math.round((1-priceMultiplier)*100)}% in seconds!`;
				break;
				
			case 'pump':
				priceMultiplier = severity === 'extreme' ? 3.0 : severity === 'major' ? 2.2 : severity === 'moderate' ? 1.6 : 1.3;
				volatilityMultiplier = severity === 'extreme' ? 4.0 : severity === 'major' ? 2.5 : 2.0;
				duration = severity === 'extreme' ? 180 : severity === 'major' ? 120 : 90;
				message = `🚀 MASSIVE PUMP: ${coins.get(targetCoin)?.name || targetCoin} rockets ${Math.round((priceMultiplier-1)*100)}% to the moon!`;
				break;
				
			case 'rug_pull':
				priceMultiplier = 0.1; 
				volatilityMultiplier = 10.0;
				duration = 300; 
				message = `🪤 RUG PULL ALERT: ${coins.get(targetCoin)?.name || targetCoin} developers have vanished! -90% and falling!`;
				break;
				
			case 'whale_dump':
				priceMultiplier = severity === 'extreme' ? 0.3 : severity === 'major' ? 0.5 : 0.7;
				volatilityMultiplier = 3.0;
				duration = 60;
				message = `🐋 WHALE DUMP: Massive ${coins.get(targetCoin)?.name || targetCoin} sell-off detected! Price cascading down!`;
				break;
				
			case 'news_spike':
				priceMultiplier = Math.random() < 0.5 ? 
					(severity === 'extreme' ? 2.5 : severity === 'major' ? 1.8 : 1.4) :
					(severity === 'extreme' ? 0.5 : severity === 'major' ? 0.7 : 0.85);
				volatilityMultiplier = 2.5;
				duration = 120;
				const isPositive = priceMultiplier > 1;
				message = `📰 BREAKING NEWS: ${isPositive ? 'Bullish' : 'Bearish'} news hits ${coins.get(targetCoin)?.name || targetCoin}! ${isPositive ? '+' : ''}${Math.round((priceMultiplier-1)*100)}%`;
				break;
				
			case 'correlation_break':
				
				priceMultiplier = Math.random() < 0.5 ? 1.3 : 0.8;
				volatilityMultiplier = 2.0;
				duration = 180;
				message = `⚡ CORRELATION BREAKDOWN: Market relationships breaking down, chaos ensues!`;
				break;
				
			case 'liquidity_crisis':
				priceMultiplier = 0.6;
				volatilityMultiplier = 4.0;
				duration = 240; 
				message = `💸 LIQUIDITY CRISIS: ${coins.get(targetCoin)?.name || targetCoin} liquidity evaporates, spreads widen!`;
				break;
		}

		const event: MarketEvent = {
			id: `event-${this.eventIdCounter++}`,
			type: eventType,
			targetCoin: eventType === 'correlation_break' ? undefined : targetCoin,
			severity,
			duration,
			priceMultiplier,
			volatilityMultiplier,
			message,
			timestamp: new Date(),
			active: true
		};

		this.activeEvents.set(event.id, event);
		
		
		console.log(`🎪 MARKET EVENT: ${event.message}`);
		broadcastToAllRooms(JSON.stringify({
			type: 'market_event',
			event: {
				id: event.id,
				type: event.type,
				message: event.message,
				severity: event.severity,
				targetCoin: event.targetCoin,
				timestamp: event.timestamp.toISOString()
			}
		}));

		return event;
	}

	applyEventEffects(coins: Map<string, Coin>, priceHistoryManager: PriceHistoryManager): void {
		const now = new Date();
		const expiredEvents: string[] = [];

		for (const [eventId, event] of this.activeEvents) {
			const timeElapsed = (now.getTime() - event.timestamp.getTime()) / 1000;
			
			if (timeElapsed > event.duration) {
				expiredEvents.push(eventId);
				continue;
			}

			
			if (event.targetCoin) {
				const coin = coins.get(event.targetCoin);
				if (coin) {
					this.applyEventToCoin(coin, event, timeElapsed, priceHistoryManager);
				}
			} else if (event.type === 'correlation_break') {
				
				for (const coin of coins.values()) {
					this.applyEventToCoin(coin, event, timeElapsed, priceHistoryManager, 0.3);
				}
			}
		}

		
		for (const eventId of expiredEvents) {
			const event = this.activeEvents.get(eventId);
			if (event) {
				console.log(`📅 Event concluded: ${event.message}`);
				broadcastToAllRooms(JSON.stringify({
					type: 'market_event_ended',
					eventId: event.id
				}));
			}
			this.activeEvents.delete(eventId);
		}
	}

	private applyEventToCoin(coin: Coin, event: MarketEvent, timeElapsed: number, priceHistoryManager: PriceHistoryManager, intensityMultiplier: number = 1.0): void {
		
		const timeProgress = timeElapsed / event.duration;
		const intensity = Math.max(0.1, 1.0 - timeProgress) * intensityMultiplier;

		
		if (timeElapsed < 2) { 
			const adjustedMultiplier = 1 + ((event.priceMultiplier - 1) * intensity);
			coin.price *= adjustedMultiplier;
			
			
			if (!Number.isFinite(coin.price) || coin.price <= 0 || coin.price > 1e12) {
				coin.price = Math.max(0.001, Math.min(1e6, coin.price || 1.0));
			}
		}

		
		const extraVol = (event.volatilityMultiplier - 1) * intensity * 0.1;
		const volatilityJump = (Math.random() - 0.5) * extraVol;
		const newPrice = coin.price * (1 + volatilityJump);
		
		if (Number.isFinite(newPrice) && newPrice > 0 && newPrice < 1e12) {
			coin.price = newPrice;
		}

		coin.lastUpdated = new Date();
		priceHistoryManager.recordPrice(coin.id, coin.price, Math.abs(volatilityJump) * 100);
	}

	getActiveEvents(): MarketEvent[] {
		return Array.from(this.activeEvents.values());
	}
}

export class MarketEngine {
	private static instance: MarketEngine;
	public coins: Map<string, Coin> = new Map();
	private bots: Map<string, Bot> = new Map();
	private orderIdCounter = 0;
	private tradeIdCounter = 0;
	public priceHistoryManager: PriceHistoryManager;
	public marketEvents: MarketEventsSystem;
	public analytics: MarketAnalyticsEngine;
	private botSaveQueue: Set<string> = new Set(); 
	private coinSaveQueue: Set<string> = new Set(); 

	constructor() {
		this.priceHistoryManager = new PriceHistoryManager();
		this.marketEvents = new MarketEventsSystem();
		this.analytics = new MarketAnalyticsEngine();
		MarketEngine.instance = this;
		
		
		this.startBatchSaveTimer();
	}

	public static getInstance(): MarketEngine {
		return MarketEngine.instance;
	}

	private startBatchSaveTimer(): void {
		
		setInterval(async () => {
			try {
				
				if (this.botSaveQueue.size > 0) {
					const botsToSave = Array.from(this.botSaveQueue);
					this.botSaveQueue.clear();
					
					for (const botId of botsToSave) {
						const bot = this.bots.get(botId);
						if (bot) {
							await bot.forceSave(); 
						}
					}
				}

				
				if (this.coinSaveQueue.size > 0) {
					const coinsToSave = Array.from(this.coinSaveQueue);
					this.coinSaveQueue.clear();
					
					for (const coinId of coinsToSave) {
						const coin = this.coins.get(coinId);
						if (coin) {
							await coin.save();
						}
					}
				}
			} catch (error) {
				console.error('Batch save error:', error);
			}
		}, 5000); 
	}

	public queueBotSave(botId: string): void {
		this.botSaveQueue.add(botId);
	}

	public queueCoinSave(coinId: string): void {
		this.coinSaveQueue.add(coinId);
	}

	public getAllBots(): Bot[] {
		return Array.from(this.bots.values());
	}

	async init(): Promise<void> {
		
		const coins = await Coin.loadAll();
		const bots = await Bot.loadAll();

		coins.forEach(coin => this.coins.set(coin.id, coin));
		bots.forEach(bot => this.bots.set(bot.id, bot));

		
		if (coins.length === 0) {
			await this.initializeDefaultCoins();
		}

		
		if (bots.length === 0) {
			await this.initializeDefaultBots();
		}

		
		await this.initializePriceHistory();

		
		if (coins.length === 0 && bots.length === 0) {
			console.log('🚀 Starting fast forward simulation (2 hours of market activity)...');
			await this.runFastForwardSimulation();
			console.log('✅ Fast forward simulation complete!');
		}

		
		this.startMarketTick();
	}

	private async initializeDefaultCoins(): Promise<void> {
		const defaultCoins = [
			
			{ id: 'RCOIN', name: 'RealCoin', price: 1.0, baseVol: 0.015, liquidity: 5000 },
			{ id: 'WHALE', name: 'WhaleCoin', price: 50.0, baseVol: 0.008, liquidity: 500 },
			{ id: 'STABLE', name: 'StableMatic', price: 1.001, baseVol: 0.005, liquidity: 10000 },
			
			
			{ id: 'TOAST', name: 'ToastCoin', price: 0.25, baseVol: 0.025, liquidity: 2000 },
			{ id: 'DOGE2', name: 'DogeButBetter', price: 0.08, baseVol: 0.03, liquidity: 3000 },
			{ id: 'PIZZA', name: 'PizzaCoin', price: 3.14, baseVol: 0.022, liquidity: 1800 },
			{ id: 'COFFEE', name: 'CoffeeBeans', price: 4.20, baseVol: 0.018, liquidity: 1500 },
			{ id: 'GAME', name: 'GameToken', price: 12.34, baseVol: 0.028, liquidity: 1200 },
			
			
			{ id: 'MEME', name: 'MemeCoin', price: 0.01, baseVol: 0.04, liquidity: 1000 },
			{ id: 'MOON', name: 'MoonShot', price: 0.15, baseVol: 0.06, liquidity: 800 },
			{ id: 'YOLO', name: 'YoloSwag', price: 0.69, baseVol: 0.08, liquidity: 600 },
			{ id: 'PUMP', name: 'PumpCoin', price: 0.001, baseVol: 0.12, liquidity: 400 },
			{ id: 'SHIB2', name: 'ShibKiller', price: 0.0001, baseVol: 0.15, liquidity: 2500 },
			
			
			{ id: 'CHAOS', name: 'ChaosCoin', price: 0.00001, baseVol: 0.25, liquidity: 200 },
			{ id: 'RUGME', name: 'RugPullCoin', price: 0.0042, baseVol: 0.18, liquidity: 300 },
			{ id: 'SCAM', name: 'TotallyLegit', price: 0.13, baseVol: 0.22, liquidity: 150 },
			
			
			{ id: 'GOLD', name: 'DigitalGold', price: 1337.0, baseVol: 0.012, liquidity: 100 },
			{ id: 'DIAMOND', name: 'DiamondHands', price: 420.69, baseVol: 0.016, liquidity: 250 },
			
			
			{ id: 'UTIL', name: 'UtilityCoin', price: 2.5, baseVol: 0.02, liquidity: 1600 },
			{ id: 'WORK', name: 'WorkToken', price: 8.0, baseVol: 0.024, liquidity: 1100 },
			
			
			{ id: 'ROBOT', name: 'RobotCoin', price: 25.0, baseVol: 0.035, liquidity: 900 },
			{ id: 'BRAIN', name: 'BrainChain', price: 7.77, baseVol: 0.045, liquidity: 700 },
			
			
			{ id: 'TACO', name: 'TacoCoin', price: 1.99, baseVol: 0.032, liquidity: 1300 },
			{ id: 'BURGER', name: 'BurgerToken', price: 5.99, baseVol: 0.027, liquidity: 1000 }
		];

		for (const coinData of defaultCoins) {
			const coin = new Coin({
				...coinData,
				lastUpdated: new Date()
			});
			await coin.save();
			this.coins.set(coin.id, coin);
		}
	}

	private async initializeDefaultBots(): Promise<void> {
		const coinIds = Array.from(this.coins.keys());
		
		
		const personalities = Object.keys(PERSONALITY_TRAITS) as BotPersonality[];
		const defaultBots: BotData[] = [];

		
		for (let i = 1; i <= 150; i++) {
			const personality = personalities[Math.floor(Math.random() * personalities.length)];
			const targetCoin = coinIds[Math.floor(Math.random() * coinIds.length)] || 'RCOIN';
			
			
			let watchedCoins: string[];
			if (personality === 'quant-quinn' || personality === 'arbitrage-arnie' || personality === 'influencer-izzy') {
				
				watchedCoins = [...coinIds];
			} else if (personality === 'copycat-carla' || personality === 'doom-daniel') {
				
				watchedCoins = coinIds.slice(0, Math.max(2, Math.floor(coinIds.length * 0.8)));
			} else {
				
				const numCoins = Math.max(2, Math.min(4, Math.floor(Math.random() * coinIds.length) + 1));
				watchedCoins = [targetCoin];
				while (watchedCoins.length < numCoins) {
					const randomCoin = coinIds[Math.floor(Math.random() * coinIds.length)];
					if (!watchedCoins.includes(randomCoin)) {
						watchedCoins.push(randomCoin);
					}
				}
			}
			
			
			let cash = 1000;
			if (personality === 'whale-wendy') cash = 50000 + Math.random() * 50000;
			else if (personality === 'longterm-larry') cash = 5000 + Math.random() * 10000;
			else if (personality === 'influencer-izzy') cash = 10000 + Math.random() * 20000;
			else if (personality === 'quant-quinn') cash = 3000 + Math.random() * 7000;
			else cash = 800 + Math.random() * 2000;

			defaultBots.push({
				id: `bot-${personality.replace(/-/g, '')}-${i}`,
				personality,
				targetCoin,
				watchedCoins,
				parameters: {},
				portfolio: { cash: Math.floor(cash), holdings: {} }
			} as BotData);
		}

		for (const botData of defaultBots) {
			const bot = new Bot({
				...botData,
				lastAction: new Date(Date.now() - Math.random() * 30000), 
				enabled: true
			});
			await bot.save();
			this.bots.set(bot.id, bot);
		}
	}

	private async initializePriceHistory(): Promise<void> {
		
		for (const coin of this.coins.values()) {
			
			const priceData = this.priceHistoryManager.priceData.get(coin.id);
			const needsData = !priceData || priceData.length === 0 || 
				(new Date().getTime() - priceData[priceData.length - 1].timestamp.getTime()) > 60000;
			
			if (needsData) {
				
				const now = new Date();
				const basePrice = coin.price;
				
				
				const totalSeconds = 2 * 60 * 60; 
				
				for (let i = totalSeconds; i >= 0; i--) {
					const timestamp = new Date(now.getTime() - (i * 1000)); 
					
					const variation = (Math.random() - 0.5) * 0.001; 
					const price = Math.max(0.001, basePrice * (1 + variation));
					
					await this.priceHistoryManager.recordPrice(coin.id, price, Math.random() * 0.1);
				}
				
				console.log(`Initialized price history for ${coin.id} with ${totalSeconds} data points`);
			}
		}
	}

	private startMarketTick(): void {
		let tickCount = 0;
		
		setInterval(async () => {
			try {
				tickCount++;
				
				
				this.marketEvents.generateRandomEvent(this.coins);
				
				
				this.marketEvents.applyEventEffects(this.coins, this.priceHistoryManager);
				
				
				for (const coin of this.coins.values()) {
					coin.addVolatility(this.priceHistoryManager);
					
					
					if (!Number.isFinite(coin.price) || coin.price <= 0 || coin.price > 1e12) {
						console.warn(`Invalid price for ${coin.id}: ${coin.price}, resetting to 1.0`);
						coin.price = 1.0;
					}
					
					
					this.queueCoinSave(coin.id);
				}

				
				for (const bot of this.bots.values()) {
					await bot.tick(this);
				}

				
				if (tickCount % 10 === 0) {
					const recentTrades = globalTradeTracker.getRecentTrades(1000);
					const analytics = this.analytics.calculateAnalytics(this.coins, this.priceHistoryManager, recentTrades);
					
					broadcastToAllRooms(JSON.stringify({
						type: 'market_analytics',
						analytics: analytics
					}));
				}

				
				if (tickCount % 2 === 0) { 
					const priceUpdate = {
						type: 'price_update',
						prices: Object.fromEntries(
							Array.from(this.coins.values()).map(coin => {
								
								const price = Number.isFinite(coin.price) && coin.price > 0 ? coin.price : 1.0;
								return [coin.id, {
									price: price,
									lastUpdated: coin.lastUpdated.toISOString()
								}];
							})
						),
						activeEvents: this.marketEvents.getActiveEvents().map(event => ({
							id: event.id,
							type: event.type,
							message: event.message,
							severity: event.severity,
							targetCoin: event.targetCoin,
							timestamp: event.timestamp.toISOString()
						}))
					};
					broadcastToAllRooms(JSON.stringify(priceUpdate));
				}

			} catch (error) {
				console.error('Market tick error:', error);
			}
		}, 1000); 
	}

	private async runFastForwardSimulation(): Promise<void> {
		const SIMULATION_DURATION = 2 * 60 * 60; 
		const TICKS_PER_SECOND = 100; 
		const TOTAL_TICKS = SIMULATION_DURATION * TICKS_PER_SECOND;
		const PROGRESS_INTERVAL = Math.floor(TOTAL_TICKS / 20); 
		
		console.log(`Running ${SIMULATION_DURATION / 3600}h simulation at ${TICKS_PER_SECOND}x speed (${TOTAL_TICKS} ticks)...`);
		
		let tickCount = 0;
		const startTime = Date.now();
		
		for (let tick = 0; tick < TOTAL_TICKS; tick++) {
			try {
				tickCount++;
				
				
				if (Math.random() < 0.02) { 
					this.marketEvents.generateRandomEvent(this.coins);
				}
				
				
				this.marketEvents.applyEventEffects(this.coins, this.priceHistoryManager);
				
				
				for (const coin of this.coins.values()) {
					coin.addVolatility(this.priceHistoryManager);
					
					
					if (!Number.isFinite(coin.price) || coin.price <= 0 || coin.price > 1e12) {
						coin.price = Math.max(0.001, Math.random() * 10);
					}
				}

				
				for (const bot of this.bots.values()) {
					
					const originalFreq = bot.traits.frequency;
					bot.traits.frequency = Math.max(originalFreq, 2); 
					
					await bot.tick(this);
					
					
					bot.traits.frequency = originalFreq;
				}

				
				if (tick % PROGRESS_INTERVAL === 0) {
					const progress = Math.floor((tick / TOTAL_TICKS) * 100);
					const elapsedReal = (Date.now() - startTime) / 1000;
					const simulated = tick / TICKS_PER_SECOND;
					console.log(`Fast forward progress: ${progress}% (${Math.floor(simulated / 60)}m simulated in ${elapsedReal.toFixed(1)}s real time)`);
				}

			} catch (error) {
				console.error('Fast forward tick error:', error);
			}
		}
		
		
		console.log('Saving simulation data...');
		for (const coin of this.coins.values()) {
			await coin.save();
		}
		for (const bot of this.bots.values()) {
			await bot.forceSave();
		}
		
		const totalTime = (Date.now() - startTime) / 1000;
		const tradesCount = globalTradeTracker.getRecentTrades(10000).length;
		console.log(`Simulation complete! Generated ${tradesCount} trades in ${totalTime.toFixed(1)}s real time`);
	}

	async placeOrder(orderData: OrderData): Promise<OrderData | null> {
		const coin = this.coins.get(orderData.coinId);
		if (!coin) return null;

		const order = { ...orderData };
		
		if (order.type === 'market') {
			
			const executionPrice = coin.applyPriceImpact(order.amount, order.side, this.priceHistoryManager);
			
			
			const trade: TradeData = {
				id: `trade-${this.tradeIdCounter++}`,
				coinId: order.coinId,
				price: executionPrice,
				amount: order.amount,
				buyerId: order.side === 'buy' ? order.userId : 'market',
				sellerId: order.side === 'sell' ? order.userId : 'market',
				timestamp: new Date()
			};

			
			globalTradeTracker.addTrade(trade);

			
			if (!order.userId.startsWith('bot-')) {
				
				await tradesDB.set(trade.id, trade);

				
				order.status = 'filled';
				await ordersDB.set(order.id, order);

				
				await this.updatePortfolio(order.userId, order.coinId, order.side, order.amount, executionPrice);
			} else {
				
				await this.updatePortfolio(order.userId, order.coinId, order.side, order.amount, executionPrice);
			}

			
			const tradeMessage = {
				type: 'trade',
				trade: trade
			};
			broadcastToAllRooms(JSON.stringify(tradeMessage));

			return order;
		} else {
			
			if (!order.userId.startsWith('bot-')) {
				await ordersDB.set(order.id, order);
			}
			return order;
		}
	}

	private async updatePortfolio(userId: string, coinId: string, side: 'buy' | 'sell', amount: number, price: number): Promise<void> {
		let portfolio = await portfoliosDB.get(userId);
		if (!portfolio) {
			portfolio = { cash: 10000, holdings: {} };
		}

		const cost = amount * price;

		if (side === 'buy') {
			if (portfolio.cash >= cost) {
				portfolio.cash -= cost;
				
				const currentHolding = portfolio.holdings[coinId];
				if (currentHolding) {
					
					const totalValue = (currentHolding.amount * currentHolding.averageCost) + cost;
					const totalAmount = currentHolding.amount + amount;
					
					portfolio.holdings[coinId] = {
						amount: totalAmount,
						averageCost: totalValue / totalAmount
					};
				} else {
					
					portfolio.holdings[coinId] = {
						amount: amount,
						averageCost: price
					};
				}
			}
		} else {
			const currentHolding = portfolio.holdings[coinId];
			if (currentHolding && currentHolding.amount >= amount) {
				portfolio.cash += cost;
				
				const remainingAmount = currentHolding.amount - amount;
				if (remainingAmount <= 0.000001) {
					
					delete portfolio.holdings[coinId];
				} else {
					
					portfolio.holdings[coinId] = {
						amount: remainingAmount,
						averageCost: currentHolding.averageCost
					};
				}
			}
		}

		await portfoliosDB.set(userId, portfolio);
	}

	
	getPortfolioWithGains(portfolio: any, coins: Map<string, Coin>) {
		const result = {
			cash: portfolio.cash,
			holdings: {} as Record<string, {
				amount: number;
				averageCost: number;
				currentPrice: number;
				totalValue: number;
				totalCost: number;
				unrealizedGain: number;
				unrealizedGainPercent: number;
			}>,
			totalValue: portfolio.cash,
			totalCost: portfolio.cash,
			totalUnrealizedGain: 0,
			totalUnrealizedGainPercent: 0
		};

		let totalCost = portfolio.cash;

		for (const [coinId, holding] of Object.entries(portfolio.holdings)) {
			if (holding && typeof holding === 'object' && 'amount' in holding && 'averageCost' in holding) {
				const coin = coins.get(coinId);
				const holdingTyped = holding as { amount: number; averageCost: number };
				if (coin && holdingTyped.amount > 0) {
					const currentPrice = coin.price;
					const totalValue = holdingTyped.amount * currentPrice;
					const totalHoldingCost = holdingTyped.amount * holdingTyped.averageCost;
					const unrealizedGain = totalValue - totalHoldingCost;
					const unrealizedGainPercent = totalHoldingCost > 0 ? (unrealizedGain / totalHoldingCost) * 100 : 0;

					result.holdings[coinId] = {
						amount: holdingTyped.amount,
						averageCost: holdingTyped.averageCost,
						currentPrice: currentPrice,
						totalValue: totalValue,
						totalCost: totalHoldingCost,
						unrealizedGain: unrealizedGain,
						unrealizedGainPercent: unrealizedGainPercent
					};

					result.totalValue += totalValue;
					totalCost += totalHoldingCost;
				}
			}
		}

		result.totalCost = totalCost;
		result.totalUnrealizedGain = result.totalValue - totalCost;
		result.totalUnrealizedGainPercent = totalCost > 0 ? (result.totalUnrealizedGain / totalCost) * 100 : 0;

		return result;
	}

	getCoin(coinId: string): Coin | undefined {
		return this.coins.get(coinId);
	}

	getAllCoins(): Coin[] {
		return Array.from(this.coins.values());
	}
}


const marketEngine = new MarketEngine();

function generateId(): string {
	return crypto.randomBytes(16).toString('hex');
}

wss.on('connection', (ws) => {
	console.log('New WebSocket connection');

	ws.on('message', (msg) => {
		try {
			const data = JSON.parse(msg.toString());

			
			if (data.room && typeof data.room === 'string') {
				addClientToRoom(ws, data.room);
				console.log(`Client joined room: ${data.room}`);

				
				ws.send(
					JSON.stringify({
						type: 'room_joined',
						room: data.room
					})
				);
				return;
			}

			
			const currentRoom = clientRooms.get(ws);
			if (currentRoom) {
				broadcastToRoom(currentRoom, msg.toString(), ws);
			}
		} catch (error) {
			
			const currentRoom = clientRooms.get(ws);
			if (currentRoom) {
				broadcastToRoom(currentRoom, msg.toString(), ws);
			}
		}
	});

	ws.on('close', () => {
		console.log('WebSocket connection closed');
		removeClientFromRoom(ws);
	});

	ws.on('error', (error) => {
		console.error('WebSocket error:', error);
		removeClientFromRoom(ws);
	});
});

const middlewares: Array<
	(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		next: (err?: Error) => void
	) => void | Promise<void>
> = [];
function use(
	fn: (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		next: (err?: Error) => void
	) => void | Promise<void>
) {
	middlewares.push(fn);
}

function runMiddlewares(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	done: (err?: Error) => void
) {
	let idx = 0;
	function next(err?: Error) {
		if (err) return done(err);
		const mw = middlewares[idx++];
		if (mw) {
			mw(req, res, next);
		} else {
			done();
		}
	}
	next();
}

const server = http.createServer((req, res) => {
	runMiddlewares(req, res, (err) => {
		if (err) {
			res.writeHead(500, { 'Content-Type': 'text/plain' });
			res.end('Server error');
			return;
		}
		if (useProxy) {
			proxy.web(req, res);
		} else {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not found');
		}
	});
});

function generateBackupCodes(count = 10, length = 10): string[] {
	return Array.from({ length: count }, () =>
		crypto
			.randomBytes(length)
			.toString('base64')
			.replace(/[^a-zA-Z0-9]/g, '')
			.slice(0, length)
	);
}
const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;
const internalToken = process.env.INTERNAL_API_TOKEN!;
if (!internalToken) {
	console.error('Please set the INTERNAL_API_TOKEN environment variable');
	process.exit(1);
}
async function handleInternalHTTP(req: http.IncomingMessage, res: http.ServerResponse) {
	if (!req.headers['x-internal'] || req.headers['x-internal'] !== internalToken) {
		res.writeHead(403, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Forbidden' }));
		return;
	}

	switch (req.url) {
		case '/internal/accounts/create':
			if (req.method === 'POST') {
				const chunks: any[] = [];
				req.on('data', (chunk) => chunks.push(chunk));
				await new Promise((resolve) => req.on('end', resolve));
				const body = Buffer.concat(chunks);

				try {
					const json = JSON.parse(body.toString());
					const createSchema = z.object({
						username: z
							.string()
							.min(3)
							.max(32)
							.regex(/^[a-zA-Z0-9_.-]+$/),
						displayName: z.string().min(1).max(64).optional(),
						password: z.string().min(8).max(128)
					});
					const parsed = createSchema.safeParse(json);
					if (!parsed.success) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
						return;
					}
					const { username, displayName, password } = parsed.data;

					const existing = await accountDB.get(username);
					if (existing) {
						res.writeHead(409, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Username already exists' }));
						return;
					}
					const acc = {
						displayName: displayName,
						passwordHash: hash(password)
					};
					await accountDB.set(username, acc);

					
					const initialPortfolio = {
						cash: 10000,
						holdings: {}
					};
					await portfoliosDB.set(username, initialPortfolio);

					res.writeHead(201, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true }));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid JSON' }));
					return;
				}
			}
			break;
		case '/internal/accounts/login':
			if (req.method === 'POST') {
				const chunks: any[] = [];
				req.on('data', (chunk) => chunks.push(chunk));
				await new Promise((resolve) => req.on('end', resolve));
				const body = Buffer.concat(chunks);
				try {
					const json = JSON.parse(body.toString());
					const verifySchema = z.object({
						username: z.string(),
						password: z.string(),
						totp: z.string().optional()
					});
					const parsed = verifySchema.safeParse(json);
					if (!parsed.success) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
						return;
					}
					const { username, password, totp } = parsed.data;

					const acc = await accountDB.get(username);
					if (!acc || acc.passwordHash !== hash(password)) {
						res.writeHead(401, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid username or password' }));
						return;
					}

					if (acc.totp) {
						if (!totp) {
							res.writeHead(200, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ success: true, requiresTOTP: true }));
							return;
						}
						const decryptedSecret = decryptSecret(acc.totp.secret);
						if (!verifyTOTP(totp, decryptedSecret)) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid TOTP code' }));
							return;
						}
					} else if (totp) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'TOTP not enabled for this account' }));
						return;
					}

					const token = generateToken();
					await tokenDB.set(token, {
						userId: username,
						createdAt: new Date(),
						expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
					});
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							success: true,
							account: {
								displayName: acc.displayName,
								hasTOTP: !!acc.totp,
								username,
								avatarUrl: acc.avatarUrl
							},
							token
						})
					);
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid JSON' }));
					return;
				}
			}
			break;
		case '/internal/accounts/logout':
			console.log('Received logout request');
			{
				if (req.method === 'POST') {
					console.log('Processing logout request');
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);
					try {
						const json = JSON.parse(body.toString());
						const logoutSchema = z.object({
							token: z.string()
						});
						const parsed = logoutSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { token } = parsed.data;
						await tokenDB.delete(token);
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true }));
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid JSON' }));
						return;
					}
				} else {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true }));
				}
			}
			break;

		case '/internal/accounts/edit':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);
					try {
						const json = JSON.parse(body.toString());
						const editSchema = z.object({
							token: z.string(),
							displayName: z.string().min(1).max(64).optional(),
							avatarUrl: z.preprocess(
								(val) => (val === '' ? undefined : val),
								z.string().url().optional()
							)
						});
						const parsed = editSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { token, displayName, avatarUrl } = parsed.data;
						const tokenData = await tokenDB.get(token);
						if (!tokenData || tokenData.expiresAt < new Date()) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid or expired token' }));
							await tokenDB.delete(token);
							return;
						}
						const acc = await accountDB.get(tokenData.userId);
						if (!acc) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid token' }));
							return;
						}
						if (avatarUrl) {
							acc.avatarUrl = avatarUrl;
						} else {
							delete acc.avatarUrl;
						}
						if (displayName) {
							acc.displayName = displayName;
						} else {
							delete acc.displayName;
						}
						await accountDB.set(tokenData.userId, acc);
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true }));
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid JSON' }));
						return;
					}
				}
			}
			break;
		case '/internal/accounts/verify-token':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);
					try {
						const json = JSON.parse(body.toString());
						const verifySchema = z.object({
							token: z.string()
						});
						const parsed = verifySchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { token } = parsed.data;

						const tokenData = await tokenDB.get(token);
						if (!tokenData || tokenData.expiresAt < new Date()) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid or expired token' }));
							await tokenDB.delete(token);
							return;
						}
						tokenData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
						await tokenDB.set(token, tokenData);
						const acc = await accountDB.get(tokenData.userId);
						if (!acc) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid token' }));
							return;
						}
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({
								success: true,
								account: {
									displayName: acc.displayName,
									hasTOTP: !!acc.totp,
									username: tokenData.userId,
									avatarUrl: acc.avatarUrl
								}
							})
						);
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid JSON' }));
						return;
					}
				}
			}
			break;
		case '/internal/accounts/start-totp-setup':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);

					try {
						const json = JSON.parse(body.toString());
						const startSchema = z.object({
							token: z.string(),
							password: z.string()
						});
						const parsed = startSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { token, password } = parsed.data;

						const tokenData = await tokenDB.get(token);
						if (!tokenData || tokenData.expiresAt < new Date()) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid or expired token' }));
							await tokenDB.delete(token);
							return;
						}

						const acc = await accountDB.get(tokenData.userId);
						if (!acc || acc.passwordHash !== hash(password)) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid token or password' }));
							return;
						}

						if (acc.totp) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'TOTP already set up' }));
							return;
						}

						const secret = speakeasy.generateSecret({ length: 20 });
						const backupCodes = generateBackupCodes();

						tokenData.pendingTOTP = {
							secretBase32: secret.base32,
							secretHex: secret.hex,
							otpauth_url: secret.otpauth_url || '',
							backupCodes,
							expiresAt: new Date(Date.now() + PENDING_EXPIRY_MS)
						};

						tokenData.expiresAt = new Date(Date.now() + PENDING_EXPIRY_MS);
						await tokenDB.set(token, tokenData);

						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({
								success: true,
								otpauth_url: secret.otpauth_url,
								secret: secret.base32,
								backupCodes
							})
						);
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid JSON' }));
						return;
					}
				}
			}
			break;

		case '/internal/accounts/finalize-totp-setup':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);

					try {
						const json = JSON.parse(body.toString());
						const finalizeSchema = z.object({
							token: z.string(),
							password: z.string(),
							code: z.string()
						});
						const parsed = finalizeSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { token, password, code } = parsed.data;

						const tokenData = await tokenDB.get(token);
						if (!tokenData || tokenData.expiresAt < new Date()) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid or expired token' }));
							await tokenDB.delete(token);
							return;
						}

						if (!tokenData.pendingTOTP) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'No pending TOTP setup found. Start setup first.' }));
							return;
						}

						const pending = tokenData.pendingTOTP as {
							secretBase32: string;
							secretHex: string;
							otpauth_url: string;
							backupCodes: string[];
							expiresAt: Date;
						};

						if (new Date(pending.expiresAt) < new Date()) {
							
							delete tokenData.pendingTOTP;
							await tokenDB.set(token, tokenData);
							res.writeHead(410, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Pending TOTP setup expired. Please start again.' }));
							return;
						}

						const acc = await accountDB.get(tokenData.userId);
						if (!acc || acc.passwordHash !== hash(password)) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid token or password' }));
							return;
						}

						if (acc.totp) {
							
							delete tokenData.pendingTOTP;
							await tokenDB.set(token, tokenData);
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'TOTP already set up on this account' }));
							return;
						}

						let usedBackupCode: string | null = null;
						let verified = false;

						
						verified = speakeasy.totp.verify({
							secret: pending.secretBase32,
							encoding: 'base32',
							token: code,
							window: 1 
						});

						
						if (!verified) {
							
							const matching = pending.backupCodes.find((c) => c === code);
							if (matching) {
								verified = true;
								usedBackupCode = matching;
							}
						}

						if (!verified) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid TOTP/backup code' }));
							return;
						}

						const encryptedSecret = encryptSecret(pending.secretHex);

						let storedBackupHashes: string[] = pending.backupCodes
							.filter((c) => c !== usedBackupCode)
							.map((c) => hash(c));

						acc.totp = {
							secret: encryptedSecret,
							backupCodes: storedBackupHashes
						};

						await accountDB.set(tokenData.userId, acc);
						delete tokenData.pendingTOTP;
						tokenData.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
						await tokenDB.set(token, tokenData);

						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true, message: 'TOTP setup finalized' }));
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({ error: 'Invalid JSON or server error', detail: String(error) })
						);
						return;
					}
				}
			}
			break;

		case '/internal/accounts/remove-totp':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);

					try {
						const json = JSON.parse(body.toString());
						const removeSchema = z.object({
							token: z.string(),
							password: z.string(),
							totp: z.string()
						});
						const parsed = removeSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { token, password, totp } = parsed.data;

						const tokenData = await tokenDB.get(token);
						if (!tokenData || tokenData.expiresAt < new Date()) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid or expired token' }));
							await tokenDB.delete(token);
							return;
						}

						const acc = await accountDB.get(tokenData.userId);
						if (!acc || acc.passwordHash !== hash(password)) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid token or password' }));
							return;
						}

						if (!acc.totp) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'TOTP not set up on this account' }));
							return;
						}

						const decryptedSecret = decryptSecret(acc.totp.secret);
						if (!verifyTOTP(totp, decryptedSecret)) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid TOTP code' }));
							return;
						}

						delete acc.totp;
						await accountDB.set(tokenData.userId, acc);
						tokenData.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
						await tokenDB.set(token, tokenData);

						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true, message: 'TOTP removed from account' }));
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({ error: 'Invalid JSON or server error', detail: String(error) })
						);
						return;
					}
				}
			}
			break;

		case '/internal/accounts/get-user-info':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);

					try {
						const json = JSON.parse(body.toString());
						const getUserInfoSchema = z.object({
							username: z.string()
						});
						const parsed = getUserInfoSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { username } = parsed.data;

						const acc = await accountDB.get(username);
						if (!acc) {
							res.writeHead(404, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'User not found' }));
							return;
						}

						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({
								success: true,
								user: {
									displayName: acc.displayName,
									avatarUrl: acc.avatarUrl
								}
							})
						);
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid JSON' }));
						return;
					}
				}
			}
			break;

		case '/internal/accounts/change-username':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);

					try {
						const json = JSON.parse(body.toString());
						const changeUsernameSchema = z.object({
							token: z.string(),
							newUsername: z
								.string()
								.min(3)
								.max(32)
								.regex(/^[a-zA-Z0-9_.-]+$/),
							password: z.string().min(8).max(128)
						});
						const parsed = changeUsernameSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { token, newUsername, password } = parsed.data;

						
						const tokenData = await tokenDB.get(token);
						if (!tokenData || tokenData.expiresAt < new Date()) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid or expired token' }));
							await tokenDB.delete(token);
							return;
						}

						
						const currentUsername = tokenData.userId;
						const currentAccount = await accountDB.get(currentUsername);
						if (!currentAccount) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid token' }));
							return;
						}

						
						if (currentAccount.passwordHash !== hash(password)) {
							res.writeHead(401, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid password' }));
							return;
						}

						
						const existingAccount = await accountDB.get(newUsername);
						if (existingAccount) {
							res.writeHead(409, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Username already taken' }));
							return;
						}

						
						await accountDB.set(newUsername, currentAccount);

						
						const portfolioData = await portfoliosDB.get(currentUsername);
						if (portfolioData) {
							await portfoliosDB.set(newUsername, portfolioData);
							await portfoliosDB.delete(currentUsername);
						}

						
						tokenData.userId = newUsername;
						await tokenDB.set(token, tokenData);

						
						await accountDB.delete(currentUsername);

						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(
							JSON.stringify({
								success: true,
								account: {
									username: newUsername,
									displayName: currentAccount.displayName,
									avatarUrl: currentAccount.avatarUrl,
									hasTOTP: !!currentAccount.totp
								}
							})
						);
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid JSON' }));
						return;
					}
				}
			}
			break;

		case '/internal/portfolio/get':
			{
				if (req.method === 'POST') {
					const chunks: any[] = [];
					req.on('data', (chunk) => chunks.push(chunk));
					await new Promise((resolve) => req.on('end', resolve));
					const body = Buffer.concat(chunks);

					try {
						const json = JSON.parse(body.toString());
						const getPortfolioSchema = z.object({
							userId: z.string()
						});
						const parsed = getPortfolioSchema.safeParse(json);
						if (!parsed.success) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
							return;
						}
						const { userId } = parsed.data;

						const portfolioData = await portfoliosDB.get(userId);
						if (!portfolioData) {
							
							const emptyPortfolio = {
								cash: 10000,
								holdings: {}
							};
							await portfoliosDB.set(userId, emptyPortfolio);
							
							
							const portfolioWithGains = marketEngine.getPortfolioWithGains(emptyPortfolio, marketEngine.coins);
							res.writeHead(200, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ success: true, portfolio: portfolioWithGains }));
							return;
						}

						
						const portfolioWithGains = marketEngine.getPortfolioWithGains(portfolioData, marketEngine.coins);
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true, portfolio: portfolioWithGains }));
					} catch (error) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid JSON' }));
						return;
					}
				}
			}
			break;
		default:
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not found');
			break;
	}
}

async function handleTradingAPI(req: http.IncomingMessage, res: http.ServerResponse) {
	
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Authorization required' }));
		return;
	}

	const token = authHeader.substring(7);
	const tokenData = await tokenDB.get(token);
	if (!tokenData || tokenData.expiresAt < new Date()) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Invalid or expired token' }));
		if (tokenData) await tokenDB.delete(token);
		return;
	}

	const userId = tokenData.userId;

	
	const url = new URL(req.url!, `http://${req.headers.host}`);
	const pathname = url.pathname;

	switch (pathname) {
		case '/api/trading/coins':
			if (req.method === 'GET') {
				const coins = marketEngine.getAllCoins();
				const coinData = coins.map(coin => ({
					id: coin.id,
					name: coin.name,
					price: coin.price,
					lastUpdated: coin.lastUpdated.toISOString()
				}));
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ success: true, coins: coinData }));
			}
			break;

		case '/api/trading/portfolio':
			if (req.method === 'GET') {
				let portfolio = await portfoliosDB.get(userId);
				if (!portfolio) {
					portfolio = { cash: 10000, holdings: {} };
					await portfoliosDB.set(userId, portfolio);
				}
				
				
				const portfolioWithGains = marketEngine.getPortfolioWithGains(portfolio, marketEngine.coins);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ success: true, portfolio: portfolioWithGains }));
			}
			break;

		case '/api/trading/order':
			if (req.method === 'POST') {
				const chunks: any[] = [];
				req.on('data', (chunk) => chunks.push(chunk));
				await new Promise((resolve) => req.on('end', resolve));
				const body = Buffer.concat(chunks);

				try {
					const json = JSON.parse(body.toString());
					const orderRequestSchema = z.object({
						coinId: z.string(),
						side: z.enum(['buy', 'sell']),
						type: z.enum(['market', 'limit']),
						amount: z.number().positive(),
						price: z.number().positive().optional()
					});

					const parsed = orderRequestSchema.safeParse(json);
					if (!parsed.success) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid input', details: parsed.error }));
						return;
					}

					const { coinId, side, type, amount, price } = parsed.data;

					
					const coin = marketEngine.getCoin(coinId);
					if (!coin) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Invalid coin ID' }));
						return;
					}

					
					let portfolio = await portfoliosDB.get(userId);
					if (!portfolio) {
						portfolio = { cash: 10000, holdings: {} };
						await portfoliosDB.set(userId, portfolio);
					}

					if (side === 'buy') {
						const estimatedCost = amount * coin.price;
						if (portfolio.cash < estimatedCost) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Insufficient cash' }));
							return;
						}
					} else {
						const currentHolding = portfolio.holdings[coinId];
						if (!currentHolding || currentHolding.amount < amount) {
							res.writeHead(400, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Insufficient holdings' }));
							return;
						}
					}

					
					const order: OrderData = {
						id: generateId(),
						userId,
						coinId,
						side,
						type,
						price,
						amount,
						createdAt: new Date(),
						status: 'pending'
					};

					const filledOrder = await marketEngine.placeOrder(order);
					if (filledOrder) {
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: true, order: filledOrder }));
					} else {
						res.writeHead(500, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Failed to place order' }));
					}

				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid JSON' }));
				}
			}
			break;

		case '/api/trading/trades':
			if (req.method === 'GET') {
				
				const recentTrades = globalTradeTracker.getRecentTrades(50);

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ success: true, trades: recentTrades }));
			}
			break;

		case '/api/trading/price-history':
			if (req.method === 'GET') {
				const url = new URL(req.url!, `http://${req.headers.host}`);
				const coinId = url.searchParams.get('coinId');
				const timeframe = url.searchParams.get('timeframe') as '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
				const limit = parseInt(url.searchParams.get('limit') || '100');

				if (!coinId || !timeframe) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Missing coinId or timeframe parameter' }));
					return;
				}

				const validTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
				if (!validTimeframes.includes(timeframe)) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid timeframe. Valid options: ' + validTimeframes.join(', ') }));
					return;
				}

				try {
					const priceHistory = await marketEngine.priceHistoryManager.getPriceHistory(coinId, timeframe, limit);
					const formattedHistory = priceHistory.map(candle => ({
						date: candle.timestamp.toISOString(),
						timestamp: candle.timestamp.getTime(),
						open: candle.open,
						high: candle.high,
						low: candle.low,
						close: candle.close,
						volume: candle.volume
					}));

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true, history: formattedHistory }));
				} catch (error) {
					console.error('Error fetching price history:', error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Failed to fetch price history' }));
				}
			}
			break;

		case '/api/trading/bots':
			if (req.method === 'GET') {
				try {
					const bots = marketEngine.getAllBots();
					
					
					const botDetails = bots.map(bot => ({
						id: bot.id,
						personality: bot.personality,
						traits: bot.traits,
						targetCoin: bot.targetCoin,
						watchedCoins: bot.watchedCoins,
						parameters: bot.parameters,
						lastAction: bot.lastAction,
						enabled: bot.enabled,
						portfolio: {
							cash: bot.portfolio.cash,
							holdings: bot.portfolio.holdings,
							totalValue: bot.portfolio.cash + Object.entries(bot.portfolio.holdings).reduce((sum, [coinId, holding]) => {
								const coin = marketEngine.coins.get(coinId);
								return sum + (coin ? coin.price * holding.amount : 0);
							}, 0)
						},
						marketHistory: bot.marketHistory || {},
						currentStrategy: bot.getCurrentStrategy(),
						recentActions: bot.getRecentActions(10)
					}));

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true, bots: botDetails }));
				} catch (error) {
					console.error('Error getting bot details:', error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Failed to get bot details' }));
				}
			}
			break;

		case '/api/trading/analytics':
			if (req.method === 'GET') {
				try {
					const recentTrades = globalTradeTracker.getRecentTrades(1000);
					const analytics = marketEngine.analytics.calculateAnalytics(
						marketEngine.coins, 
						marketEngine.priceHistoryManager, 
						recentTrades
					);

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true, analytics }));
				} catch (error) {
					console.error('Error getting market analytics:', error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Failed to get market analytics' }));
				}
			}
			break;

		case '/api/trading/market-events':
			if (req.method === 'GET') {
				try {
					const activeEvents = marketEngine.marketEvents.getActiveEvents();
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true, events: activeEvents }));
				} catch (error) {
					console.error('Error getting market events:', error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Failed to get market events' }));
				}
			}
			break;

		case '/api/trading/leaderboard':
			if (req.method === 'GET') {
				try {
					const url = new URL(req.url!, `http://${req.headers.host}`);
					const timeframe = url.searchParams.get('timeframe') || 'all';
					const limit = parseInt(url.searchParams.get('limit') || '50');

					
					const allUserIds = await portfoliosDB.allKeys();
					const leaderboardData:any = [];

					for (const userId of allUserIds) {
						const portfolio = await portfoliosDB.get(userId);
						if (!portfolio) continue;

						
						const account = await accountDB.get(userId);
						
						
						const portfolioWithGains = marketEngine.getPortfolioWithGains(portfolio, marketEngine.coins);
						
						
						let totalValue = portfolioWithGains.cash;
						for (const [coinId, holding] of Object.entries(portfolioWithGains.holdings)) {
							totalValue += holding.totalValue;
						}

						
						let totalGains = 0;
						let totalInvested = portfolioWithGains.cash; 
						for (const [coinId, holding] of Object.entries(portfolioWithGains.holdings)) {
							const invested = holding.amount * holding.averageCost;
							totalInvested += invested;
							totalGains += holding.totalValue - invested;
						}

						const gainPercentage = totalInvested > 0 ? (totalGains / totalInvested) * 100 : 0;

						leaderboardData.push({
							userId,
							displayName: account?.displayName || userId,
							cash: portfolioWithGains.cash,
							totalValue,
							totalGains,
							gainPercentage,
							holdings: Object.keys(portfolioWithGains.holdings).length
						});
					}

					
					leaderboardData.sort((a, b) => b.totalValue - a.totalValue);

					
					const limitedData = leaderboardData.slice(0, limit);

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ 
						success: true, 
						leaderboard: limitedData,
						timeframe,
						totalUsers: allUserIds.length
					}));
				} catch (error) {
					console.error('Error getting leaderboard:', error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Failed to get leaderboard' }));
				}
			}
			break;

		default:
			
			if (req.url?.startsWith('/api/trading/user/') && req.method === 'GET') {
				try {
					const username = decodeURIComponent(req.url.split('/api/trading/user/')[1]);
					
					
					const account = await accountDB.get(username);
					if (!account) {
						res.writeHead(404, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: false, error: 'User not found' }));
						return;
					}

					
					const portfolio = await portfoliosDB.get(username);
					if (!portfolio) {
						res.writeHead(404, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ success: false, error: 'Portfolio not found' }));
						return;
					}

					
					const portfolioWithGains = marketEngine.getPortfolioWithGains(portfolio, marketEngine.coins);
					
					
					let totalValue = portfolioWithGains.cash;
					let totalGains = 0;
					let totalInvested = portfolioWithGains.cash;
					
					for (const [coinId, holding] of Object.entries(portfolioWithGains.holdings)) {
						totalValue += holding.totalValue;
						const invested = holding.amount * holding.averageCost;
						totalInvested += invested;
						totalGains += holding.totalValue - invested;
					}

					const gainPercentage = totalInvested > 0 ? (totalGains / totalInvested) * 100 : 0;

					
					const allTradeKeys = await tradesDB.allKeys();
					const allTrades: TradeData[] = [];
					for (const key of allTradeKeys) {
						const trade = await tradesDB.get(key);
						if (trade) allTrades.push(trade);
					}
					const userTrades = allTrades
						.filter((trade: TradeData) => trade.buyerId === username || trade.sellerId === username)
						.sort((a: TradeData, b: TradeData) => b.timestamp.getTime() - a.timestamp.getTime())
						.slice(0, 50);

					const userProfile = {
						username,
						displayName: account.displayName || username,
						avatarUrl: account.avatarUrl,
						portfolio: {
							cash: portfolioWithGains.cash,
							holdings: portfolioWithGains.holdings,
							totalValue,
							totalGains,
							gainPercentage
						},
						stats: {
							totalTrades: userTrades.length,
							holdingsCount: Object.keys(portfolioWithGains.holdings).length
						},
						recentTrades: userTrades.map((trade: TradeData) => ({
							id: trade.id,
							coinId: trade.coinId,
							price: trade.price,
							amount: trade.amount,
							side: trade.buyerId === username ? 'buy' : 'sell',
							timestamp: trade.timestamp
						}))
					};

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true, user: userProfile }));
				} catch (error) {
					console.error('Error getting user profile:', error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: false, error: 'Failed to get user profile' }));
				}
			} else {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Trading API endpoint not found' }));
			}
			break;
	}
}



use((req, res, next) => {
	console.log(`[HTTP] ${req.method} ${req.url}`);
	if (req.url && req.url.startsWith('/internal')) {
		handleInternalHTTP(req, res).catch((err) => {
			console.error('Internal handler error:', err);
		});
		return;
	}
	if (req.url && req.url.startsWith('/api/trading')) {
		handleTradingAPI(req, res).catch((err) => {
			console.error('Trading API handler error:', err);
		});
		return;
	}
	next();
});

server.on('upgrade', (req, socket, head) => {
	if (req.url === '/ws') {
		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit('connection', ws, req);
		});
	} else if (useProxy) {
		proxy.ws(req, socket, head);
	} else {
		socket.destroy();
	}
});

server.listen(8080, async () => {
	console.log(`RealCoin server listening http://localhost:8080`);
	
	
	console.log('Initializing market engine...');
	await marketEngine.init();
	console.log('Market engine initialized and running!');
});

proxy.on('error', (err, _, res) => {
	console.error('Proxy error:', err.message);
	res.end('Backend unavailable');
});

if (!useProxy) {
	//@ts-ignore
	const { handler: svelteKitHandler } = await import('../build/handler.js');
	//@ts-ignore
	use(svelteKitHandler);
}
function parseCookies(req: http.IncomingMessage): Record<string, string> {
	const header = req.headers.cookie;
	if (!header) return {};
	return header.split(';').reduce((cookies: Record<string, string>, cookie) => {
		const [name, ...rest] = cookie.trim().split('=');
		cookies[name] = decodeURIComponent(rest.join('='));
		return cookies;
	}, {});
}

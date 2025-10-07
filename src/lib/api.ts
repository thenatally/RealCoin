export interface ApiResponse<T = any> {
	success: boolean;
	error?: string;
	details?: any;
	data?: T;
}


export interface TradingApiResponse<T = any> {
	success: boolean;
	error?: string;
}

export interface AuthAccount {
	username: string;
	displayName?: string;
	hasTOTP: boolean;
    avatarUrl?: string;
}

export interface LoginResponse {
	success: boolean;
	error?: string;
	requiresTOTP?: boolean;
	account?: AuthAccount;
	token?: string;
}

export interface TOTPSetupResponse {
	success: boolean;
	error?: string;
	otpauth_url?: string;
	secret?: string;
	backupCodes?: string[];
	message?: string;
}

export interface UserInfo {
	displayName?: string;
	avatarUrl?: string;
}

/**
 * Make an authenticated API request
 */
export async function apiRequest<T = any>(
	endpoint: string,
	options: RequestInit = {},
	f: typeof fetch = fetch
): Promise<ApiResponse<T>> {
	try {
		const response = await f(`/api${endpoint}`, {
			headers: {
				'Content-Type': 'application/json',
				...options.headers
			},
			...options
		});

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('API request failed:', error);
		return {
			success: false,
			error: 'Network error'
		};
	}
}

/**
 * Authentication API calls
 */
export const auth = {
	/**
	 * Create a new account
	 */
	async signup(data: {
		username: string;
		displayName?: string;
		password: string;
	}): Promise<ApiResponse> {
		return apiRequest('/auth/signup', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	/**
	 * Login with username/password and optional TOTP
	 */
	async login(data: {
		username: string;
		password: string;
		totp?: string;
	}): Promise<LoginResponse> {
		return apiRequest('/auth/login', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	/**
	 * Logout current user
	 */
	async logout(f?: typeof fetch): Promise<ApiResponse> {
		return apiRequest('/auth/logout', {
			method: 'POST',
		}, f);
	},

	/**
	 * Get current user info
	 */
	async me(): Promise<ApiResponse<{ account: AuthAccount }>> {
		return apiRequest('/auth/me');
	},

	/**
	 * Update user profile
	 */
	async updateProfile(data: {
		displayName?: string;
		avatarUrl?: string;
	}): Promise<ApiResponse> {
		return apiRequest('/auth/profile', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	/**
	 * Change username
	 */
	async changeUsername(data: {
		newUsername: string;
		password: string;
	}): Promise<ApiResponse<{ account: AuthAccount }>> {
		return apiRequest('/auth/change-username', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}
};

/**
 * User API calls
 */
export const user = {
	/**
	 * Get public user info by username/ID
	 */
	async getInfo(userId: string): Promise<ApiResponse<{ user: UserInfo }>> {
		return apiRequest(`/user/${encodeURIComponent(userId)}`);
	}
};

/**
 * TOTP API calls
 */
export const totp = {
	/**
	 * Start TOTP setup process
	 */
	async start(password: string): Promise<TOTPSetupResponse> {
		return apiRequest('/auth/totp/start', {
			method: 'POST',
			body: JSON.stringify({ password })
		});
	},

	/**
	 * Finalize TOTP setup with verification code
	 */
	async finalize(data: {
		password: string;
		code: string;
	}): Promise<TOTPSetupResponse> {
		return apiRequest('/auth/totp/finalize', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	},

	/**
	 * Remove TOTP from account
	 */
	async remove(data: {
		password: string;
		totp: string;
	}): Promise<TOTPSetupResponse> {
		return apiRequest('/auth/totp/remove', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}
};


import type { CoinData, PortfolioData, OrderRequest, OrderData, TradeData } from './types.js';

/**
 * Make a direct request to the RealCoin server (port 8080)
 */
async function tradingApiRequest<T = any>(
	endpoint: string,
	options: RequestInit = {}
): Promise<T> {
	try {
		
		const cookieStr = document.cookie;
		const authMatch = cookieStr.match(/auth_token_js=([^;]+)/);
		const authToken = authMatch ? authMatch[1] : '';

		const apiBase = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`;

		const response = await fetch(`${apiBase}/api/trading${endpoint}`, {
			headers: {
				'Content-Type': 'application/json',
				'Authorization': authToken ? `Bearer ${authToken}` : '',
				...options.headers
			},
			...options
		});

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('Trading API request failed:', error);
		return {
			success: false,
			error: 'Network error'
		} as T;
	}
}

/**
 * Trading API calls
 */
export const trading = {
	/**
	 * Get all available coins with current prices
	 */
	async getCoins(): Promise<TradingApiResponse & { coins?: CoinData[] }> {
		return tradingApiRequest('/coins');
	},

	/**
	 * Get user's portfolio (cash + holdings)
	 */
	async getPortfolio(): Promise<TradingApiResponse & { portfolio?: PortfolioData }> {
		return tradingApiRequest('/portfolio');
	},

	/**
	 * Place a buy or sell order
	 */
	async placeOrder(orderRequest: OrderRequest): Promise<TradingApiResponse & { order?: OrderData }> {
		return tradingApiRequest('/order', {
			method: 'POST',
			body: JSON.stringify(orderRequest)
		});
	},

	/**
	 * Get recent trades
	 */
	async getTrades(): Promise<TradingApiResponse & { trades?: TradeData[] }> {
		return tradingApiRequest('/trades');
	},

	/**
	 * Get price history for a coin at different timeframes
	 */
	async getPriceHistory(
		coinId: string, 
		timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w', 
		limit: number = 100
	): Promise<TradingApiResponse & { history?: Array<{
		date: string;
		timestamp: number;
		open: number;
		high: number;
		low: number;
		close: number;
		volume: number;
	}> }> {
		return tradingApiRequest(`/price-history?coinId=${encodeURIComponent(coinId)}&timeframe=${timeframe}&limit=${limit}`);
	},

	/**
	 * Get detailed information about all bots
	 */
	async getBots(): Promise<TradingApiResponse & { bots?: Array<{
		id: string;
		personality: string;
		traits: any;
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
			totalValue: number;
		};
		marketHistory: Record<string, number[]>;
		currentStrategy: string;
		recentActions: Array<{action: string, timestamp: Date, details: string}>;
	}> }> {
		return tradingApiRequest('/bots');
	},

	/**
	 * Get leaderboard of top users by portfolio value
	 */
	async getLeaderboard(timeframe: string = 'all', limit: number = 50): Promise<TradingApiResponse & { 
		leaderboard?: Array<{
			userId: string;
			displayName: string;
			cash: number;
			totalValue: number;
			totalGains: number;
			gainPercentage: number;
			holdings: number;
		}>;
		timeframe: string;
		totalUsers: number;
	}> {
		return tradingApiRequest(`/leaderboard?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`);
	},

	/**
	 * Get user profile information by username
	 */
	async getUserProfile(username: string): Promise<TradingApiResponse & { 
		user?: {
			username: string;
			displayName: string;
			avatarUrl?: string;
			portfolio: {
				cash: number;
				holdings: Record<string, {
					amount: number;
					averageCost: number;
					totalValue: number;
					currentPrice: number;
					gainLoss: number;
					gainLossPercentage: number;
				}>;
				totalValue: number;
				totalGains: number;
				gainPercentage: number;
			};
			stats: {
				totalTrades: number;
				holdingsCount: number;
			};
			recentTrades: Array<{
				id: string;
				coinId: string;
				price: number;
				amount: number;
				side: 'buy' | 'sell';
				timestamp: Date;
			}>;
		}
	}> {
		return tradingApiRequest(`/user/${encodeURIComponent(username)}`);
	}
};

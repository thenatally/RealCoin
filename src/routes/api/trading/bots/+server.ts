import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MarketEngine } from '../../../../../server/server.js';

export const GET: RequestHandler = async ({ url, request }) => {
	
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return error(401, 'Not authenticated');
	}

	try {
		const market = MarketEngine.getInstance();
		const bots = await market.getAllBots();
		
		
		const botDetails = bots.map((bot: any) => ({
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
					const coin = market.coins.get(coinId);
					const typedHolding = holding as { amount: number; averageCost: number };
					return sum + (coin ? coin.price * typedHolding.amount : 0);
				}, 0)
			},
			marketHistory: bot.marketHistory || {},
			currentStrategy: bot.getCurrentStrategy ? bot.getCurrentStrategy() : 'unknown',
			recentActions: bot.getRecentActions ? bot.getRecentActions(10) : []
		}));

		return json({
			success: true,
			bots: botDetails
		});
	} catch (e) {
		console.error('Error getting bot details:', e);
		return error(500, 'Failed to get bot details');
	}
};

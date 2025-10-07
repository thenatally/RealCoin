import { json } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth.js';

export async function GET({ cookies, fetch, url }: any) {
	try {
		const user = await getCurrentUser(cookies);
		
		if (!user || !user.success || !user.account) {
			return json(
				{ success: false, error: 'Not authenticated' },
				{ status: 401 }
			);
		}

		
		const coinId = url.searchParams.get('coinId');
		const timeframe = url.searchParams.get('timeframe');
		const limit = url.searchParams.get('limit');

		if (!coinId || !timeframe) {
			return json(
				{ success: false, error: 'Missing coinId or timeframe parameter' },
				{ status: 400 }
			);
		}

		
		const params = new URLSearchParams({
			coinId,
			timeframe,
			...(limit && { limit })
		});

		
		const tradingResponse = await fetch(`http://localhost:8080/api/trading/price-history?${params}`, {
			headers: {
				'Authorization': `Bearer ${cookies.get('auth_token')}`
			}
		});

		const data = await tradingResponse.json();
		return json(data, { status: tradingResponse.status });
	} catch (error) {
		console.error('Price history API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

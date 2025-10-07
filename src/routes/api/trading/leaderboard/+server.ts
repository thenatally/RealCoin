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

		
		const timeframe = url.searchParams.get('timeframe') || 'all';
		const limit = url.searchParams.get('limit') || '50';

		
		const tradingResponse = await fetch(`http://localhost:8080/api/trading/leaderboard?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`, {
			headers: {
				'Authorization': `Bearer ${cookies.get('auth_token')}`
			}
		});

		const data = await tradingResponse.json();
		return json(data, { status: tradingResponse.status });
	} catch (error) {
		console.error('Leaderboard API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

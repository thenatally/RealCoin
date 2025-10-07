import { json } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth.js';

export async function GET({ cookies, fetch }: any) {
	try {
		const user = await getCurrentUser(cookies);
		
		if (!user || !user.success || !user.account) {
			return json(
				{ success: false, error: 'Not authenticated' },
				{ status: 401 }
			);
		}

		
		const tradingResponse = await fetch('http://localhost:8080/api/trading/trades', {
			headers: {
				'Authorization': `Bearer ${cookies.get('auth_token')}`
			}
		});

		const data = await tradingResponse.json();
		return json(data, { status: tradingResponse.status });
	} catch (error) {
		console.error('Trades API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

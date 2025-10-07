import { json } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth.js';

export async function POST({ cookies, fetch, request }: any) {
	try {
		const user = await getCurrentUser(cookies);
		
		if (!user || !user.success || !user.account) {
			return json(
				{ success: false, error: 'Not authenticated' },
				{ status: 401 }
			);
		}

		const body = await request.json();

		
		const tradingResponse = await fetch('http://localhost:8080/api/trading/order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${cookies.get('auth_token')}`
			},
			body: JSON.stringify(body)
		});

		const data = await tradingResponse.json();
		return json(data, { status: tradingResponse.status });
	} catch (error) {
		console.error('Order API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

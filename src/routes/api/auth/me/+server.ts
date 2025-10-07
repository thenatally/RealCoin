import { json } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		const user = await getCurrentUser(cookies);
		
		if (user && user.success) {
			return json({
				success: true,
				account: user.account
			});
		} else {
			return json(
				{ success: false, error: 'Not authenticated' },
				{ status: 401 }
			);
		}
	} catch (error) {
		console.error('Me API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

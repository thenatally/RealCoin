import { json } from '@sveltejs/kit';
import { getUserInfo } from '$lib/server/auth.js';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;
		
		if (!id || typeof id !== 'string') {
			return json(
				{ success: false, error: 'Invalid user ID' },
				{ status: 400 }
			);
		}

		const result = await getUserInfo(id);
		
		if (result.success && result.user) {
			return json({
				success: true,
				user: {
					displayName: result.user.displayName,
					avatarUrl: result.user.avatarUrl
				}
			});
		} else {
			return json(
				{ success: false, error: 'User not found' },
				{ status: 404 }
			);
		}
	} catch (error) {
		console.error('User info API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

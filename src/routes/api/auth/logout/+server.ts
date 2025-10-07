import { json } from '@sveltejs/kit';
import { makeInternalRequest, getAuthToken, clearAuthToken } from '$lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	try {
		const token = getAuthToken(cookies);
		
		if (token) {
			
			console.log('Logging out with token:', token);
			const response = await makeInternalRequest(fetch, '/accounts/logout', { token });
			console.log('Internal API response status:', response.status);
			const result = await response.json();
			
			
			clearAuthToken(cookies);
			
			return json(result, { status: response.status });
		} else {
			
			clearAuthToken(cookies);
			return json({ success: true });
		}
	} catch (error) {
		console.error('Logout API error:', error);
		
		clearAuthToken(cookies);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

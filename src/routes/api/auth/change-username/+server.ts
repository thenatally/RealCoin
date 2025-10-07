import { json } from '@sveltejs/kit';
import { makeInternalRequest, getAuthToken, setAuthToken, type AuthResponse } from '$lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const token = getAuthToken(cookies);
		
		if (!token) {
			return json(
				{ success: false, error: 'Not authenticated' },
				{ status: 401 }
			);
		}

		const body = await request.json();
		
		const requestData = {
			token,
			...body
		};

		const response = await makeInternalRequest(fetch, '/accounts/change-username', requestData);
		const result: AuthResponse = await response.json();

		if (result.success && result.account) {
			return json({success: result, data: {account: result.account}}, { status: response.status });
		}

		return json(result, { status: response.status });
	} catch (error) {
		console.error('Change username API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

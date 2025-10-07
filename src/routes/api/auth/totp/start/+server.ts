import { json } from '@sveltejs/kit';
import { makeInternalRequest, getAuthToken, type TOTPSetupResponse } from '$lib/server/auth.js';
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

		
		const response = await makeInternalRequest(fetch, '/accounts/start-totp-setup', requestData);
		const result: TOTPSetupResponse = await response.json();

		return json(result, { status: response.status });
	} catch (error) {
		console.error('TOTP start setup API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

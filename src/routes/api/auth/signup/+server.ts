import { json } from '@sveltejs/kit';
import { makeInternalRequest, type AuthResponse } from '$lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		
		
		const response = await makeInternalRequest(fetch, '/accounts/create', body);
		const result: AuthResponse = await response.json();

		return json(result, { status: response.status });
	} catch (error) {
		console.error('Signup API error:', error);
		return json(
			{ success: false, error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

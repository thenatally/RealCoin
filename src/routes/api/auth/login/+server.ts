import { json } from '@sveltejs/kit';
import { makeInternalRequest, setAuthToken, type AuthResponse } from '$lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
	try {
		const body = await request.json();

		const response = await makeInternalRequest(fetch, '/accounts/login', body);
		const result: AuthResponse = await response.json();

		if (result.success && result.token && !result.requiresTOTP) {
			setAuthToken(cookies, result.token);
			const { token, ...responseWithoutToken } = result;
			return json(responseWithoutToken, { status: response.status });
		}

		return json(result, { status: response.status });
	} catch (error) {
		console.error('Login API error:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

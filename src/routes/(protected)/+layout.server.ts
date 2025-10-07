import { redirect } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/server/auth.js';

export async function load({ cookies, url }: any) {
	const user = await getCurrentUser(cookies);
	
	if (!user || !user.success || !user.account) {
		
		throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	}
	
	return {
		account: user.account
	};
}

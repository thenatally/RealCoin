import { getCurrentUser } from '$lib/server/auth.js';

export async function load({ cookies }: any) {
	const user = await getCurrentUser(cookies);
	
	return {
		account: user?.account || null
	};
}

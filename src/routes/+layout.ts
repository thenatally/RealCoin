import { account } from '$lib';
import { auth } from '$lib/api.js';

export async function load({ fetch, data }: any) {
	
	if (data.account) {
		account.set(data.account);
	} else {
		
		try {
			const userResponse = await fetch('/api/auth/me');
			
			if (userResponse.ok) {
				const userData = await userResponse.json();
				if (userData.success) {
					account.set(userData.account);
				} else {
					account.clear();
				}
			} else {
				
				account.clear();
				await auth.logout(fetch);
			}
		} catch (error) {
			console.error('Failed to load user:', error);
			account.clear();
		}
	}
	
	account.setLoading(false);
}

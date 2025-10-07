import { writable } from 'svelte/store';
import type { AuthAccount } from '$lib/api.js';

export interface AuthState {
	account: AuthAccount | null;
	isLoading: boolean;
}

export const authStore = writable<AuthState>({
	account: null,
	isLoading: true
});

export const account = {
	subscribe: authStore.subscribe,
	set: (account: AuthAccount | null) => {
		authStore.update(state => ({
			...state,
			account,
			isLoading: false
		}));
	},
	setLoading: (isLoading: boolean) => {
		authStore.update(state => ({
			...state,
			isLoading
		}));
	},
	clear: () => {
		authStore.set({
			account: null,
			isLoading: false
		});
	}
};

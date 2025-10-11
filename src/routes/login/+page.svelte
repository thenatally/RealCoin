<script lang="ts">
	import { auth } from '$lib/api.js';
	import { account } from '$lib';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let username = '';
	let password = '';
	let totp = '';
	let showTOTP = false;
	let loading = false;
	let error = '';
	let success = '';

	let redirectUrl = '/market';

	onMount(() => {
		
		const urlMessage = $page.url.searchParams.get('message');
		const redirect = $page.url.searchParams.get('redirect');
		
		if (urlMessage) {
			success = urlMessage;
		}
		
		if (redirect) {
			redirectUrl = redirect;
		}

		
		if ($account.account) {
			goto(redirectUrl);
		}
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!username.trim() || !password) {
			error = 'Please fill in all fields';
			return;
		}

		if (showTOTP && !totp.trim()) {
			error = 'Please enter your TOTP code';
			return;
		}

		loading = true;
		error = '';
		success = '';

		try {
			const response = await auth.login({ 
				username: username.trim(), 
				password, 
				totp: totp.trim() || undefined 
			});
			
			if (response.success) {
				if (response.requiresTOTP && !totp.trim()) {
					showTOTP = true;
					error = 'Please enter your 6-digit TOTP code from your authenticator app';
					loading = false;
					return;
				}

				
				if (response.account) {
					account.set(response.account);
					goto(redirectUrl);
				}
			} else {
				if (response.error?.includes('TOTP')) {
					showTOTP = true;
				}
				error = response.error || 'Login failed. Please check your credentials.';
			}
		} catch (e) {
			error = 'Network error. Please check your connection and try again.';
		}

		loading = false;
	}

	function resetForm() {
		showTOTP = false;
		totp = '';
		error = '';
	}
</script>

<svelte:head>
	<title>Login - RealCoin</title>
</svelte:head>

<div class="min-h-screen bg-background flex items-center justify-center py-12 px-6">
	<div class="max-w-sm w-full space-y-6">
		<div class="text-center">
			<h2 class="text-2xl font-semibold text-foreground">
				Sign in to RealCoin
			</h2>
			<p class="mt-2 text-sm text-muted-foreground">
				Or
				<a href="/signup" class="font-medium text-primary hover:text-primary/80">
					create a new account
				</a>
			</p>
		</div>
		
		<form class="space-y-4" onsubmit={handleSubmit}>
			<div class="space-y-3">
				<div>
					<label for="username" class="block text-sm font-medium text-foreground mb-1">Username</label>
					<input
						id="username"
						name="username"
						type="text"
						required
						bind:value={username}
						class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
						placeholder="Enter username"
					/>
				</div>
				<div>
					<label for="password" class="block text-sm font-medium text-foreground mb-1">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						bind:value={password}
						class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
						placeholder="Enter password"
					/>
				</div>
				{#if showTOTP}
					<div>
						<label for="totp" class="block text-sm font-medium text-foreground mb-1">TOTP Code</label>
						<input
							id="totp"
							name="totp"
							type="text"
							maxlength="6"
							bind:value={totp}
							class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
							placeholder="6-digit code"
						/>
						<p class="mt-1 text-xs text-muted-foreground text-center">
							Enter the 6-digit code from your authenticator app
							<button type="button" onclick={resetForm} class="ml-2 text-primary hover:text-primary/80">
								Use different account
							</button>
						</p>
					</div>
				{/if}
			</div>

			{#if success}
				<div class="bg-success/10 border border-success/20 rounded-md p-3">
					<div class="text-sm text-success">{success}</div>
				</div>
			{/if}

			{#if error}
				<div class="bg-destructive/10 border border-destructive/20 rounded-md p-3">
					<div class="text-sm text-destructive">{error}</div>
				</div>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 transition-colors"
			>
				{loading ? 'Signing in...' : 'Sign in'}
			</button>
		</form>
	</div>
</div>

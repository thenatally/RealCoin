<script lang="ts">
	import { auth } from '$lib/api.js';
	import { account } from '$lib';
	import { goto } from '$app/navigation';

	let username = '';
	let displayName = '';
	let password = '';
	let confirmPassword = '';
	let loading = false;
	let error = '';

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		
		username = username.trim();
		displayName = displayName.trim();

		if (!username || !password) {
			error = 'Please fill in all required fields';
			return;
		}

		
		if (username.length < 3) {
			error = 'Username must be at least 3 characters';
			return;
		}

		if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
			error = 'Username can only contain letters, numbers, underscores, and hyphens';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		
		if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
			error = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
			return;
		}

		loading = true;
		error = '';

		try {
			const response = await auth.signup({ 
				username, 
				password, 
				displayName: displayName || undefined 
			});
			
			if (response.success) {
				
				const loginResponse = await auth.login({ username, password });
				
				if (loginResponse.success && loginResponse.account) {
					account.set(loginResponse.account);
					goto('/trading');
				} else {
					
					goto('/login?message=Account created successfully. Please log in.');
				}
			} else {
				error = response.error || 'Account creation failed. Please try again.';
			}
		} catch (e) {
			error = 'Network error. Please check your connection and try again.';
		}

		loading = false;
	}
</script>

<svelte:head>
	<title>Sign Up - RealCoin</title>
</svelte:head>

<div class="min-h-screen bg-background flex items-center justify-center py-12 px-6">
	<div class="max-w-sm w-full space-y-6">
		<div class="text-center">
			<h2 class="text-2xl font-semibold text-foreground">
				Create your RealCoin account
			</h2>
			<p class="mt-2 text-sm text-muted-foreground">
				Or
				<a href="/login" class="font-medium text-primary hover:text-primary/80">
					sign in to your existing account
				</a>
			</p>
		</div>
		
		<form class="space-y-4" onsubmit={handleSubmit}>
			<div class="space-y-3">
				<div>
					<label for="username" class="block text-sm font-medium text-foreground mb-1">Username *</label>
					<input
						id="username"
						name="username"
						type="text"
						required
						bind:value={username}
						class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
						placeholder="3+ characters, letters/numbers only"
					/>
				</div>
				
				<div>
					<label for="displayName" class="block text-sm font-medium text-foreground mb-1">Display Name</label>
					<input
						id="displayName"
						name="displayName"
						type="text"
						bind:value={displayName}
						class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
						placeholder="Optional display name"
					/>
				</div>
				
				<div>
					<label for="password" class="block text-sm font-medium text-foreground mb-1">Password *</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						bind:value={password}
						class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
						placeholder="8+ chars, uppercase, lowercase, number"
					/>
				</div>
				
				<div>
					<label for="confirmPassword" class="block text-sm font-medium text-foreground mb-1">Confirm Password *</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						required
						bind:value={confirmPassword}
						class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
						placeholder="Confirm your password"
					/>
				</div>
			</div>

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
				{loading ? 'Creating account...' : 'Create account'}
			</button>
		</form>
	</div>
</div>

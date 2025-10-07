<script lang="ts">
	import { account } from '$lib';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		
		if ($account.account) {
			goto('/trading');
		}
	});
</script>

<svelte:head>
	<title>Welcome to RealCoin</title>
</svelte:head>

<div class="min-h-screen bg-background flex items-center justify-center">
	<div class="max-w-4xl mx-auto px-6 py-16">
		<div class="text-center">
			<h1 class="text-5xl font-bold text-foreground mb-4">RealCoin</h1>
			<p class="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
				Experience realistic cryptocurrency trading with live market simulation and comprehensive portfolio management.
			</p>
			
			<div class="flex flex-col sm:flex-row gap-3 justify-center mb-16">
				<a href="/login" class="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors">
					Sign In
				</a>
				<a href="/signup" class="border border-border px-6 py-2 rounded-md font-medium hover:bg-accent transition-colors">
					Create Account
				</a>
			</div>
		</div>

		
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
			<div class="text-center">
				<div class="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
					</svg>
				</div>
				<h3 class="text-lg font-semibold text-foreground mb-2">Live Market Data</h3>
				<p class="text-muted-foreground text-sm leading-relaxed">
					Real-time price updates with WebSocket connections for instant market movements.
				</p>
			</div>

			<div class="text-center">
				<div class="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
					</svg>
				</div>
				<h3 class="text-lg font-semibold text-foreground mb-2">Secure Trading</h3>
				<p class="text-muted-foreground text-sm leading-relaxed">
					Advanced security with optional two-factor authentication and secure session management.
				</p>
			</div>

			<div class="text-center">
				<div class="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
					</svg>
				</div>
				<h3 class="text-lg font-semibold text-foreground mb-2">Portfolio Management</h3>
				<p class="text-muted-foreground text-sm leading-relaxed">
					Track your investments with comprehensive portfolio analytics and trading history.
				</p>
			</div>
		</div>
	</div>
</div>
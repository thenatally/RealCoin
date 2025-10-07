<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { account } from '$lib';
	import { auth } from '$lib/api.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { mode, ModeWatcher, theme, toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import { Bug, LogIn, LogOut, Moon, Sun } from '@lucide/svelte';
	let { children } = $props();

	
	const publicRoutes = ['/login', '/signup', '/'];

	const isPublicRoute = $derived(publicRoutes.includes($page.url.pathname));
	const isAuthenticated = $derived($account.account !== null);

	async function logout() {
		try {
			await auth.logout();
			account.clear();
			goto('/login');
		} catch (error) {
			console.error('Logout error:', error);
			
			account.clear();
			goto('/login');
		}
	}
</script>

<ModeWatcher />
<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if $account.isLoading}
	<div class="min-h-screen bg-background flex items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-medium text-foreground">Loading...</h1>
		</div>
	</div>
{:else if isAuthenticated && !isPublicRoute}
	
	<div class="min-h-screen bg-background">
		<nav class="border-b border-border bg-card">
			<div class="max-w-7xl mx-auto px-6">
				<div class="flex items-center justify-between h-16">
					<div class="flex items-center gap-8">
						<h1 class="text-xl font-semibold text-foreground">
							<a href="/trading" class="hover:text-primary transition-colors">RealCoin</a>
						</h1>
						<div class="hidden md:flex items-center gap-6">
							<a href="/trading" class="text-sm text-muted-foreground hover:text-foreground transition-colors">Trading</a>
							<a href="/leaderboard" class="text-sm text-muted-foreground hover:text-foreground transition-colors">Leaderboard</a>
						</div>
					</div>
					
					<div class="flex items-center gap-3">
						<a href="/account" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
							{$account.account?.displayName || $account.account?.username}
						</a>
						<Button onclick={toggleMode} variant="ghost" size="sm">
							<Sun class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
							<Moon class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
						</Button>
						<Button onclick={logout} variant="ghost" size="sm">
							<LogOut class="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>
		</nav>
		{@render children?.()}
	</div>
{:else}
	
	{@render children?.()}
{/if}

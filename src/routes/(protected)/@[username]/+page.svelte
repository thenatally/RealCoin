<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { trading } from '$lib/api.js';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { 
		User, 
		DollarSign, 
		TrendingUp, 
		TrendingDown, 
		PieChart, 
		Activity,
		Calendar,
		ArrowUpDown,
		Coins,
		RefreshCw
	} from '@lucide/svelte';

	interface UserProfile {
		username: string;
		displayName: string;
		avatarUrl?: string;
		portfolio: {
			cash: number;
			holdings: Record<string, {
				amount: number;
				averageCost: number;
				totalValue: number;
				currentPrice: number;
				gainLoss: number;
				gainLossPercentage: number;
			}>;
			totalValue: number;
			totalGains: number;
			gainPercentage: number;
		};
		stats: {
			totalTrades: number;
			holdingsCount: number;
		};
		recentTrades: Array<{
			id: string;
			coinId: string;
			price: number;
			amount: number;
			side: 'buy' | 'sell';
			timestamp: Date;
		}>;
	}

	let userProfile: UserProfile | null = null;
	let loading = true;
	let error = '';
	let username = '';
	let refreshInterval: NodeJS.Timeout;
	let isRefreshing = false;
	let ws: WebSocket | null = null;

	$: username = $page.params.username ?? '';

	async function loadUserProfile(isRefresh = false) {
		if (!username) return;
		
		if (isRefresh) {
			isRefreshing = true;
		} else {
			loading = true;
		}
		error = '';
		
		try {
			const response = await trading.getUserProfile(username);
			
			if (response.success && response.user) {
				userProfile = response.user;
			} else {
				error = response.error || 'User not found';
			}
		} catch (err) {
			console.error('Error loading user profile:', err);
			error = 'Failed to load user profile';
		} finally {
			loading = false;
			isRefreshing = false;
		}
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	}

	function formatPercentage(value: number): string {
		return `${value >= 0 ? '+' : ''}${value?.toFixed(2)}%`;
	}

	function formatDate(date: Date): string {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(date));
	}

	function getPerformanceColor(percentage: number): string {
		if (percentage > 0) return 'text-success';
		if (percentage < 0) return 'text-destructive';
		return 'text-muted-foreground';
	}

	function connectWebSocket() {
		if (!browser) return;
		
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/ws`;
		
		ws = new WebSocket(wsUrl);
		
		ws.onopen = () => {
			console.log('WebSocket connected for user profile');
			
			ws?.send(JSON.stringify({ room: 'trading' }));
		};
		
		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				
				
				if (message.type === 'trade' || message.type === 'price_update') {
					
					if (message.type === 'trade' && 
						(message.trade?.buyerId === username || message.trade?.sellerId === username)) {
						
						setTimeout(() => loadUserProfile(true), 500); 
					} else if (message.type === 'price_update' && userProfile?.portfolio?.holdings) {
						
						const hasRelevantHoldings = Object.keys(userProfile.portfolio.holdings).some(
							coinId => message.prices?.[coinId]
						);
						if (hasRelevantHoldings) {
							setTimeout(() => loadUserProfile(true), 100);
						}
					}
				}
			} catch (e) {
				console.error('WebSocket message error:', e);
			}
		};
		
		ws.onclose = () => {
			console.log('WebSocket disconnected');
			
			setTimeout(connectWebSocket, 5000);
		};
		
		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};
	}

	onMount(() => {
		loadUserProfile();
		
		
		refreshInterval = setInterval(() => {
			if (username && !loading && !isRefreshing) {
				loadUserProfile(true);
			}
		}, 5000);

		
		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
		};
	});

	$: if (username) {
		loadUserProfile();
	}
</script>

<svelte:head>
	<title>@{username} - RealCoin</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-6 py-8">
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
			<span class="ml-2 text-muted-foreground">Loading profile...</span>
		</div>
	{:else if error}
		<div class="border border-border rounded-lg p-6">
			<div class="text-center text-destructive">
				<User class="size-12 mx-auto mb-4 text-muted-foreground" />
				<p class="font-medium text-lg mb-2">User Not Found</p>
				<p class="text-sm">{error}</p>
				<Button href="/leaderboard" class="mt-4">View Leaderboard</Button>
			</div>
		</div>
	{:else if userProfile}
		
		<div class="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
			<div class="flex items-center gap-4 mb-4 md:mb-0">
				<div class="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
					{#if userProfile.avatarUrl}
						<img 
							src={userProfile.avatarUrl} 
							alt="{userProfile.displayName}'s avatar"
							class="h-16 w-16 rounded-full object-cover"
						/>
					{:else}
						<span class="text-primary font-bold text-2xl">
							{userProfile.displayName.charAt(0).toUpperCase()}
						</span>
					{/if}
				</div>
				<div>
					<h1 class="text-2xl font-semibold">{userProfile.displayName}</h1>
					<p class="text-muted-foreground">@{userProfile.username}</p>
				</div>
			</div>
			
			<div class="flex items-center gap-3">
				{#if isRefreshing}
					<div class="flex items-center gap-1 text-muted-foreground text-sm">
						<RefreshCw class="size-3 animate-spin" />
						<span>Updating...</span>
					</div>
				{/if}
				<Badge 
					variant={userProfile.portfolio.gainPercentage >= 0 ? 'default' : 'destructive'}
					class="px-3 py-1 {userProfile.portfolio.gainPercentage >= 0 ? 'bg-success/10 text-success hover:bg-success/20' : ''}"
				>
					{#if userProfile.portfolio.gainPercentage >= 0}
						<TrendingUp class="size-4 mr-1" />
					{:else}
						<TrendingDown class="size-4 mr-1" />
					{/if}
					{formatPercentage(userProfile.portfolio.gainPercentage)}
				</Badge>
			</div>
		</div>

		
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
			<div class="border border-border rounded-lg p-4">
				<div class="flex items-center gap-3">
					<DollarSign class="size-5 text-chart-2" />
					<div>
						<p class="text-sm text-muted-foreground">Total Value</p>
						<p class="text-xl font-semibold">{formatCurrency(userProfile.portfolio.totalValue)}</p>
					</div>
				</div>
			</div>
			
			<div class="border border-border rounded-lg p-4">
				<div class="flex items-center gap-3">
					<Coins class="size-5 text-chart-3" />
					<div>
						<p class="text-sm text-muted-foreground">Cash</p>
						<p class="text-xl font-semibold">{formatCurrency(userProfile.portfolio.cash)}</p>
					</div>
				</div>
			</div>
			
			<div class="border border-border rounded-lg p-4">
				<div class="flex items-center gap-3">
					<TrendingUp class="size-5 {getPerformanceColor(userProfile.portfolio.totalGains)}" />
					<div>
						<p class="text-sm text-muted-foreground">P&L</p>
						<p class="text-xl font-semibold">
							{formatCurrency(userProfile.portfolio.totalGains)}
						</p>
					</div>
				</div>
			</div>
			
			<div class="border border-border rounded-lg p-4">
				<div class="flex items-center gap-3">
					<Activity class="size-5 text-chart-4" />
					<div>
						<p class="text-sm text-muted-foreground">Total Trades</p>
						<p class="text-xl font-semibold">{userProfile.stats.totalTrades}</p>
					</div>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			
			<div class="border border-border rounded-lg">
				<div class="p-4 border-b border-border">
					<h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
						<PieChart class="size-5" />
						Portfolio Holdings ({userProfile.stats.holdingsCount})
					</h3>
				</div>
				<div class="p-4">
					{#if Object.keys(userProfile.portfolio.holdings).length === 0}
						<div class="text-center py-8">
							<PieChart class="size-12 text-muted-foreground mx-auto mb-4" />
							<p class="text-muted-foreground">No holdings</p>
						</div>
					{:else}
						<div class="space-y-0">
							{#each Object.entries(userProfile.portfolio.holdings) as [coinId, holding], index}
								<div class="flex items-center justify-between py-3">
									<div class="flex items-center gap-3">
										<div class="font-medium">{coinId.toUpperCase()}</div>
										<div class="text-sm text-muted-foreground">
											{holding.amount?.toFixed(4)} @ {formatCurrency(holding.averageCost)}
										</div>
									</div>
									<div class="text-right">
										<div class="font-medium">{formatCurrency(holding.totalValue)}</div>
									</div>
								</div>
								{#if index < Object.entries(userProfile.portfolio.holdings).length - 1}
									<Separator />
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			</div>

			
			<div class="border border-border rounded-lg">
				<div class="p-4 border-b border-border">
					<h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
						<ArrowUpDown class="size-5" />
						Recent Trades
					</h3>
				</div>
				<div class="p-4">
					{#if userProfile.recentTrades.length === 0}
						<div class="text-center py-8">
							<ArrowUpDown class="size-12 text-muted-foreground mx-auto mb-4" />
							<p class="text-muted-foreground">No recent trades</p>
						</div>
					{:else}
						<div class="space-y-0">
							{#each userProfile.recentTrades.slice(0, 10) as trade, index}
								<div class="flex items-center justify-between py-3">
									<div class="flex items-center gap-3">
										<Badge variant={trade.side === 'buy' ? 'default' : 'destructive'} class="min-w-[60px] justify-center">
											{trade.side.toUpperCase()}
										</Badge>
										<div>
											<div class="font-medium">{trade.coinId.toUpperCase()}</div>
											<div class="text-sm text-muted-foreground flex items-center gap-1">
												<Calendar class="size-3" />
												{formatDate(trade.timestamp)}
											</div>
										</div>
									</div>
									<div class="text-right">
										<div class="font-medium">{formatCurrency(trade.price)}</div>
										<div class="text-sm text-muted-foreground">{trade.amount?.toFixed(4)}</div>
									</div>
								</div>
								{#if index < userProfile.recentTrades.slice(0, 10).length - 1}
									<Separator />
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

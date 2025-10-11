<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { trading } from '$lib/api.js';
	import { account } from '$lib';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { 
		TrendingUp, 
		TrendingDown, 
		Activity, 
		RefreshCw,
		ArrowUpRight,
		Eye
	} from '@lucide/svelte';
	import type { CoinData, WSMessage } from '$lib/types.js';

	let coins: CoinData[] = [];
	let ws: WebSocket | null = null;
	let loading = true;
	let error = '';
	let isRefreshing = false;
	let lastUpdate = new Date();

	
	let priceHistory: Record<string, Array<{ price: number; timestamp: Date }>> = {};

	onMount(async () => {
		if (browser && $account.account) {
			await loadCoins();
			connectWebSocket();
		}
	});

	async function loadCoins() {
		try {
			loading = true;
			error = '';
			
			const response = await trading.getCoins();
			if (response.success && response.coins) {
				coins = response.coins;
				
				
				coins.forEach(coin => {
					if (!priceHistory[coin.id]) {
						priceHistory[coin.id] = [];
					}
					
					priceHistory[coin.id].push({
						price: coin.price,
						timestamp: new Date()
					});
					
					if (priceHistory[coin.id].length > 10) {
						priceHistory[coin.id] = priceHistory[coin.id].slice(-10);
					}
				});
				
				lastUpdate = new Date();
			} else {
				error = response.error || 'Failed to load coins';
			}
		} catch (err) {
			console.error('Error loading coins:', err);
			error = 'Failed to load market data';
		} finally {
			loading = false;
		}
	}

	function connectWebSocket() {
		if (!browser) return;
		
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/ws`;
		
		ws = new WebSocket(wsUrl);
		
		ws.onopen = () => {
			console.log('WebSocket connected for market watch');
			ws?.send(JSON.stringify({ room: 'trading' }));
		};
		
		ws.onmessage = (event) => {
			try {
				const message: WSMessage = JSON.parse(event.data);
				
				if (message.type === 'price_update' && message.prices) {
					
					coins = coins.map(coin => {
						if (message.prices[coin.id]) {
							const newPrice = message.prices[coin.id].price;
							
							
							if (!priceHistory[coin.id]) {
								priceHistory[coin.id] = [];
							}
							priceHistory[coin.id].push({
								price: newPrice,
								timestamp: new Date()
							});
							
							if (priceHistory[coin.id].length > 10) {
								priceHistory[coin.id] = priceHistory[coin.id].slice(-10);
							}
							
							return {
								...coin,
								price: newPrice,
								lastUpdated: message.prices[coin.id].lastUpdated
							};
						}
						return coin;
					});
					
					lastUpdate = new Date();
				}
			} catch (e) {
				console.error('WebSocket message error:', e);
			}
		};
		
		ws.onclose = () => {
			console.log('WebSocket disconnected');
			
			setTimeout(connectWebSocket, 3000);
		};
		
		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};
	}

	async function refreshData() {
		isRefreshing = true;
		await loadCoins();
		isRefreshing = false;
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 6
		}).format(value);
	}

	function formatPercentage(value: number): string {
		return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
	}

	function formatTime(date: Date): string {
		return new Intl.DateTimeFormat('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		}).format(date);
	}

	
	function getPriceChange(coinId: string): { change: number; changePercent: number; isPositive: boolean } | null {
		const history = priceHistory[coinId];
		if (!history || history.length < 2) return null;
		
		const current = history[history.length - 1].price;
		const previous = history[0].price;
		const change = current - previous;
		const changePercent = (change / previous) * 100;
		
		return {
			change,
			changePercent,
			isPositive: change >= 0
		};
	}

	
	function getTrendDirection(coinId: string): 'up' | 'down' | 'flat' {
		const history = priceHistory[coinId];
		if (!history || history.length < 3) return 'flat';
		
		const recent = history.slice(-3).map(h => h.price);
		const isUptrend = recent[2] > recent[1] && recent[1] > recent[0];
		const isDowntrend = recent[2] < recent[1] && recent[1] < recent[0];
		
		if (isUptrend) return 'up';
		if (isDowntrend) return 'down';
		return 'flat';
	}

	
	let sortBy: 'name' | 'price' | 'change' = 'name';
	let sortOrder: 'asc' | 'desc' = 'asc';

	$: sortedCoins = [...coins].sort((a, b) => {
		let aVal: any, bVal: any;
		
		switch (sortBy) {
			case 'price':
				aVal = a.price;
				bVal = b.price;
				break;
			case 'change':
				const aChange = getPriceChange(a.id);
				const bChange = getPriceChange(b.id);
				aVal = aChange?.changePercent || 0;
				bVal = bChange?.changePercent || 0;
				break;
			default:
				aVal = a.name.toLowerCase();
				bVal = b.name.toLowerCase();
		}
		
		if (sortOrder === 'asc') {
			return aVal > bVal ? 1 : -1;
		} else {
			return aVal < bVal ? 1 : -1;
		}
	});

	function setSortBy(newSortBy: typeof sortBy) {
		if (sortBy === newSortBy) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = newSortBy;
			sortOrder = 'asc';
		}
	}
</script>

<svelte:head>
	<title>Market Watch - RealCoin</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-6 py-8">
	
	<div class="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
		<div>
			<h1 class="text-3xl font-bold">Market Watch</h1>
			<p class="text-muted-foreground mt-1">Real-time cryptocurrency prices and trends</p>
		</div>
		
		<div class="flex items-center gap-4 mt-4 md:mt-0">
			<div class="text-sm text-muted-foreground">
				Last updated: {formatTime(lastUpdate)}
			</div>
			
			{#if isRefreshing}
				<div class="flex items-center gap-2 text-muted-foreground">
					<RefreshCw class="size-4 animate-spin" />
					<span class="text-sm">Updating...</span>
				</div>
			{:else}
				<Button variant="outline" size="sm" on:click={refreshData}>
					<RefreshCw class="size-4 mr-2" />
					Refresh
				</Button>
			{/if}
			
			<Button href="/market" size="sm">
				<ArrowUpRight class="size-4 mr-2" />
				Start Trading
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			<span class="ml-3 text-muted-foreground">Loading market data...</span>
		</div>
	{:else if error}
		<Card class="border-destructive">
			<CardContent class="pt-6">
				<div class="text-center text-destructive">
					<Activity class="size-12 mx-auto mb-4" />
					<p class="font-medium text-lg mb-2">Failed to Load Market Data</p>
					<p class="text-sm">{error}</p>
					<Button on:click={refreshData} class="mt-4">
						Try Again
					</Button>
				</div>
			</CardContent>
		</Card>
	{:else}
		
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-sm font-medium">Total Markets</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{coins.length}</div>
					<p class="text-xs text-muted-foreground">Active cryptocurrencies</p>
				</CardContent>
			</Card>
			
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-sm font-medium">Gainers</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-success">
						{coins.filter(coin => {
							const change = getPriceChange(coin.id);
							return change && change.isPositive;
						}).length}
					</div>
					<p class="text-xs text-muted-foreground">Coins up today</p>
				</CardContent>
			</Card>
			
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-sm font-medium">Losers</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-destructive">
						{coins.filter(coin => {
							const change = getPriceChange(coin.id);
							return change && !change.isPositive;
						}).length}
					</div>
					<p class="text-xs text-muted-foreground">Coins down today</p>
				</CardContent>
			</Card>
		</div>

		
		<div class="flex items-center gap-2 mb-6">
			<span class="text-sm text-muted-foreground">Sort by:</span>
			<Button 
				variant={sortBy === 'name' ? 'default' : 'outline'} 
				size="sm" 
				on:click={() => setSortBy('name')}
			>
				Name {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
			</Button>
			<Button 
				variant={sortBy === 'price' ? 'default' : 'outline'} 
				size="sm" 
				on:click={() => setSortBy('price')}
			>
				Price {sortBy === 'price' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
			</Button>
			<Button 
				variant={sortBy === 'change' ? 'default' : 'outline'} 
				size="sm" 
				on:click={() => setSortBy('change')}
			>
				Change {sortBy === 'change' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
			</Button>
		</div>

		
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{#each sortedCoins as coin (coin.id)}
				{@const priceChange = getPriceChange(coin.id)}
				{@const trend = getTrendDirection(coin.id)}
				
				<Card class="hover:shadow-md transition-all duration-200 {priceChange?.isPositive ? 'border-success/20' : priceChange && !priceChange.isPositive ? 'border-destructive/20' : ''}">
					<CardHeader class="pb-3">
						<div class="flex items-center justify-between">
							<div>
								<CardTitle class="text-base font-semibold">{coin.id.toUpperCase()}</CardTitle>
								<p class="text-sm text-muted-foreground">{coin.name}</p>
							</div>
							<div class="flex items-center gap-1">
								{#if trend === 'up'}
									<TrendingUp class="size-4 text-success" />
								{:else if trend === 'down'}
									<TrendingDown class="size-4 text-destructive" />
								{:else}
									<Activity class="size-4 text-muted-foreground" />
								{/if}
							</div>
						</div>
					</CardHeader>
					
					<CardContent>
						<div class="space-y-3">
							<div>
								<div class="text-xl font-bold">{formatCurrency(coin.price)}</div>
								{#if priceChange}
									<div class="flex items-center gap-2 mt-1">
										<Badge 
											variant={priceChange.isPositive ? 'default' : 'destructive'}
											class="text-xs {priceChange.isPositive ? 'bg-success/10 text-success hover:bg-success/20' : ''}"
										>
											{#if priceChange.isPositive}
												<TrendingUp class="size-3 mr-1" />
											{:else}
												<TrendingDown class="size-3 mr-1" />
											{/if}
											{formatPercentage(priceChange.changePercent)}
										</Badge>
										<span class="text-xs text-muted-foreground">
											{priceChange.isPositive ? '+' : ''}{formatCurrency(priceChange.change)}
										</span>
									</div>
								{/if}
							</div>
							
							<div class="pt-2 border-t">
								<Button href="/market" variant="outline" size="sm" class="w-full">
									<Eye class="size-4 mr-2" />
									Trade {coin.id.toUpperCase()}
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>

		{#if coins.length === 0}
			<Card>
				<CardContent class="pt-6">
					<div class="text-center py-8">
						<Activity class="size-12 text-muted-foreground mx-auto mb-4" />
						<p class="text-muted-foreground">No market data available</p>
					</div>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { auth, trading } from '$lib/api.js';
	import { account } from '$lib';
	import { Badge } from '$lib/components/ui/badge';
	import { TrendingUp, TrendingDown, DollarSign, Activity } from '@lucide/svelte';
	import PortfolioChart from '$lib/components/PortfolioChart.svelte';
	import type { CoinData, PortfolioData, WSMessage } from '$lib/types.js';

	let coins: CoinData[] = [];
	let portfolio: PortfolioData = {
		cash: 0,
		holdings: {},
		totalValue: 0,
		totalCost: 0,
		totalUnrealizedGain: 0,
		totalUnrealizedGainPercent: 0
	};
	let ws: WebSocket | null = null;

	
	let priceHistory: Record<string, Array<{ date: Date; price: number }>> = {};

	
	let lastPortfolioUpdate = 0;
	const PORTFOLIO_CACHE_DURATION = 5000; 

	
	function getPriceChange(coin: CoinData): { change: number; isPositive: boolean } | null {
		if (!priceHistory[coin.id] || priceHistory[coin.id].length < 2) return null;
		const change =
			((coin.price - priceHistory[coin.id][0].price) / priceHistory[coin.id][0].price) * 100;
		return { change, isPositive: change >= 0 };
	}

	function navigateToCoin(coinId: string) {
		goto(`/$${coinId}`);
	}

	onMount(async () => {
		if (browser && $account.account) {
			loadData();
			connectWebSocket();
		}
	});

	async function loadData() {
		try {
			
			const coinsResponse = await trading.getCoins();
			console.log('Coins response:', coinsResponse);
			if (coinsResponse.success && coinsResponse.coins) {
				coins = coinsResponse.coins || [];

				
				coins.forEach((coin) => {
					if (!priceHistory[coin.id]) {
						priceHistory[coin.id] = [{ date: new Date(coin.lastUpdated), price: coin.price }];
					}
				});
			}

			
			await loadPortfolioData();
		} catch (e) {
			console.error('Failed to load data:', e);
		}
	}

	async function loadPortfolioData() {
		const now = Date.now();
		if (now - lastPortfolioUpdate > PORTFOLIO_CACHE_DURATION) {
			const portfolioResponse = await trading.getPortfolio();
			console.log('Portfolio response:', portfolioResponse);
			if (portfolioResponse.success && portfolioResponse.portfolio) {
				portfolio = portfolioResponse.portfolio || {
					cash: 0,
					holdings: {},
					totalValue: 0,
					totalCost: 0,
					totalUnrealizedGain: 0,
					totalUnrealizedGainPercent: 0
				};
				lastPortfolioUpdate = now;
			}
		}
	}

	function connectWebSocket() {
		if (!browser) return;

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/ws`;

		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			console.log('WebSocket connected');
			
			ws?.send(JSON.stringify({ room: 'trading' }));
		};

		ws.onmessage = (event) => {
			try {
				const message: WSMessage = JSON.parse(event.data);

				if (message.type === 'price_update') {
					
					coins = coins.map((coin) => {
						const newPrice = message.prices[coin.id]?.price || coin.price;
						const newLastUpdated = message.prices[coin.id]?.lastUpdated || coin.lastUpdated;

						
						if (message.prices[coin.id]) {
							if (!priceHistory[coin.id]) {
								priceHistory[coin.id] = [];
							}
							priceHistory[coin.id] = [
								...priceHistory[coin.id],
								{ date: new Date(newLastUpdated), price: newPrice }
							].slice(-50); 
						}

						return {
							...coin,
							price: newPrice,
							lastUpdated: newLastUpdated
						};
					});
				} else if (message.type === 'trade') {
					
					if (
						message.trade.buyerId === $account.account?.username ||
						message.trade.sellerId === $account.account?.username
					) {
						lastPortfolioUpdate = 0; 
						// Force reload portfolio data
						loadPortfolioData();
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

	async function logout() {
		try {
			await auth.logout();
			account.clear();
			if (ws) {
				ws.close();
			}
		} catch (error) {
			console.error('Logout error:', error);
		}
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}

	function formatNumber(num: number, decimals = 6): string {
		return num.toFixed(decimals);
	}

	
	$: coinGridCols = (() => {
		if (coins.length <= 1) return 'grid-cols-1';
		if (coins.length <= 3) return 'grid-cols-2 md:grid-cols-3';
		return 'grid-cols-2 md:grid-cols-3';
	})();
</script>

<svelte:head>
	<title>RealCoin Market</title>
</svelte:head>

{#if $account.account}
	<div class="bg-background">
		
		<div class="border-b border-border">
			<div class="max-w-7xl mx-auto px-6 py-6">
				<div class="grid grid-cols-2 md:grid-cols-4 gap-6">
					<div>
						<div class="text-sm text-muted-foreground">Total Value</div>
						<div class="text-xl font-semibold text-foreground">
							{formatCurrency(portfolio.totalValue)}
						</div>
					</div>
					<div>
						<div class="text-sm text-muted-foreground">Cash</div>
						<div class="text-xl font-semibold text-foreground">
							{formatCurrency(portfolio.cash)}
						</div>
					</div>
					<div>
						<div class="text-sm text-muted-foreground">P&L</div>
						<div
							class="text-xl font-semibold {portfolio.totalUnrealizedGain >= 0
								? 'text-success'
								: 'text-destructive'}"
						>
							{portfolio.totalUnrealizedGain >= 0 ? '+' : ''}{formatCurrency(
								portfolio.totalUnrealizedGain
							)}
						</div>
					</div>
					<div>
						<div class="text-sm text-muted-foreground">Holdings</div>
						<div class="text-xl font-semibold text-foreground">
							{Object.keys(portfolio.holdings).filter((k) => portfolio.holdings[k].amount > 0)
								.length}
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="max-w-7xl mx-auto px-6 py-8">
			<!-- Portfolio Performance Chart -->
			<div class="mb-8">
				<h2 class="text-2xl font-bold text-foreground mb-6">Portfolio Performance</h2>
				<div class="max-w-5xl">
					<PortfolioChart height={250} />
				</div>
			</div>
			
			<div class="mb-8">
				<h2 class="text-2xl font-bold text-foreground mb-6">Available Coins</h2>
				<div class="grid {coinGridCols} gap-4">
					{#each coins as coin}
						{@const priceChange = getPriceChange(coin)}
						{@const holding = portfolio.holdings[coin.id]}
						<button
							on:click={() => navigateToCoin(coin.id)}
							class="border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-all duration-200 text-left group"
						>
							<div class="flex items-start justify-between">
								<div class="flex-1">
									<h3 class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
										{coin.id.toUpperCase()}
									</h3>
									<p class="text-sm text-muted-foreground">{coin.name}</p>
								</div>
								<div class="flex flex-col items-end">
									<div class="text-xl font-bold text-foreground mb-1">
										{formatCurrency(coin.price)}
									</div>
									{#if priceChange}
									<div class="flex items-center gap-1">
										{#if priceChange.isPositive}
											<TrendingUp class="size-4 text-success" />
										{:else}
											<TrendingDown class="size-4 text-destructive" />
										{/if}
										<span
											class="text-sm font-medium {priceChange.isPositive
												? 'text-success'
												: 'text-destructive'}"
										>
											{priceChange.isPositive ? '+' : ''}{priceChange.change.toFixed(2)}%
										</span>
									</div>
								{:else}
									<div class="text-sm text-muted-foreground">No change data</div>
								{/if}
								</div>
								{#if holding && holding.amount > 0}
									<!-- <Badge variant="secondary" class="text-xs">
										Owned
									</Badge> -->
								{/if}
							</div>

							<!-- <div class="mb-4">

								
							</div> -->

							<!-- <div class="space-y-2 text-xs text-muted-foreground">
								<div class="flex items-center gap-2">
									<Activity class="size-3" />
									<span>Vol: {((coin.baseVol || 0) * 100).toFixed(1)}%</span>
								</div>
								<div class="flex items-center gap-2">
									<DollarSign class="size-3" />
									<span>Liquidity: {formatCurrency(coin.liquidity || 0)}</span>
								</div>
								{#if holding && holding.amount > 0}
									<div class="pt-2 border-t border-border">
										<div class="text-foreground font-medium">
											{formatNumber(holding.amount, 4)} {coin.id.toUpperCase()}
										</div>
										<div class="text-muted-foreground">
											Value: {formatCurrency(holding.totalValue)}
										</div>
									</div>
								{/if}
							</div> -->
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-background flex items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-medium text-foreground mb-4">Please log in to access RealCoin</h1>
		</div>
	</div>
{/if}

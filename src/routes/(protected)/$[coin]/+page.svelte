<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { auth, trading } from '$lib/api.js';
	import { account } from '$lib';
	import CoinPriceChart from '$lib/components/CoinPriceChart.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { TrendingUp, TrendingDown, ArrowLeft, DollarSign, Activity } from '@lucide/svelte';
	import type { CoinData, PortfolioData, OrderRequest, TradeData, WSMessage } from '$lib/types.js';

	// Get coin ID from URL params
	$: coinId = ($page.params as any).coin as string;

	let coin: CoinData | null = null;
	let portfolio: PortfolioData = {
		cash: 0,
		holdings: {},
		totalValue: 0,
		totalCost: 0,
		totalUnrealizedGain: 0,
		totalUnrealizedGainPercent: 0
	};
	let priceHistory: Array<{ date: Date; price: number }> = [];
	let recentTrades: TradeData[] = [];
	let ws: WebSocket | null = null;

	// Trading form state
	let orderSide: 'buy' | 'sell' = 'buy';
	let orderAmount = '';
	let loading = false;
	let error = '';

	// Cache management
	let lastPortfolioUpdate = 0;
	const PORTFOLIO_CACHE_DURATION = 5000;

	onMount(async () => {
		if (browser && $account.account) {
			loadData();
			connectWebSocket();
		}
	});

	async function loadData() {
		try {
			// Load coin data
			const coinsResponse = await trading.getCoins();
			if (coinsResponse.success && coinsResponse.coins) {
				coin = coinsResponse.coins.find(c => c.id === coinId) || null;
				if (!coin) {
					// Coin not found, redirect to market
					goto('/market');
					return;
				}
			}

			// Load portfolio
			await loadPortfolioData();

			// Load price history
			if (coin) {
				const historyResponse = await trading.getPriceHistory(coin.id, '15m', 100);
				if (historyResponse.success && historyResponse.history) {
					priceHistory = historyResponse.history.map(h => ({
						date: new Date(h.timestamp * 1000),
						price: h.close
					}));
				}
			}

			// Load recent trades
			const tradesResponse = await trading.getTrades();
			if (tradesResponse.success && tradesResponse.trades) {
				recentTrades = tradesResponse.trades.filter(t => t.coinId === coinId).slice(0, 20);
			}
		} catch (e) {
			console.error('Failed to load data:', e);
		}
	}

	async function loadPortfolioData() {
		const now = Date.now();
		if (now - lastPortfolioUpdate > PORTFOLIO_CACHE_DURATION) {
			const portfolioResponse = await trading.getPortfolio();
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

				if (message.type === 'price_update' && coin) {
					const newPrice = message.prices[coin.id]?.price;
					const newLastUpdated = message.prices[coin.id]?.lastUpdated;

					if (newPrice !== undefined) {
						coin = {
							...coin,
							price: newPrice,
							lastUpdated: newLastUpdated || coin.lastUpdated
						};

						// Update price history
						priceHistory = [
							...priceHistory,
							{ date: new Date(newLastUpdated || Date.now()), price: newPrice }
						].slice(-100);
					}
				} else if (message.type === 'trade') {
					// Add new trade if it's for this coin
					if (message.trade.coinId === coinId) {
						recentTrades = [message.trade, ...recentTrades.slice(0, 19)];
					}

					// Refresh portfolio if user was involved
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

	async function placeOrder() {
		if (!coin || !orderAmount) {
			error = 'Please enter an amount';
			return;
		}

		const amount = parseFloat(orderAmount);
		if (isNaN(amount) || amount <= 0) {
			error = 'Please enter a valid amount';
			return;
		}

		// Validation
		if (orderSide === 'buy') {
			const estimatedCost = amount * coin.price;
			if (portfolio.cash < estimatedCost) {
				error = 'Insufficient cash';
				return;
			}
		} else {
			const currentHolding = portfolio.holdings[coin.id];
			const availableAmount = currentHolding ? currentHolding.amount : 0;
			if (availableAmount < amount) {
				error = 'Insufficient holdings';
				return;
			}
		}

		loading = true;
		error = '';

		try {
			const orderRequest: OrderRequest = {
				coinId: coin.id,
				side: orderSide,
				type: 'market',
				amount
			};

			const response = await trading.placeOrder(orderRequest);

			if (response.success) {
				orderAmount = '';
				// Refresh portfolio
				await loadPortfolioData();
			} else {
				error = response.error || 'Order failed';
			}
		} catch (e) {
			error = 'Network error';
		}

		loading = false;
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

	function getPriceChange(): { change: number; isPositive: boolean } | null {
		if (!priceHistory || priceHistory.length < 2) return null;
		const oldPrice = priceHistory[0].price;
		const currentPrice = coin?.price || 0;
		const change = ((currentPrice - oldPrice) / oldPrice) * 100;
		return { change, isPositive: change >= 0 };
	}
</script>

<svelte:head>
	<title>{coin ? `${coin.id.toUpperCase()} - RealCoin` : 'Loading - RealCoin'}</title>
</svelte:head>

{#if $account.account}
	{#if coin}
		<div class="bg-background">
			<!-- Header -->
			<div class="border-b border-border">
				<div class="max-w-7xl mx-auto px-6 py-6">
					<div class="flex items-center gap-4 mb-6">
						<button
							on:click={() => goto('/market')}
							class="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
						>
							<ArrowLeft class="size-4" />
							<span>Back to Market</span>
						</button>
					</div>

					<div class="flex items-start justify-between">
						<div>
							<h1 class="text-3xl font-bold text-foreground">{coin.name}</h1>
							<div class="flex items-center gap-4 mt-2">
								<p class="text-lg text-muted-foreground">{coin.id.toUpperCase()}</p>
								{#if portfolio}
									{@const holding = portfolio.holdings[coin.id]}
									{#if holding && holding.amount > 0}
										<Badge variant="secondary">Owned</Badge>
									{/if}
								{/if}
							</div>
						</div>
						<div class="text-right">
							<div class="text-4xl font-bold text-foreground">
								{formatCurrency(coin.price)}
							</div>
							{#if priceHistory.length > 1}
								{@const priceChange = getPriceChange()}
								{#if priceChange}
									<div class="flex items-center justify-end gap-2 mt-2">
										{#if priceChange.isPositive}
											<TrendingUp class="size-5 text-success" />
										{:else}
											<TrendingDown class="size-5 text-destructive" />
										{/if}
										<span
											class="text-lg font-medium {priceChange.isPositive
												? 'text-success'
												: 'text-destructive'}"
										>
											{priceChange.isPositive ? '+' : ''}{priceChange.change.toFixed(2)}%
										</span>
									</div>
								{/if}
							{/if}
							<div class="text-sm text-muted-foreground mt-2">
								Last updated: {new Date(coin.lastUpdated).toLocaleTimeString()}
							</div>
						</div>
					</div>

					<!-- Coin Stats -->
					<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
						<div class="flex items-center gap-2">
							<Activity class="size-4 text-muted-foreground" />
							<div>
								<div class="text-sm text-muted-foreground">Volatility</div>
								<div class="font-semibold">{((coin.baseVol || 0) * 100).toFixed(1)}%</div>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<DollarSign class="size-4 text-muted-foreground" />
							<div>
								<div class="text-sm text-muted-foreground">Liquidity</div>
								<div class="font-semibold">{formatCurrency(coin.liquidity || 0)}</div>
							</div>
						</div>
						{#if portfolio}
							{@const holding = portfolio.holdings[coin.id]}
							{#if holding && holding.amount > 0}
								<div>
									<div class="text-sm text-muted-foreground">Your Holdings</div>
									<div class="font-semibold">{formatNumber(holding.amount, 4)} {coin.id.toUpperCase()}</div>
								</div>
								<div>
									<div class="text-sm text-muted-foreground">Position Value</div>
									<div class="font-semibold">{formatCurrency((holding.amount || 0) * coin.price)}</div>
								</div>
							{:else}
								<div class="col-span-2">
									<div class="text-sm text-muted-foreground">Your Holdings</div>
									<div class="font-semibold">None</div>
								</div>
							{/if}
						{:else}
							<div class="col-span-2">
								<div class="text-sm text-muted-foreground">Your Holdings</div>
								<div class="font-semibold">None</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="max-w-7xl mx-auto px-6 py-8">
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
					<!-- Chart and Portfolio Overview -->
					<div class="lg:col-span-2 space-y-6">
						<!-- Price Chart -->
						<div class="border border-border rounded-lg p-6">
							<h3 class="text-lg font-semibold text-foreground mb-4">Price Chart</h3>
							<CoinPriceChart
								{coin}
								{priceHistory}
								height={400}
							/>
						</div>

						<!-- Your Position (if any) -->
						{#if portfolio}
							{@const holding = portfolio.holdings[coin.id]}
							{#if holding && holding.amount > 0}
							<div class="border border-border rounded-lg p-6">
								<h3 class="text-lg font-semibold text-foreground mb-4">Your Position</h3>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
									<div>
										<div class="text-sm text-muted-foreground">Amount</div>
										<div class="text-lg font-semibold">{formatNumber(holding.amount, 6)} {coin.id.toUpperCase()}</div>
									</div>
									<div>
										<div class="text-sm text-muted-foreground">Avg Cost</div>
										<div class="text-lg font-semibold">{formatCurrency(holding.averageCost)}</div>
									</div>
									<div>
										<div class="text-sm text-muted-foreground">Current Value</div>
										<div class="text-lg font-semibold">{formatCurrency(holding.totalValue)}</div>
									</div>
									<div>
										<div class="text-sm text-muted-foreground">P&L</div>
										<div class="text-lg font-semibold {holding.unrealizedGain >= 0 ? 'text-success' : 'text-destructive'}">
											{holding.unrealizedGain >= 0 ? '+' : ''}{formatCurrency(holding.unrealizedGain)}
										</div>
										<div class="text-sm {holding.unrealizedGainPercent >= 0 ? 'text-success' : 'text-destructive'}">
											{holding.unrealizedGainPercent >= 0 ? '+' : ''}{holding.unrealizedGainPercent.toFixed(2)}%
										</div>
									</div>
								</div>
							</div>
							{/if}
						{/if}

						<!-- Recent Trades -->
						<div class="border border-border rounded-lg">
							<div class="p-4 border-b border-border">
								<h3 class="text-lg font-semibold text-foreground">Recent Trades</h3>
							</div>
							<div class="overflow-x-auto">
								<table class="min-w-full">
									<thead class="bg-muted/30">
										<tr>
											<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Price</th>
											<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
											<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Value</th>
											<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
											<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-border">
										{#each recentTrades as trade}
											<tr class="hover:bg-muted/20">
												<td class="px-4 py-3 text-sm text-foreground">
													{formatCurrency(trade.price)}
												</td>
												<td class="px-4 py-3 text-sm text-foreground">
													{formatNumber(trade.amount, 4)}
												</td>
												<td class="px-4 py-3 text-sm text-foreground">
													{formatCurrency(trade.price * trade.amount)}
												</td>
												<td class="px-4 py-3 text-sm text-muted-foreground">
													{new Date(trade.timestamp).toLocaleTimeString()}
												</td>
												<td class="px-4 py-3">
													{#if trade.buyerId?.startsWith('bot-') || trade.sellerId?.startsWith('bot-')}
														<Badge variant="outline">Bot</Badge>
													{:else}
														<Badge variant="secondary">User</Badge>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
								{#if recentTrades.length === 0}
									<div class="text-center py-8 text-muted-foreground text-sm">
										No recent trades for this coin
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Trading Panel -->
					<div class="lg:col-span-1">
						<div class="sticky top-8 space-y-4">
							<!-- Trading Form -->
							<div class="border border-border rounded-lg p-6">
								<h3 class="text-lg font-semibold text-foreground mb-4">
									Trade {coin.id.toUpperCase()}
								</h3>

								<!-- Buy/Sell Toggle -->
								<div class="flex mb-4 bg-muted/30 rounded-md p-1">
									<button
										on:click={() => (orderSide = 'buy')}
										class="flex-1 py-2 px-3 rounded text-sm font-medium transition-colors {orderSide === 'buy'
											? 'bg-success text-success-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
									>
										Buy
									</button>
									<button
										on:click={() => (orderSide = 'sell')}
										class="flex-1 py-2 px-3 rounded text-sm font-medium transition-colors {orderSide === 'sell'
											? 'bg-destructive text-white'
											: 'text-muted-foreground hover:text-foreground'}"
									>
										Sell
									</button>
								</div>

								<!-- Amount Input -->
								<div class="mb-4">
									<label for="orderAmount" class="block text-sm font-medium text-foreground mb-2">
										Amount
									</label>
									<input
										id="orderAmount"
										type="number"
										step="0.000001"
										bind:value={orderAmount}
										class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
										placeholder="0.000000"
									/>
									{#if orderAmount}
										<div class="mt-2 p-2 bg-muted/30 rounded text-xs">
											<div class="flex justify-between text-muted-foreground">
												<span>Total:</span>
												<span class="font-medium text-foreground">
													{formatCurrency(parseFloat(orderAmount) * coin.price)}
												</span>
											</div>
										</div>
									{/if}

									{#if orderSide === 'buy'}
										<div class="text-xs text-muted-foreground mt-1">
											Available: {formatCurrency(portfolio.cash)}
										</div>
									{:else}
										{@const holding = portfolio.holdings[coin.id]}
										<div class="text-xs text-muted-foreground mt-1">
											Available: {holding ? formatNumber(holding.amount, 6) : '0.000000'} {coin.id.toUpperCase()}
										</div>
									{/if}
								</div>

								{#if error}
									<div class="mb-4 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
										{error}
									</div>
								{/if}

								<button
									on:click={placeOrder}
									disabled={loading || !orderAmount}
									class="w-full py-2 px-4 rounded-md font-medium transition-colors disabled:opacity-50 {orderSide === 'buy'
										? 'bg-success hover:bg-success/90 text-success-foreground'
										: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}"
								>
									{loading ? 'Processing...' : `${orderSide.toUpperCase()} ${coin.id.toUpperCase()}`}
								</button>
							</div>

							<!-- Portfolio Summary -->
							<div class="border border-border rounded-lg p-6">
								<h3 class="text-lg font-semibold text-foreground mb-4">Portfolio Summary</h3>
								<div class="space-y-3">
									<div class="flex justify-between">
										<span class="text-muted-foreground">Total Value</span>
										<span class="font-medium">{formatCurrency(portfolio.totalValue)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-muted-foreground">Cash</span>
										<span class="font-medium">{formatCurrency(portfolio.cash)}</span>
									</div>
									<div class="flex justify-between pt-3 border-t border-border">
										<span class="text-muted-foreground">Total P&L</span>
										<span class="font-medium {portfolio.totalUnrealizedGain >= 0 ? 'text-success' : 'text-destructive'}">
											{portfolio.totalUnrealizedGain >= 0 ? '+' : ''}{formatCurrency(portfolio.totalUnrealizedGain)}
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="min-h-screen bg-background flex items-center justify-center">
			<div class="text-center">
				<h1 class="text-2xl font-medium text-foreground mb-4">Loading coin data...</h1>
			</div>
		</div>
	{/if}
{:else}
	<div class="min-h-screen bg-background flex items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-medium text-foreground mb-4">Please log in to access RealCoin</h1>
		</div>
	</div>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { auth, trading } from '$lib/api.js';
	import { account } from '$lib';
	import CoinPriceChart from '$lib/components/CoinPriceChart.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { TrendingUp, TrendingDown } from '@lucide/svelte';
	import type { CoinData, PortfolioData, OrderRequest, TradeData, WSMessage } from '$lib/types.js';

	let coins: CoinData[] = [];
	let portfolio: PortfolioData = {
		cash: 0,
		holdings: {},
		totalValue: 0,
		totalCost: 0,
		totalUnrealizedGain: 0,
		totalUnrealizedGainPercent: 0
	};
	let recentTrades: TradeData[] = [];
	let ws: WebSocket | null = null;

	let selectedCoin: CoinData | null = null;
	let selectedCoinId: string = '';
	let orderSide: 'buy' | 'sell' = 'buy';
	let orderAmount = '';
	let loading = false;
	let error = '';

	
	let priceHistory: Record<string, Array<{ date: Date; price: number }>> = {};

	
	let lastPortfolioUpdate = 0;
	let lastTradesUpdate = 0;
	const PORTFOLIO_CACHE_DURATION = 5000; 
	const TRADES_CACHE_DURATION = 3000; 

	
	$: if (selectedCoinId) {
		selectedCoin = coins.find((coin) => coin.id === selectedCoinId) || null;
	}

	
	function getPriceChange(coin: CoinData): { change: number; isPositive: boolean } | null {
		if (!priceHistory[coin.id] || priceHistory[coin.id].length < 2) return null;
		const change =
			((coin.price - priceHistory[coin.id][0].price) / priceHistory[coin.id][0].price) * 100;
		return { change, isPositive: change >= 0 };
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

				
				if (coins.length > 0 && !selectedCoinId) {
					selectedCoinId = coins[0].id;
				}
			}

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

			
			if (now - lastTradesUpdate > TRADES_CACHE_DURATION) {
				const tradesResponse = await trading.getTrades();
				console.log('Trades response:', tradesResponse);
				if (tradesResponse.success && tradesResponse.trades) {
					recentTrades = tradesResponse.trades || [];
					lastTradesUpdate = now;
				}
			}
		} catch (e) {
			console.error('Failed to load data:', e);
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

					
					if (selectedCoin && message.prices[selectedCoin.id]) {
						selectedCoin = {
							...selectedCoin,
							price: message.prices[selectedCoin.id].price,
							lastUpdated: message.prices[selectedCoin.id].lastUpdated
						};
					}
				} else if (message.type === 'trade') {
					
					recentTrades = [message.trade, ...recentTrades.slice(0, 49)];
					lastTradesUpdate = Date.now(); 

					
					if (
						message.trade.buyerId === $account.account?.username ||
						message.trade.sellerId === $account.account?.username
					) {
						lastPortfolioUpdate = 0; 
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
		if (!selectedCoin || !orderAmount) {
			error = 'Please select a coin and enter an amount';
			return;
		}

		const amount = parseFloat(orderAmount);
		if (isNaN(amount) || amount <= 0) {
			error = 'Please enter a valid amount';
			return;
		}

		
		if (orderSide === 'buy') {
			const estimatedCost = amount * selectedCoin.price;
			if (portfolio.cash < estimatedCost) {
				error = 'Insufficient cash';
				return;
			}
		} else {
			const currentHolding = portfolio.holdings[selectedCoin.id];
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
				coinId: selectedCoin.id,
				side: orderSide,
				type: 'market',
				amount
			};

			const response = await trading.placeOrder(orderRequest);

			if (response.success) {
				orderAmount = '';
				
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
				}
			} else {
				error = response.error || 'Order failed';
			}
		} catch (e) {
			error = 'Network error';
		}

		loading = false;
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
		if (coins.length <= 2) return 'grid-cols-1 md:grid-cols-2';
		if (coins.length <= 3) return 'grid-cols-2 md:grid-cols-3';
		if (coins.length <= 4) return 'grid-cols-2 md:grid-cols-4';
		if (coins.length <= 6) return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
		if (coins.length <= 8) return 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';
		
		return 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';
	})();
</script>

<svelte:head>
	<title>RealCoin Trading</title>
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
			
			<div class="mb-8">
				<h2 class="text-lg font-semibold text-foreground mb-4">Select Coin to Trade</h2>
				<div class="max-w-md h-9">
					<Select.Root type="single" bind:value={() => selectedCoinId, (v) => (selectedCoinId = v)}>
						<Select.Trigger class="w-full" size="lg">
							
							{@const coin = coins.find((c) => c.id === selectedCoinId) || null}
							{#if coin}
								{@const priceChange = getPriceChange(coin)}
									<div class="flex items-center justify-between w-full">
										<div class="flex items-center gap-3">
											<div>
												<div class="font-medium">{coin.id.toUpperCase()}</div>
												<div class="text-xs text-muted-foreground">{coin.name}</div>
											</div>
										</div>
										<div class="flex items-center gap-2">
											<div class="text-right">
												<div class="font-semibold">{formatCurrency(coin.price)}</div>
												{#if priceChange}
													<div class="flex items-center gap-1">
														{#if priceChange.isPositive}
															<TrendingUp class="size-3 text-success" />
														{:else}
															<TrendingDown class="size-3 text-destructive" />
														{/if}
														<span
															class="text-xs {priceChange.isPositive
																? 'text-success'
																: 'text-destructive'}"
														>
															{priceChange.isPositive ? '+' : ''}{priceChange.change.toFixed(2)}%
														</span>
													</div>
												{/if}
											</div>
										</div>
									</div>
							{/if}
						</Select.Trigger>
						<Select.Content>
							{#each coins as coin}
								{@const priceChange = getPriceChange(coin)}
								<Select.Item value={coin.id} class="cursor-pointer">
									<div class="flex items-center justify-between w-full">
										<div class="flex items-center gap-3">
											<div>
												<div class="font-medium">{coin.id.toUpperCase()}</div>
												<div class="text-xs text-muted-foreground">{coin.name}</div>
											</div>
										</div>
										<div class="flex items-center gap-2">
											<div class="text-right">
												<div class="font-semibold">{formatCurrency(coin.price)}</div>
												{#if priceChange}
													<div class="flex items-center gap-1">
														{#if priceChange.isPositive}
															<TrendingUp class="size-3 text-success" />
														{:else}
															<TrendingDown class="size-3 text-destructive" />
														{/if}
														<span
															class="text-xs {priceChange.isPositive
																? 'text-success'
																: 'text-destructive'}"
														>
															{priceChange.isPositive ? '+' : ''}{priceChange.change.toFixed(2)}%
														</span>
													</div>
												{/if}
											</div>
										</div>
									</div>
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			
			{#if Object.keys(portfolio.holdings).filter((k) => portfolio.holdings[k].amount > 0).length > 0}
				<div class="mb-8">
					<h2 class="text-lg font-semibold text-foreground mb-4">Your Holdings</h2>
					<div class="border border-border rounded-lg overflow-hidden">
						<div class="overflow-x-auto">
							<table class="min-w-full">
								<thead class="bg-muted/30">
									<tr>
										<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
											>Coin</th
										>
										<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground"
											>Amount</th
										>
										<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground"
											>Avg Cost</th
										>
										<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground"
											>Current</th
										>
										<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground"
											>Value</th
										>
										<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground"
											>P&L</th
										>
										<th class="px-4 py-3 text-center text-xs font-medium text-muted-foreground"
											>Action</th
										>
									</tr>
								</thead>
								<tbody class="divide-y divide-border">
									{#each Object.entries(portfolio.holdings).filter(([_, holding]) => holding.amount > 0) as [coinId, holding]}
										{@const currentCoin = coins.find((c) => c.id === coinId)}
										<tr class="hover:bg-muted/20">
											<td class="px-4 py-3">
												<div class="font-medium text-foreground">{coinId.toUpperCase()}</div>
												<div class="text-xs text-muted-foreground">
													{currentCoin?.name || 'Unknown'}
												</div>
											</td>
											<td class="px-4 py-3 text-right text-sm text-foreground">
												{formatNumber(holding.amount, 4)}
											</td>
											<td class="px-4 py-3 text-right text-sm text-foreground">
												{formatCurrency(holding.averageCost)}
											</td>
											<td class="px-4 py-3 text-right text-sm text-foreground">
												{formatCurrency(currentCoin?.price || 0)}
											</td>
											<td class="px-4 py-3 text-right text-sm font-medium text-foreground">
												{formatCurrency(holding.totalValue)}
											</td>
											<td class="px-4 py-3 text-right">
												<div
													class="text-sm font-medium {holding.unrealizedGain >= 0
														? 'text-success'
														: 'text-destructive'}"
												>
													{holding.unrealizedGain >= 0 ? '+' : ''}{formatCurrency(
														holding.unrealizedGain
													)}
												</div>
												<div
													class="text-xs {holding.unrealizedGainPercent >= 0
														? 'text-success'
														: 'text-destructive'}"
												>
													{holding.unrealizedGainPercent >= 0
														? '+'
														: ''}{holding.unrealizedGainPercent.toFixed(2)}%
												</div>
											</td>
											<td class="px-4 py-3 text-center">
												<button
													on:click={() => (selectedCoinId = coinId)}
													class="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
												>
													Trade
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			{#if selectedCoin}
				
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
					
					<div class="lg:col-span-2">
						<div class="border border-border rounded-lg p-6">
							<div class="flex justify-between items-center mb-6">
								<div>
									<h3 class="text-lg font-semibold text-foreground">{selectedCoin.name}</h3>
									<p class="text-sm text-muted-foreground">{selectedCoin.id.toUpperCase()}</p>
								</div>
								<div class="text-right">
									<div class="text-2xl font-bold text-foreground">
										{formatCurrency(selectedCoin.price)}
									</div>
									<div class="text-xs text-muted-foreground">
										Last updated: {new Date(selectedCoin.lastUpdated).toLocaleTimeString()}
									</div>
								</div>
							</div>
							<CoinPriceChart
								coin={selectedCoin}
								priceHistory={priceHistory[selectedCoin.id] || []}
								height={300}
							/>
						</div>
					</div>

					
					<div class="lg:col-span-1 space-y-4">
						<div class="border border-border rounded-lg p-4">
							<h3 class="text-base font-semibold text-foreground mb-4">
								Trade {selectedCoin.id.toUpperCase()}
							</h3>

							
							<div class="flex mb-4 bg-muted/30 rounded-md p-1">
								<button
									on:click={() => (orderSide = 'buy')}
									class="flex-1 py-2 px-3 rounded text-sm font-medium transition-colors {orderSide ===
									'buy'
										? 'bg-success text-success-foreground'
										: 'text-muted-foreground hover:text-foreground'}"
								>
									Buy
								</button>
								<button
									on:click={() => (orderSide = 'sell')}
									class="flex-1 py-2 px-3 rounded text-sm font-medium transition-colors {orderSide ===
									'sell'
										? 'bg-destructive text-white'
										: 'text-muted-foreground hover:text-foreground'}"
								>
									Sell
								</button>
							</div>

							
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
											<span class="font-medium text-foreground"
												>{formatCurrency(parseFloat(orderAmount) * selectedCoin.price)}</span
											>
										</div>
									</div>
								{/if}

								{#if orderSide === 'buy'}
									<div class="text-xs text-muted-foreground mt-1">
										Available: {formatCurrency(portfolio.cash)}
									</div>
								{:else}
									{@const holding = portfolio.holdings[selectedCoin.id]}
									<div class="text-xs text-muted-foreground mt-1">
										Available: {holding ? formatNumber(holding.amount, 6) : '0.000000'}
										{selectedCoin.id.toUpperCase()}
									</div>
								{/if}
							</div>

							{#if error}
								<div
									class="mb-4 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive"
								>
									{error}
								</div>
							{/if}

							<button
								on:click={placeOrder}
								disabled={loading || !orderAmount}
								class="w-full py-2 px-4 rounded-md font-medium transition-colors disabled:opacity-50 {orderSide ===
								'buy'
									? 'bg-success hover:bg-success/90 text-success-foreground'
									: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}"
							>
								{loading
									? 'Processing...'
									: `${orderSide.toUpperCase()} ${selectedCoin.id.toUpperCase()}`}
							</button>
						</div>

						
						{#if portfolio.holdings[selectedCoin.id] && portfolio.holdings[selectedCoin.id].amount > 0}
							{@const holding = portfolio.holdings[selectedCoin.id]}
							<div class="border border-border rounded-lg p-4">
								<h4 class="font-medium text-foreground mb-3">Your Position</h4>
								<div class="space-y-2 text-sm">
									<div class="flex justify-between">
										<span class="text-muted-foreground">Amount:</span>
										<span class="font-medium"
											>{formatNumber(holding.amount, 6)} {selectedCoin.id.toUpperCase()}</span
										>
									</div>
									<div class="flex justify-between">
										<span class="text-muted-foreground">Avg Cost:</span>
										<span class="font-medium">{formatCurrency(holding.averageCost)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-muted-foreground">Value:</span>
										<span class="font-medium">{formatCurrency(holding.totalValue)}</span>
									</div>
									<div class="flex justify-between pt-2 border-t border-border">
										<span class="text-muted-foreground">P&L:</span>
										<div class="text-right">
											<div
												class="font-medium {holding.unrealizedGain >= 0
													? 'text-success'
													: 'text-destructive'}"
											>
												{holding.unrealizedGain >= 0 ? '+' : ''}{formatCurrency(
													holding.unrealizedGain
												)}
											</div>
											<div
												class="text-xs {holding.unrealizedGainPercent >= 0
													? 'text-success'
													: 'text-destructive'}"
											>
												{holding.unrealizedGainPercent >= 0
													? '+'
													: ''}{holding.unrealizedGainPercent.toFixed(2)}%
											</div>
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			
			<div class="border border-border rounded-lg">
				<div class="p-4 border-b border-border">
					<h3 class="text-lg font-semibold text-foreground">Recent Market Activity</h3>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full">
						<thead class="bg-muted/30">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Coin</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Price</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th
								>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Value</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each recentTrades as trade}
								<tr class="hover:bg-muted/20">
									<td class="px-4 py-3">
										<div class="font-medium text-foreground">{trade.coinId.toUpperCase()}</div>
									</td>
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
											<span
												class="inline-flex px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground"
											>
												Bot
											</span>
										{:else}
											<span
												class="inline-flex px-2 py-1 text-xs rounded-full bg-primary/10 text-primary"
											>
												User
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if recentTrades.length === 0}
						<div class="text-center py-8 text-muted-foreground text-sm">
							No recent trades to display
						</div>
					{/if}
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

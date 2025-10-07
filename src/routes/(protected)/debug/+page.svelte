<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { trading } from '$lib/api.js';
	import { account } from '$lib/stores/auth.js';
	import CoinPriceChart from '$lib/components/CoinPriceChart.svelte';
	import type { CoinData, TradeData, WSMessage } from '$lib/types.js';
	
	let coins: CoinData[] = [];
	let trades: TradeData[] = [];
	let ws: WebSocket | null = null;
	let connected = false;
	
	
	let priceHistory: Record<string, number[]> = {};
	
	
	let botTrades: TradeData[] = [];
	let botStats: Record<string, { trades: number; volume: number }> = {};
	
	
	let bots: any[] = [];
	let selectedBot: any = null;

	
	let selectedTimeframe = '15m';
	const timeframes = [
		{ value: '5m', label: '5 minutes', points: 10 },
		{ value: '15m', label: '15 minutes', points: 30 },
		{ value: '1h', label: '1 hour', points: 60 },
		{ value: '4h', label: '4 hours', points: 120 },
		{ value: '24h', label: '24 hours', points: 240 }
	];

	onMount(() => {
		if (browser) {
			loadData();
			connectWebSocket();
		}
	});

	async function loadData() {
		try {
			
			const coinsResponse = await trading.getCoins();
			if (coinsResponse.success && coinsResponse.coins) {
				coins = coinsResponse.coins || [];
				
				
				coins.forEach(coin => {
					if (!priceHistory[coin.id]) {
						priceHistory[coin.id] = [coin.price];
					}
				});
			}

			
			const tradesResponse = await trading.getTrades();
			if (tradesResponse.success && tradesResponse.trades) {
				trades = tradesResponse.trades || [];
				
				
				botTrades = trades.filter(trade => 
					trade.buyerId.startsWith('bot-') || trade.sellerId.startsWith('bot-')
				);
				
				calculateBotStats();
			}

			
			const botsResponse = await trading.getBots();
			if (botsResponse.success && botsResponse.bots) {
				bots = botsResponse.bots || [];
			}
		} catch (e) {
			console.error('Failed to load data:', e);
		}
	}

	function calculateBotStats() {
		botStats = {};
		
		botTrades.forEach(trade => {
			const botId = trade.buyerId.startsWith('bot-') ? trade.buyerId : trade.sellerId;
			
			if (!botStats[botId]) {
				botStats[botId] = { trades: 0, volume: 0 };
			}
			
			botStats[botId].trades++;
			botStats[botId].volume += trade.price * trade.amount;
		});
	}

	function connectWebSocket() {
		if (!browser) return;
		
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/ws`;
		
		ws = new WebSocket(wsUrl);
		
		ws.onopen = () => {
			console.log('WebSocket connected');
			connected = true;
			
			ws?.send(JSON.stringify({ room: 'debug' }));
		};
		
		ws.onmessage = (event) => {
			try {
				const message: WSMessage = JSON.parse(event.data);
				
				if (message.type === 'price_update') {
					
					coins = coins.map(coin => {
						if (message.prices[coin.id]) {
							const newPrice = message.prices[coin.id].price;
							
							
							if (!priceHistory[coin.id]) {
								priceHistory[coin.id] = [];
							}
							priceHistory[coin.id] = [...priceHistory[coin.id], newPrice].slice(-50);
							
							return {
								...coin,
								price: newPrice,
								lastUpdated: message.prices[coin.id].lastUpdated
							};
						}
						return coin;
					});
				} else if (message.type === 'trade') {
					
					trades = [message.trade, ...trades.slice(0, 99)];
					
					
					if (message.trade.buyerId.startsWith('bot-') || message.trade.sellerId.startsWith('bot-')) {
						botTrades = [message.trade, ...botTrades.slice(0, 49)];
						calculateBotStats();
					}
				}
			} catch (e) {
				console.error('WebSocket message error:', e);
			}
		};
		
		ws.onclose = () => {
			console.log('WebSocket disconnected');
			connected = false;
			
			setTimeout(connectWebSocket, 3000);
		};
		
		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
			connected = false;
		};
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

	function getPriceChange(coinId: string): { percent: number; direction: 'up' | 'down' | 'neutral' } {
		const history = priceHistory[coinId];
		if (!history || history.length < 2) {
			return { percent: 0, direction: 'neutral' };
		}
		
		const current = history[history.length - 1];
		const previous = history[history.length - 2];
		const percent = ((current - previous) / previous) * 100;
		
		return {
			percent: Math.abs(percent),
			direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'neutral'
		};
	}

	function getChartHistory(coinId: string, botHistory?: number[]): Array<{ date: Date; price: number }> {
		const history = botHistory || priceHistory[coinId];
		if (!history || history.length < 2) return [];
		
		
		const timeframeConfig = timeframes.find(tf => tf.value === selectedTimeframe);
		const maxPoints = timeframeConfig?.points || 30;
		
		
		const limitedHistory = history.slice(-maxPoints);
		
		
		return limitedHistory.map((price, index) => ({
			date: new Date(Date.now() - (limitedHistory.length - index) * 60000), 
			price: price
		}));
	}

	function getBotType(botId: string): string {
		const parts = botId.split('-');
		return parts[1] || 'unknown';
	}

	function getBotColor(botType: string): string {
		const colors: Record<string, string> = {
			
			drunk: 'bg-purple-100 text-purple-800',
			momentum: 'bg-primary/10 text-primary',
			meanReverter: 'bg-success/10 text-success-foreground',
			whale: 'bg-destructive/10 text-destructive',
			frontRunner: 'bg-yellow-100 text-yellow-800',
			copycat: 'bg-pink-100 text-pink-800',
			
			'momentum-maxine': 'bg-primary/10 text-primary',
			'mean-revertor-marvin': 'bg-success/10 text-success-foreground',
			'whale-wendy': 'bg-destructive/10 text-destructive',
			'pattern-prophet': 'bg-purple-100 text-purple-800',
			'stoploss-steve': 'bg-orange-100 text-orange-800',
			'copycat-carla': 'bg-pink-100 text-pink-800',
			'contrarian-carl': 'bg-indigo-100 text-indigo-800',
			'fomo-fiona': 'bg-yellow-100 text-yellow-800',
			'longterm-larry': 'bg-emerald-100 text-emerald-800',
			'ape-alex': 'bg-lime-100 text-lime-800',
			'quant-quinn': 'bg-cyan-100 text-cyan-800',
			'arbitrage-arnie': 'bg-teal-100 text-teal-800',
			'influencer-izzy': 'bg-rose-100 text-rose-800',
			'doom-daniel': 'bg-slate-100 text-slate-800'
		};
		return colors[botType] || 'bg-muted/50 text-foreground';
	}

	
	$: coinGridCols = (() => {
		if (coins.length <= 2) return 'grid-cols-1 md:grid-cols-2';
		if (coins.length <= 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
		if (coins.length <= 6) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
		
		return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
	})();

	$: botStatsGridCols = (() => {
		const statsCount = Object.keys(botStats).length;
		if (statsCount <= 2) return 'grid-cols-1 md:grid-cols-2';
		if (statsCount <= 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
		if (statsCount <= 8) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
		
		return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
	})();

	$: botsGridCols = (() => {
		if (bots.length <= 2) return 'grid-cols-1 md:grid-cols-2';
		if (bots.length <= 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
		if (bots.length <= 8) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
		if (bots.length <= 16) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
		
		return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
	})();


</script>

<svelte:head>
	<title>Debug - RealCoin</title>
</svelte:head>

{#if $account.account}
	<div class="min-h-screen bg-background">
		
		<div class="bg-card shadow-sm border-b">
			<div class="max-w-7xl mx-auto px-4 py-4">
				<div class="flex items-center justify-between">
					<h1 class="text-3xl font-bold text-foreground">Debug Dashboard</h1>
					<div class="flex items-center space-x-3">
						
						<div class="flex items-center space-x-2">
							<span class="text-sm font-medium text-muted-foreground">Timeframe:</span>
							<select 
								bind:value={selectedTimeframe}
								class="px-3 py-1 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
							>
								{#each timeframes as timeframe}
									<option value={timeframe.value}>{timeframe.label}</option>
								{/each}
							</select>
						</div>
						<div class="flex items-center space-x-2">
							<div class="w-3 h-3 rounded-full {connected ? 'bg-green-400' : 'bg-red-400'}"></div>
							<span class="text-sm font-medium {connected ? 'text-success' : 'text-destructive'}">
								{connected ? 'Connected' : 'Disconnected'}
							</span>
						</div>
						<div class="text-sm text-muted-foreground">
							{bots.length} Bots Active
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="max-w-7xl mx-auto px-4 py-6 space-y-8">
			
			<div class="bg-card rounded-xl shadow-sm">
				<div class="p-6 border-b border-border">
					<h2 class="text-xl font-bold text-foreground">Market Overview</h2>
				</div>
				<div class="p-6">
					<div class="grid {coinGridCols} gap-6">
						{#each coins as coin}
							{@const change = getPriceChange(coin.id)}
							<div class="bg-background rounded-lg p-4 hover:bg-muted/50 transition-colors">
								<div class="flex justify-between items-start mb-3">
									<div>
										<h3 class="font-bold text-foreground">{coin.name}</h3>
										<p class="text-sm text-muted-foreground">{coin.id}</p>
									</div>
									<div class="text-right">
										<div class="text-xl font-bold text-foreground">{formatCurrency(coin.price)}</div>
										{#if change.direction !== 'neutral'}
											<div class="text-sm font-medium {change.direction === 'up' ? 'text-success' : 'text-destructive'}">
												{change.direction === 'up' ? '↗' : '↘'} {change.percent.toFixed(2)}%
											</div>
										{/if}
									</div>
								</div>
								
								
								<div class="bg-card rounded">
									<CoinPriceChart 
										coin={coin} 
										priceHistory={getChartHistory(coin.id)}
										height={120}
										showFooter={false}
										hideTimeframeSelector={true}
									/>
								</div>
								
								<div class="text-xs text-muted-foreground mt-2">
									Updated: {new Date(coin.lastUpdated).toLocaleTimeString()}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

		
		<div class="bg-card rounded-lg shadow">
			<div class="p-6 border-b">
				<h2 class="text-xl font-semibold">Bot Activity</h2>
			</div>
			<div class="p-6">
				<div class="grid {botStatsGridCols} gap-4 mb-6">
					{#each Object.entries(botStats) as [botId, stats]}
						{@const botType = getBotType(botId)}
						<div class="border rounded-lg p-4">
							<div class="flex items-center justify-between mb-2">
								<span class="font-medium text-sm">{botId}</span>
								<span class="px-2 py-1 rounded-full text-xs {getBotColor(botType)}">
									{botType}
								</span>
							</div>
							<div class="space-y-1 text-sm">
								<div class="flex justify-between">
									<span class="text-muted-foreground">Trades:</span>
									<span class="font-semibold">{stats.trades}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-muted-foreground">Volume:</span>
									<span class="font-semibold">{formatCurrency(stats.volume)}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
				
				
				<div>
					<h3 class="font-semibold mb-4">Recent Bot Trades</h3>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b">
									<th class="text-left py-2">Bot</th>
									<th class="text-left py-2">Type</th>
									<th class="text-left py-2">Coin</th>
									<th class="text-left py-2">Side</th>
									<th class="text-left py-2">Price</th>
									<th class="text-left py-2">Amount</th>
									<th class="text-left py-2">Time</th>
								</tr>
							</thead>
							<tbody>
								{#each botTrades as trade}
									{@const botId = trade.buyerId.startsWith('bot-') ? trade.buyerId : trade.sellerId}
									{@const side = trade.buyerId.startsWith('bot-') ? 'buy' : 'sell'}
									{@const botType = getBotType(botId)}
									<tr class="border-b">
										<td class="py-2">{botId}</td>
										<td class="py-2">
											<span class="px-2 py-1 rounded-full text-xs {getBotColor(botType)}">
												{botType}
											</span>
										</td>
										<td class="py-2">{trade.coinId}</td>
										<td class="py-2">
											<span class="px-2 py-1 rounded text-xs {side === 'buy' ? 'bg-success/10 text-success-foreground' : 'bg-destructive/10 text-destructive'}">
												{side.toUpperCase()}
											</span>
										</td>
										<td class="py-2">{formatCurrency(trade.price)}</td>
										<td class="py-2">{formatNumber(trade.amount)}</td>
										<td class="py-2">{new Date(trade.timestamp).toLocaleTimeString()}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if botTrades.length === 0}
							<p class="text-muted-foreground text-center py-4">No bot trades yet</p>
						{/if}
					</div>
				</div>
			</div>
		</div>

			
			<div class="bg-card rounded-xl shadow-sm">
				<div class="p-6 border-b border-border">
					<div class="flex justify-between items-center">
						<h2 class="text-xl font-bold text-foreground">Trading Bots</h2>
						<div class="text-sm text-muted-foreground">
							{bots.filter(b => b.enabled).length} active / {bots.length} total
						</div>
					</div>
				</div>
				<div class="p-6">
					<div class="grid {botsGridCols} gap-4">
						{#each bots as bot}
							<div class="bg-background rounded-lg p-4 hover:bg-muted/50 transition-colors">
								
								<div class="flex items-start justify-between mb-3">
									<div class="flex-1">
										<h3 class="font-bold text-foreground text-sm truncate">{bot.id}</h3>
										<p class="text-xs text-muted-foreground">{bot.traits?.name || bot.personality}</p>
									</div>
									<div class="flex items-center space-x-1 ml-2">
										<span class="px-2 py-1 rounded-full text-xs {getBotColor(bot.personality)} whitespace-nowrap">
											{bot.personality.split('-')[0]}
										</span>
										<div class="w-2 h-2 rounded-full {bot.enabled ? 'bg-green-400' : 'bg-red-400'}"></div>
									</div>
								</div>

								
								<div class="mb-3">
									<div class="text-lg font-bold text-foreground">{formatCurrency(bot.portfolio.totalValue)}</div>
									<div class="text-xs text-muted-foreground">
										Cash: {formatCurrency(bot.portfolio.cash)} • 
										Holdings: {Object.keys(bot.portfolio.holdings).length}
									</div>
								</div>

								
								<div class="mb-3">
									<div class="text-xs text-muted-foreground mb-1">
										<span class="font-medium">Target:</span> {bot.targetCoin}
									</div>
									<div class="text-xs text-muted-foreground">
										<span class="font-medium">Watching:</span> {bot.watchedCoins.join(', ')}
									</div>
								</div>

								{#if bot.traits}
									
									<div class="mb-3">
										<div class="flex justify-between text-xs text-muted-foreground mb-1">
											<span>Risk: {bot.traits.riskTolerance}</span>
											<span>{bot.traits.frequency}/min</span>
										</div>
										<div class="w-full bg-muted rounded-full h-1">
											<div class="bg-primary/50 h-1 rounded-full" style="width: {bot.traits.positionSizing * 100}%"></div>
										</div>
									</div>
								{/if}

								
								<div class="text-xs text-muted-foreground border-t pt-2">
									{new Date(bot.lastAction).toLocaleString()}
								</div>

								
								<button 
									class="w-full mt-2 text-xs bg-card text-foreground py-2 rounded border hover:bg-background transition-colors"
									on:click={() => selectedBot = selectedBot?.id === bot.id ? null : bot}
								>
									{selectedBot?.id === bot.id ? 'Hide' : 'Details'}
								</button>
							</div>
						{/each}
					</div>

					
					{#if selectedBot}
						<div class="mt-8 p-6 bg-background rounded-lg">
							<div class="flex justify-between items-center mb-6">
								<h3 class="text-xl font-bold text-foreground">{selectedBot.id}</h3>
								<button 
									class="text-muted-foreground hover:text-muted-foreground"
									on:click={() => selectedBot = null}
									aria-label="Close bot details"
								>
									<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
									</svg>
								</button>
							</div>
							
							<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
								
								<div class="space-y-6">
									<div>
										<h4 class="font-semibold text-foreground mb-3">Portfolio Details</h4>
										<div class="bg-card rounded-lg p-4 space-y-3">
											<div class="flex justify-between">
												<span class="text-muted-foreground">Total Value:</span>
												<span class="font-bold text-foreground">{formatCurrency(selectedBot.portfolio.totalValue)}</span>
											</div>
											<div class="flex justify-between">
												<span class="text-muted-foreground">Cash:</span>
												<span class="font-medium">{formatCurrency(selectedBot.portfolio.cash)}</span>
											</div>
											<div class="flex justify-between">
												<span class="text-muted-foreground">Holdings Value:</span>
												<span class="font-medium">{formatCurrency(selectedBot.portfolio.totalValue - selectedBot.portfolio.cash)}</span>
											</div>
										</div>
									</div>

									<div>
										<h4 class="font-semibold text-foreground mb-3">Current Strategy</h4>
										<div class="bg-card rounded-lg p-4">
											<p class="text-sm text-foreground">{selectedBot.currentStrategy}</p>
										</div>
									</div>

									{#if Object.keys(selectedBot.portfolio.holdings).length > 0}
										<div>
											<h4 class="font-semibold text-foreground mb-3">Current Holdings</h4>
											<div class="bg-card rounded-lg p-4 space-y-2">
												{#each Object.entries(selectedBot.portfolio.holdings) as [coinId, holding]}
													{@const typedHolding = holding as {amount: number, averageCost: number}}
													<div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
														<div>
															<span class="font-medium text-foreground">{coinId}</span>
															<div class="text-xs text-muted-foreground">{typedHolding.amount.toFixed(6)} coins</div>
														</div>
														<div class="text-right">
															<div class="text-sm font-medium">{formatCurrency(typedHolding.averageCost)}</div>
															<div class="text-xs text-muted-foreground">avg cost</div>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>

								
								<div class="space-y-6">
									<div>
										<h4 class="font-semibold text-foreground mb-3">Recent Actions</h4>
										<div class="bg-card rounded-lg p-4">
											{#if selectedBot.recentActions.length > 0}
												<div class="space-y-3">
													{#each selectedBot.recentActions as action}
														<div class="border-l-2 border-blue-200 pl-3">
															<div class="flex justify-between items-center">
																<span class="font-medium text-sm text-foreground">{action.action}</span>
																<span class="text-xs text-muted-foreground">{new Date(action.timestamp).toLocaleTimeString()}</span>
															</div>
															<p class="text-xs text-muted-foreground mt-1">{action.details}</p>
														</div>
													{/each}
												</div>
											{:else}
												<p class="text-sm text-muted-foreground">No recent actions recorded</p>
											{/if}
										</div>
									</div>

									{#if Object.keys(selectedBot.marketHistory).length > 0}
										<div>
											<h4 class="font-semibold text-foreground mb-3">Market Data</h4>
											<div class="bg-card rounded-lg p-4 space-y-3">
												{#each Object.entries(selectedBot.marketHistory) as [coinId, history]}
													{@const typedHistory = history as number[]}
													{#if typedHistory.length > 1}
														<div>
															<div class="flex justify-between items-center mb-2">
																<span class="font-medium text-sm">{coinId}</span>
																<span class="text-xs text-muted-foreground">{typedHistory.length} points</span>
															</div>
															<div class="bg-background rounded">
																{#each coins.filter(c => c.id === coinId) as coin}
																	<CoinPriceChart 
																		coin={coin} 
																		priceHistory={getChartHistory(coinId, typedHistory)}
																		height={80}
																		showFooter={false}
																		title=""
																		description=""
																		hideTimeframeSelector={true}
																	/>
																{:else}
																	<div class="p-4 text-center text-muted-foreground text-sm">
																		Chart unavailable
																	</div>
																{/each}
															</div>
														</div>
													{/if}
												{/each}
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			
			<div class="bg-card rounded-xl shadow-sm">
				<div class="p-6 border-b border-border">
					<h2 class="text-xl font-bold text-foreground">Recent Trading Activity</h2>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-border">
						<thead class="bg-background">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Coin</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Price</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Amount</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Value</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Participants</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Time</th>
							</tr>
						</thead>
						<tbody class="bg-card divide-y divide-border">
							{#each trades as trade}
								<tr class="hover:bg-background">
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="font-medium text-foreground">{trade.coinId}</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-foreground">
										{formatCurrency(trade.price)}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-foreground">
										{formatNumber(trade.amount, 4)}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-foreground">
										{formatCurrency(trade.price * trade.amount)}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex space-x-2">
											<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {trade.buyerId.startsWith('bot-') ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success-foreground'}">
												{trade.buyerId.startsWith('bot-') ? trade.buyerId.split('-')[1] : 'User'}
											</span>
											<span class="text-muted-foreground text-xs">→</span>
											<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {trade.sellerId.startsWith('bot-') ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}">
												{trade.sellerId.startsWith('bot-') ? trade.sellerId.split('-')[1] : 'User'}
											</span>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-muted-foreground text-sm">
										{new Date(trade.timestamp).toLocaleTimeString()}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if trades.length === 0}
						<div class="text-center py-8 text-muted-foreground">
							No trading activity to display
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-muted/50 flex items-center justify-center">
		<div class="text-center">
			<h1 class="text-3xl font-bold text-foreground mb-4">Loading...</h1>
		</div>
	</div>
{/if}

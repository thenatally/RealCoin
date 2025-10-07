<script lang="ts">
	import { onMount } from 'svelte';
	import { trading } from '$lib/api.js';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Trophy, TrendingUp, TrendingDown, DollarSign, PieChart } from '@lucide/svelte';

	interface LeaderboardEntry {
		userId: string;
		displayName: string;
		cash: number;
		totalValue: number;
		totalGains: number;
		gainPercentage: number;
		holdings: number;
	}

	let leaderboard: LeaderboardEntry[] = [];
	let loading = true;
	let error = '';
	let selectedTimeframe = 'all';
	let totalUsers = 0;

	const timeframes = [
		{ value: 'all', label: 'All Time' },
		{ value: '1d', label: '24 Hours' },
		{ value: '1w', label: '1 Week' },
		{ value: '1m', label: '1 Month' }
	];

	async function loadLeaderboard() {
		loading = true;
		error = '';
		
		try {
			const response = await trading.getLeaderboard(selectedTimeframe, 50);
			
			if (response.success && response.leaderboard) {
				leaderboard = response.leaderboard;
				totalUsers = response.totalUsers || 0;
			} else {
				error = response.error || 'Failed to load leaderboard';
			}
		} catch (err) {
			console.error('Error loading leaderboard:', err);
			error = 'Failed to load leaderboard';
		} finally {
			loading = false;
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
		return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
	}

	function getRankIcon(rank: number) {
		switch (rank) {
			case 1: return '🥇';
			case 2: return '🥈';
			case 3: return '🥉';
			default: return `#${rank}`;
		}
	}

	function getPerformanceColor(percentage: number): string {
		if (percentage > 0) return 'text-success';
		if (percentage < 0) return 'text-destructive';
		return 'text-muted-foreground';
	}

	onMount(() => {
		loadLeaderboard();
	});

	$: if (selectedTimeframe) {
		loadLeaderboard();
	}
</script>

<svelte:head>
	<title>Leaderboard - RealCoin</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-6 py-8">
	<div class="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
		<div class="flex items-center gap-3 mb-4 md:mb-0">
			<Trophy class="size-6 text-primary" />
			<div>
				<h1 class="text-2xl font-semibold">Trading Leaderboard</h1>
				<p class="text-muted-foreground text-sm">Top performers ranked by portfolio value</p>
			</div>
		</div>
		
		<div class="flex flex-wrap gap-2">
			{#each timeframes as timeframe}
				<Button 
					variant={selectedTimeframe === timeframe.value ? 'default' : 'outline'}
					size="sm"
					onclick={() => selectedTimeframe = timeframe.value}
				>
					{timeframe.label}
				</Button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
			<span class="ml-2 text-muted-foreground">Loading leaderboard...</span>
		</div>
	{:else if error}
		<div class="border border-border rounded-lg p-6 text-center">
			<p class="font-medium text-destructive">Error loading leaderboard</p>
			<p class="text-sm text-muted-foreground">{error}</p>
			<Button onclick={loadLeaderboard} class="mt-4">Try Again</Button>
		</div>
	{:else}
		<div class="space-y-6">
			
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="border border-border rounded-lg p-4">
					<div class="flex items-center gap-3">
						<Trophy class="size-5 text-primary" />
						<div>
							<p class="text-sm text-muted-foreground">Total Traders</p>
							<p class="text-xl font-semibold">{totalUsers}</p>
						</div>
					</div>
				</div>
				
				<div class="border border-border rounded-lg p-4">
					<div class="flex items-center gap-3">
						<TrendingUp class="size-5 text-chart-1" />
						<div>
							<p class="text-sm text-muted-foreground">Showing Top</p>
							<p class="text-xl font-semibold">{Math.min(50, leaderboard.length)}</p>
						</div>
					</div>
				</div>
				
				<div class="border border-border rounded-lg p-4">
					<div class="flex items-center gap-3">
						<DollarSign class="size-5 text-chart-2" />
						<div>
							<p class="text-sm text-muted-foreground">Timeframe</p>
							<p class="text-xl font-semibold">{timeframes.find(t => t.value === selectedTimeframe)?.label}</p>
						</div>
					</div>
				</div>
			</div>

			
			<div class="border border-border rounded-lg">
				<div class="p-4 border-b border-border">
					<h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
						<Trophy class="size-5" />
						Top Traders
					</h3>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="bg-muted/30">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Rank</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Trader</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total Value</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Cash</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground">P&L</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Return %</th>
								<th class="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Holdings</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each leaderboard as entry, index}
								<tr class="hover:bg-muted/20 transition-colors">
									<td class="px-4 py-3">
										<span class="text-sm font-medium">
											{getRankIcon(index + 1)}
										</span>
									</td>
									<td class="px-4 py-3">
										<a href="/@{entry.userId}" class="flex items-center hover:opacity-80 transition-opacity">
											<div class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
												<span class="text-primary font-medium text-xs">
													{entry.displayName.charAt(0).toUpperCase()}
												</span>
											</div>
											<div class="ml-3">
												<p class="text-sm font-medium text-foreground hover:underline">{entry.displayName}</p>
												<p class="text-xs text-muted-foreground">@{entry.userId}</p>
											</div>
										</a>
									</td>
									<td class="px-4 py-3 text-right">
										<div class="text-sm font-medium text-foreground">
											{formatCurrency(entry.totalValue)}
										</div>
									</td>
									<td class="px-4 py-3 text-right">
										<div class="text-sm text-muted-foreground">
											{formatCurrency(entry.cash)}
										</div>
									</td>
									<td class="px-4 py-3 text-right">
										<div class="text-sm font-medium {getPerformanceColor(entry.totalGains)}">
											{formatCurrency(entry.totalGains)}
										</div>
									</td>
									<td class="px-4 py-3 text-right">
										<Badge 
											variant={entry.gainPercentage >= 0 ? 'default' : 'destructive'}
											class={entry.gainPercentage >= 0 ? 'bg-success/10 text-success hover:bg-success/20' : ''}
										>
											{#if entry.gainPercentage >= 0}
												<TrendingUp class="size-3 mr-1" />
											{:else}
												<TrendingDown class="size-3 mr-1" />
											{/if}
											{formatPercentage(entry.gainPercentage)}
										</Badge>
									</td>
									<td class="px-4 py-3 text-center">
										<div class="flex items-center justify-center">
											<PieChart class="size-4 mr-1 text-muted-foreground" />
											<span class="text-sm text-muted-foreground">{entry.holdings}</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				
				{#if leaderboard.length === 0}
					<div class="text-center py-8">
						<Trophy class="size-12 text-muted-foreground mx-auto mb-4" />
						<p class="text-muted-foreground">No traders found for the selected timeframe</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

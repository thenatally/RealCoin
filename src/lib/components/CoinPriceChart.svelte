<script lang="ts">
	import { LineChart } from 'layerchart';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	import { scaleUtc, scaleLinear } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import * as Chart from "$lib/components/ui/chart/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import type { CoinData } from '$lib/types.js';
    import { TrendingUp, TrendingDown, ChevronDown } from "@lucide/svelte";
	import { trading } from '$lib/api.js';
	
	export let coin: CoinData;
	export let priceHistory: Array<{ date: Date; price: number }> = [];
	export let title: string = '';
	export let description: string = '';
	export let showFooter: boolean = true;
	export let height: number = 300;
	export let hideTimeframeSelector: boolean = false;

	
	let selectedTimeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' = '1h';
	let chartData: Array<{ date: Date; price: number }> = [];
	let cachedChartData: Array<{ date: Date; price: number }> = [];
	let loading = false;
	let initialLoad = true;
	let error = '';
	let lastFetchTime = 0;
	let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

	
	let timeframeCache: Record<string, { data: Array<{ date: Date; price: number }>; timestamp: number }> = {};
	const CACHE_DURATION = 30000; 

	const timeframes = [
		{ value: '1m' as const, label: '1m' },
		{ value: '5m' as const, label: '5m' },
		{ value: '15m' as const, label: '15m' },
		{ value: '30m' as const, label: '30m' },
		{ value: '1h' as const, label: '1h' },
		{ value: '4h' as const, label: '4h' },
		{ value: '1d' as const, label: '1d' },
		{ value: '1w' as const, label: '1w' }
	];

	onMount(() => {
		if (browser && coin?.id && !hideTimeframeSelector) {
			loadPriceHistory();
		}
	});

	
	$: if (browser && coin?.id && selectedTimeframe && !hideTimeframeSelector) {
		loadPriceHistory();
	}

	async function loadPriceHistory() {
		if (!coin?.id) return;
		
		const cacheKey = `${coin.id}-${selectedTimeframe}`;
		const now = Date.now();
		
		
		const cached = timeframeCache[cacheKey];
		if (cached && (now - cached.timestamp) < CACHE_DURATION) {
			chartData = cached.data;
			cachedChartData = cached.data;
			if (initialLoad) {
				loading = false;
				initialLoad = false;
			}
			return;
		}
		
		
		if (cachedChartData.length === 0) {
			loading = true;
		}
		error = '';
		
		
		if (now - lastFetchTime < 1000) {
			if (fetchTimeout) clearTimeout(fetchTimeout);
			fetchTimeout = setTimeout(() => loadPriceHistory(), 1000);
			return;
		}
		lastFetchTime = now;
		
		try {
			const response = await trading.getPriceHistory(coin.id, selectedTimeframe, 100);
			
			if (response.success && response.history) {
				
				const newData = response.history.map(candle => ({
					date: new Date(candle.timestamp),
					price: candle.close
				}));
				chartData = newData;
				cachedChartData = newData;
				
				
				timeframeCache[cacheKey] = {
					data: newData,
					timestamp: now
				};
			} else {
				
				if (cachedChartData.length === 0) {
					chartData = priceHistory.slice();
					cachedChartData = priceHistory.slice();
				}
				error = response.error || 'No historical data available';
			}
		} catch (e) {
			console.error('Failed to load price history:', e);
			if (cachedChartData.length === 0) {
				chartData = priceHistory.slice();
				cachedChartData = priceHistory.slice();
			}
			error = 'Failed to load price history';
		}
		
		loading = false;
		initialLoad = false;
	}

	
	$: finalTitle = title || `${coin?.name || 'Unknown'} Price Chart`;
	$: finalDescription = description || `Real-time price data for ${coin?.name || 'Unknown'} (${coin?.id || 'N/A'})`;

	
	$: priceChange = (() => {
		const dataToUse = chartData.length > 0 ? chartData : priceHistory;
		if (!dataToUse || dataToUse.length < 2) {
			return { percent: 0, direction: 'neutral' as const };
		}

		const current = dataToUse[dataToUse.length - 1]?.price ?? 0;
		const previous = dataToUse[0]?.price ?? 0;

		if (previous === 0) return { percent: 0, direction: 'neutral' as const };

		const percent = ((current - previous) / previous) * 100;
		return {
			percent: Math.abs(percent),
			direction:
				percent > 0 ? ('up' as const) : percent < 0 ? ('down' as const) : ('neutral' as const)
		};
	})();

	
	$: priceRange = (() => {
		const dataToUse = chartData.length > 0 ? chartData : priceHistory;
		if (!dataToUse || dataToUse.length === 0) return { min: 0, max: 1 };

		const prices = dataToUse.map((d) => d.price);
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		const padding = (max - min) * 0.1; 

		return {
			min: Math.max(0, min - padding),
			max: max + padding
		};
	})();

	
	$: chartConfig = {
		price: {
			label: 'Price',
			color:
				priceChange.direction === 'up'
					? 'hsl(142, 76%, 36%)'
					: priceChange.direction === 'down'
						? 'hsl(0, 84%, 60%)'
						: 'hsl(221, 83%, 53%)'
		}
	};

	
	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 6
		}).format(amount);
	}

	
	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	async function onTimeframeChange(newTimeframe: typeof selectedTimeframe) {
		selectedTimeframe = newTimeframe;
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center justify-between">
			<div>
				<Card.Title class="flex items-center gap-2">
					{finalTitle}
					<span class="text-lg font-bold text-muted-foreground">
						{formatCurrency(coin?.price || 0)}
					</span>
					{#if loading && cachedChartData.length > 0}
						<div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
					{/if}
				</Card.Title>
				<Card.Description>{finalDescription}</Card.Description>
			</div>
			
			
			{#if !hideTimeframeSelector}
				<div class="min-w-[120px]">
					<Select.Root 
	                    bind:value={() => selectedTimeframe, (v) => onTimeframeChange(v) }
	                    type="single"
						disabled={loading}
					>
						<Select.Trigger class="h-8 w-full">
							{timeframes.find(t => t.value === selectedTimeframe)?.label || '1h'}
						</Select.Trigger>
						<Select.Content>
							{#each timeframes as timeframe}
								<Select.Item value={timeframe.value}>
									{timeframe.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}
		</div>
	</Card.Header>
	
	<Card.Content>
		{#if loading && cachedChartData.length === 0}
			<div class="flex items-center justify-center text-muted-foreground" style="height: {height}px;">
				<p>Loading price data...</p>
			</div>
		{:else if error && chartData.length === 0 && cachedChartData.length === 0}
			<div class="flex items-center justify-center text-muted-foreground" style="height: {height}px;">
				<p>Error: {error}</p>
			</div>
		{:else if chartData.length > 0 || cachedChartData.length > 0 || priceHistory.length > 0}
			{@const dataToRender = chartData.length > 0 ? chartData : (cachedChartData.length > 0 ? cachedChartData : priceHistory)}
			<Chart.Container config={chartConfig} class="h-[{height}px]">
				<LineChart
					data={dataToRender}
					x="date"
					y="price"
					xScale={scaleUtc()}
					yScale={scaleLinear().domain([priceRange.min, priceRange.max])}
					series={[
						{
							key: 'price',
							label: 'Price',
							color: chartConfig.price.color
						}
					]}
					props={{
						spline: {
							curve: curveMonotoneX,
							motion: 'tween',
							strokeWidth: 2
						},
						xAxis: {
							format: (v) => formatTime(v)
						},
						yAxis: {
							format: (v) => formatCurrency(v)
						},
						highlight: {
							points: { r: 4, strokeWidth: 2 }
						}
					}}
				>
					{#snippet tooltip(props)}
						<Chart.Tooltip hideLabel />
					{/snippet}
				</LineChart>
			</Chart.Container>
		{:else}
			<div
				class="flex items-center justify-center text-muted-foreground"
				style="height: {height}px;"
			>
				<p>No price data available</p>
			</div>
		{/if}
		
		{#if error && chartData.length > 0}
			<p class="text-sm text-yellow-600 mt-2">Note: {error}</p>
		{/if}
	</Card.Content>

	{#if showFooter && priceChange.direction !== 'neutral'}
		<Card.Footer>
			<div class="flex w-full items-start gap-2 text-sm">
				<div class="grid gap-2">
					<div class="flex items-center gap-2 font-medium leading-none">
						{#if priceChange.direction === 'up'}
							<span class="text-success">Trending up by {priceChange.percent.toFixed(2)}%</span>
							<TrendingUp class="size-4 text-success" />
						{:else}
							<span class="text-destructive">Trending down by {priceChange.percent.toFixed(2)}%</span>
							<TrendingDown class="size-4 text-destructive" />
						{/if}
					</div>
					<div class="text-muted-foreground flex items-center gap-2 leading-none">
						Last updated: {new Date(coin?.lastUpdated || Date.now()).toLocaleTimeString()}
					</div>
				</div>
			</div>
		</Card.Footer>
	{/if}
</Card.Root>
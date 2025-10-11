<script lang="ts">

	import { LineChart } from 'layerchart';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	import { scaleUtc, scaleLinear } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
    import {} from 'd3-axis'
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { TrendingUp, TrendingDown } from '@lucide/svelte';
	import { trading } from '$lib/api.js';

	const { title = 'Portfolio Value', description = 'Track your portfolio performance over time', height = 280 } = $props();

	// Data
	let selectedTimeframe: '5min' | '10min' | '30min' | '1hour' | '4hour' | '8hour' | '1day' | '4day' | '1week' | '1month' = $state('1day');
	let chartData: Array<{
		date: Date;
		totalValue: number;
		holdingsValue: number;
		cashValue: number;
	}> = $state([]);
	let loading = $state(false);
	let error = $state('');
	let lastFetchTime = 0;
	let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

	// Cache
	let timeframeCache: Record<
		string,
		{
			data: Array<{
				date: Date;
				totalValue: number;
				holdingsValue: number;
				cashValue: number;
			}>;
			timestamp: number;
		}
	> = {};
	const CACHE_DURATION = 30000; // 30 seconds

let width = $state(0);
onMount(() => {
        width = window.innerWidth;
        const handleResize = () => {
            width = window.innerWidth;
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
})

	const timeframes = [
		{ value: '5min' as const, label: '5 Min' },
		{ value: '10min' as const, label: '10 Min' },
		{ value: '30min' as const, label: '30 Min' },
		{ value: '1hour' as const, label: '1 Hour' },
		{ value: '4hour' as const, label: '4 Hours' },
		{ value: '8hour' as const, label: '8 Hours' },
		{ value: '1day' as const, label: '1 Day' },
		{ value: '4day' as const, label: '4 Days' },
		{ value: '1week' as const, label: '1 Week' },
		{ value: '1month' as const, label: '1 Month' }
	];

	onMount(() => {
		if (browser) {
			loadPortfolioHistory();
		}
	});

	// Reactive statement to reload data when timeframe changes
	$effect(() => {
		if (browser && selectedTimeframe) {
			loadPortfolioHistory();
		}
	});

	async function loadPortfolioHistory() {
		const cacheKey = `portfolio-${selectedTimeframe}`;
		const now = Date.now();

		// Check cache first
		const cached = timeframeCache[cacheKey];
		if (cached && now - cached.timestamp < CACHE_DURATION) {
			chartData = cached.data;
			return;
		}

		// Rate limiting
		if (now - lastFetchTime < 1000) {
			if (fetchTimeout) clearTimeout(fetchTimeout);
			fetchTimeout = setTimeout(() => loadPortfolioHistory(), 1000);
			return;
		}
		lastFetchTime = now;

		loading = true;
		error = '';

		try {
			// Request appropriate number of data points for each timeframe
			let dataPoints = 20;
			switch (selectedTimeframe) {
				case '5min': dataPoints = 20; break;   // 5 minutes ago to now
				case '10min': dataPoints = 20; break;  // 10 minutes ago to now
				case '30min': dataPoints = 20; break; // 30 minutes ago to now
				case '1hour': dataPoints = 20; break; // 1 hour ago to now
				case '4hour': dataPoints = 20; break; // 4 hours ago to now
				case '8hour': dataPoints = 20; break; // 8 hours ago to now
				case '1day': dataPoints = 24; break;  // 1 day ago to now
				case '4day': dataPoints = 20; break;   // 4 days ago to now
				case '1week': dataPoints = 20; break; // 1 week ago to now
				case '1month': dataPoints = 30; break; // 1 month ago to now
			}
			
			const response = await trading.getPortfolioHistory(selectedTimeframe, dataPoints);

			if (response.success && response.history) {
				const newData = response.history.map((point) => ({
					date: new Date(point.timestamp),
					totalValue: point.totalValue,
					holdingsValue: point.holdingsValue,
					cashValue: point.cashValue
				}));

				chartData = newData;

				// Cache the data
				timeframeCache[cacheKey] = {
					data: newData,
					timestamp: now
				};
			} else {
				error = response.error || 'No portfolio history available';
			}
		} catch (e) {
			console.error('Failed to load portfolio history:', e);
			error = 'Failed to load portfolio history';
		}

		loading = false;
	}

	// Calculate price change
    const portfolioChange = $derived(
        (!chartData || chartData.length < 2)
            ? { percent: 0, direction: 'neutral' as const }
            : (() => {
                const current = chartData[chartData.length - 1]?.totalValue ?? 0;
                const previous = chartData[0]?.totalValue ?? 0;
                if (previous === 0) return { percent: 0, direction: 'neutral' as const };
                const percent = ((current - previous) / previous) * 100;
                return {
                    percent: Math.abs(percent),
                    direction:
                        percent > 0.1 ? ('up' as const) : percent < -0.1 ? ('down' as const) : ('neutral' as const)
                };
            })()
    );

	// Calculate value range for y-axis
	const valueRange = $derived(
		!chartData || chartData.length === 0
			? { min: 0, max: 10000 }
			: (() => {
				const allValues = chartData.flatMap((d) => [d.totalValue, d.holdingsValue, d.cashValue]);
				const min = Math.min(...allValues);
				const max = Math.max(...allValues);
				const padding = (max - min) * 0.1;
				return {
					min: Math.max(0, min - padding),
					max: max + padding
				};
			})()
	);


	// Chart configuration
	const chartConfig = $derived({
		totalValue: {
			label: 'Total Value',
			color: 'hsl(221, 83%, 53%)'
		},
		holdingsValue: {
			label: 'Holdings Value',
			color: 'hsl(142, 76%, 36%)'
		},
		cashValue: {
			label: 'Cash Value',
			color: 'hsl(25, 95%, 53%)'
		}
	});

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount);
	}

	function formatTime(date: Date): string {
		switch (selectedTimeframe) {
			case '5min':
			case '10min':
			case '30min':
			case '1hour':
			case '4hour':
			case '8hour':
				return date.toLocaleTimeString('en-US', {
					hour: '2-digit',
					minute: '2-digit'
				});
			case '1day':
			case '4day':
				return date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					hour: '2-digit'
				});
			case '1week':
				return date.toLocaleDateString('en-US', {
					weekday: 'short',
					month: 'short',
					day: 'numeric'
				});
			case '1month':
				return date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric'
				});
			default:
				return date.toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric'
				});
		}
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
					{title}
					{#if loading}
						<div
							class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"
						></div>
					{/if}
				</Card.Title>
				<Card.Description>{description}</Card.Description>
			</div>

			<!-- Timeframe Selector -->
			<div class="min-w-[80px]">
				<Select.Root
					bind:value={() => selectedTimeframe, (v) => onTimeframeChange(v)}
					type="single"
					disabled={loading}
				>
					<Select.Trigger class="h-8 w-full">
						{timeframes.find((t) => t.value === selectedTimeframe)?.label || '1D'}
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
		</div>
	</Card.Header>

	<Card.Content>
		{#if loading}
			<div
				class="flex items-center justify-center text-muted-foreground"
				style="height: {height}px;"
			>
				<p>Loading portfolio data...</p>
			</div>
		{:else if error}
			<div
				class="flex items-center justify-center text-muted-foreground"
				style="height: {height}px;"
			>
				<p>Error: {error}</p>
			</div>
		{:else if chartData.length > 0}
			<Chart.Container config={chartConfig} class="h-[{height}px] max-w-full pl-4">
				<LineChart
					data={chartData}
					x="date"
					xScale={scaleUtc()}
					yScale={scaleLinear().domain([valueRange.min, valueRange.max])}
					series={[
						{
							key: 'totalValue',
							label: 'Total Value',
							color: chartConfig.totalValue.color
						},
						{
							key: 'holdingsValue',
							label: 'Holdings Value',
							color: chartConfig.holdingsValue.color
						},
						{
							key: 'cashValue',
							label: 'Cash Value',
							color: chartConfig.cashValue.color
						}
					]}
					props={{
						spline: {
							curve: curveMonotoneX,
							motion: 'tween',
							strokeWidth: 2
						},
						xAxis: {
							format: (v) => formatTime(v),
                            ticks(scale) {
                                if (width === undefined) return scale.ticks?.(7)
                                return scale.ticks?.(Math.max(3, Math.min(7, Math.floor(width / 100))))
                            },
						},
						yAxis: {
							format: (v) => formatCurrency(v)
						},
						highlight: {
							points: { r: 4, strokeWidth: 2 }
						},
                        
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
				<p>No portfolio data available</p>
			</div>
		{/if}
	</Card.Content>

	{#if portfolioChange.direction !== 'neutral' && chartData.length > 0}
		<Card.Footer>
			<div class="flex w-full items-start gap-2 text-sm">
				<div class="grid gap-2">
					<div class="flex items-center gap-2 font-medium leading-none">
						{#if portfolioChange.direction === 'up'}
							<span class="text-success">Portfolio up {portfolioChange.percent.toFixed(2)}%</span>
							<TrendingUp class="size-4 text-success" />
						{:else}
							<span class="text-destructive"
								>Portfolio down {portfolioChange.percent.toFixed(2)}%</span
							>
							<TrendingDown class="size-4 text-destructive" />
						{/if}
					</div>
					<div class="text-muted-foreground leading-none">Performance over selected timeframe</div>
				</div>
			</div>
		</Card.Footer>
	{/if}
</Card.Root>

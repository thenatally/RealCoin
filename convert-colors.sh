#!/bin/bash

# Convert numbered Tailwind classes to semantic ones
# Usage: ./convert-colors.sh

echo "Converting color classes to semantic variants..."

# Define the files to process
files=(
  "src/routes/(protected)/trading/+page.svelte"
  "src/routes/(protected)/debug/+page.svelte"
  "src/routes/+page.svelte"
  "src/routes/(protected)/account/+page.svelte"
  "src/lib/components/CoinPriceChart.svelte"
  "src/app.html"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    
    # Background colors
    sed -i 's/bg-gray-50/bg-background/g' "$file"
    sed -i 's/bg-white/bg-card/g' "$file"
    sed -i 's/bg-gray-100/bg-muted\/50/g' "$file"
    sed -i 's/bg-gray-200/bg-muted/g' "$file"
    
    # Text colors
    sed -i 's/text-gray-900/text-foreground/g' "$file"
    sed -i 's/text-gray-800/text-foreground/g' "$file"
    sed -i 's/text-gray-700/text-foreground/g' "$file"
    sed -i 's/text-gray-600/text-muted-foreground/g' "$file"
    sed -i 's/text-gray-500/text-muted-foreground/g' "$file"
    sed -i 's/text-gray-400/text-muted-foreground/g' "$file"
    
    # Success/Error colors
    sed -i 's/text-green-600/text-success/g' "$file"
    sed -i 's/text-green-700/text-success/g' "$file"
    sed -i 's/text-green-800/text-success-foreground/g' "$file"
    sed -i 's/text-red-600/text-destructive/g' "$file"
    sed -i 's/text-red-700/text-destructive/g' "$file"
    sed -i 's/text-red-800/text-destructive/g' "$file"
    
    # Primary colors
    sed -i 's/text-blue-600/text-primary/g' "$file"
    sed -i 's/text-blue-700/text-primary/g' "$file"
    sed -i 's/text-blue-800/text-primary/g' "$file"
    
    # Border colors
    sed -i 's/border-gray-200/border-border/g' "$file"
    sed -i 's/border-gray-300/border-border/g' "$file"
    sed -i 's/border-blue-500/border-primary/g' "$file"
    sed -i 's/border-red-200/border-destructive\/20/g' "$file"
    sed -i 's/border-green-200/border-success\/20/g' "$file"
    
    # Background button colors
    sed -i 's/bg-blue-100/bg-primary\/10/g' "$file"
    sed -i 's/bg-blue-50/bg-primary\/5/g' "$file"
    sed -i 's/bg-green-100/bg-success\/10/g' "$file"
    sed -i 's/bg-green-50/bg-success\/5/g' "$file"
    sed -i 's/bg-red-100/bg-destructive\/10/g' "$file"
    sed -i 's/bg-red-50/bg-destructive\/5/g' "$file"
    
    # Button solid colors
    sed -i 's/bg-green-500/bg-success/g' "$file"
    sed -i 's/bg-red-500/bg-destructive/g' "$file"
    sed -i 's/bg-blue-500/bg-primary/g' "$file"
    
    # Hover colors
    sed -i 's/hover:bg-gray-50/hover:bg-muted\/50/g' "$file"
    sed -i 's/hover:bg-gray-100/hover:bg-muted/g' "$file"
    sed -i 's/hover:bg-blue-200/hover:bg-primary\/20/g' "$file"
    sed -i 's/hover:bg-green-600/hover:bg-success\/90/g' "$file"
    sed -i 's/hover:bg-red-600/hover:bg-destructive\/90/g' "$file"
    
    # Divide colors
    sed -i 's/divide-gray-200/divide-border/g' "$file"
    
    echo "✓ Completed $file"
  else
    echo "⚠ File not found: $file"
  fi
done

echo "Color conversion complete!"

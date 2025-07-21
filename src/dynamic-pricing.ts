/**
 * Dynamic pricing analysis based on current market data
 * Calculates price thresholds from actual fuel station prices
 */
import { FuelCategorizer } from './fuel-categorizer'
import { DYNAMIC_PRICING, STATIC_PRICE_FALLBACK } from './constants'

export interface PriceThresholds {
    low: number;    // Good deal threshold (green)
    high: number;   // High price threshold (red)
    average: number; // Market average
    sampleSize: number; // Number of stations used in calculation
}

export interface FuelPriceAnalysis {
    unleaded?: PriceThresholds;
    super_unleaded?: PriceThresholds;
    diesel?: PriceThresholds;
    super_diesel?: PriceThresholds;
    lpg?: PriceThresholds;
    // Keep legacy premium for backward compatibility during migration
    premium?: PriceThresholds;
}

export class DynamicPricing {

    /**
     * Analyze all fuel prices and calculate dynamic thresholds for each fuel type
     */
    static analyzePrices(fuelData: any): FuelPriceAnalysis {
        const pricesByFuelType = this.collectPricesByFuelType(fuelData);
        const analysis: FuelPriceAnalysis = {};

        for (const [fuelType, prices] of Object.entries(pricesByFuelType)) {
            if (prices.length >= DYNAMIC_PRICING.MIN_SAMPLE_SIZE) {
                const thresholds = this.calculateThresholds(prices);
                analysis[fuelType as keyof FuelPriceAnalysis] = thresholds;
                
                console.log(`${fuelType} analysis: avg £${thresholds.average.toFixed(2)}, ` +
                           `good ≤£${thresholds.low.toFixed(2)}, high ≥£${thresholds.high.toFixed(2)} ` +
                           `(${thresholds.sampleSize} stations)`);
            } else {
                console.log(`Insufficient data for ${fuelType}: only ${prices.length} stations`);
            }
        }

        return analysis;
    }

    /**
     * Collect and normalize all prices by fuel type from the raw data
     */
    private static collectPricesByFuelType(fuelData: any): Record<string, number[]> {
        const pricesByType: Record<string, number[]> = {};

        for (const brand of Object.values(fuelData)) {
            for (const station of Object.values(brand as any)) {
                const stationData = station as any;
                if (!stationData.prices) continue;

                for (const [fuelName, price] of Object.entries(stationData.prices)) {
                    if (typeof price !== 'number') continue;

                    // Convert to pounds and validate
                    const priceInPounds = price > DYNAMIC_PRICING.PENCE_TO_POUNDS_THRESHOLD ? price / 100 : price;
                    if (priceInPounds < DYNAMIC_PRICING.MIN_PRICE || priceInPounds > DYNAMIC_PRICING.MAX_PRICE) continue;

                    // Categorize and store
                    const category = FuelCategorizer.categorizeFuelType(fuelName);
                    if (category) {
                        if (!pricesByType[category.name]) {
                            pricesByType[category.name] = [];
                        }
                        pricesByType[category.name].push(priceInPounds);
                    }
                }
            }
        }

        return pricesByType;
    }

    /**
     * Calculate price thresholds for a given set of prices
     */
    private static calculateThresholds(prices: number[]): PriceThresholds {
        const cleanPrices = this.removeOutliers(prices);
        const average = cleanPrices.reduce((a, b) => a + b, 0) / cleanPrices.length;
        
        return {
            low: average - DYNAMIC_PRICING.THRESHOLD_MARGIN,
            high: average + DYNAMIC_PRICING.THRESHOLD_MARGIN,
            average,
            sampleSize: cleanPrices.length
        };
    }

    /**
     * Remove outliers by excluding extreme values (top and bottom 10%)
     */
    private static removeOutliers(prices: number[]): number[] {
        if (prices.length < DYNAMIC_PRICING.MIN_SAMPLE_SIZE) return prices;

        const sorted = [...prices].sort((a, b) => a - b);
        const removeCount = Math.floor(sorted.length * DYNAMIC_PRICING.OUTLIER_PERCENTILE);
        
        return sorted.slice(removeCount, -removeCount || undefined);
    }


    /**
     * Get price category for a given fuel type and price
     */
    static getPriceCategory(analysis: FuelPriceAnalysis, fuelType: string, price: number): 'low' | 'medium' | 'high' {
        const thresholds = analysis[fuelType as keyof FuelPriceAnalysis];
        
        if (!thresholds) {
            // Fallback to static thresholds
            return price < STATIC_PRICE_FALLBACK.LOW ? 'low' : price < STATIC_PRICE_FALLBACK.MEDIUM ? 'medium' : 'high';
        }

        return price <= thresholds.low ? 'low' : price >= thresholds.high ? 'high' : 'medium';
    }

    /**
     * Get price color for display based on dynamic analysis
     */
    static getPriceColor(analysis: FuelPriceAnalysis, fuelType: string, price: number): string {
        const colors = { low: '#00C851', medium: '#ffbb33', high: '#FF4444' };
        return colors[this.getPriceCategory(analysis, fuelType, price)] || '#666666';
    }
}
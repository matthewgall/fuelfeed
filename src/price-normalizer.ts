interface PriceData {
    [fuelType: string]: number;
}

interface NormalizedPrices {
    [fuelType: string]: number;
}

export class PriceNormalizer {
    private static readonly KNOWN_PENCE_BRANDS = new Set([
        'bp', 'shell', 'esso', 'tesco', 'asda', 'sainsburys', 'morrisons'
    ]);

    private static readonly KNOWN_POUNDS_BRANDS = new Set([
        // Add brands that use pounds format here when discovered
    ]);

    static normalizePrices(prices: PriceData, brand: string): NormalizedPrices {
        const normalizedPrices: NormalizedPrices = {};
        const brandLower = brand.toLowerCase();

        for (const [fuelType, rawPrice] of Object.entries(prices)) {
            const normalizedPrice = this.normalizePrice(rawPrice, brandLower);
            if (normalizedPrice !== null) {
                normalizedPrices[fuelType] = normalizedPrice;
            }
        }

        return normalizedPrices;
    }

    static normalizePrice(price: number, brand: string): number | null {
        if (!this.isValidPrice(price)) {
            return null;
        }

        if (this.KNOWN_PENCE_BRANDS.has(brand)) {
            return price;
        }

        if (this.KNOWN_POUNDS_BRANDS.has(brand)) {
            return price * 100;
        }

        return this.detectAndNormalize(price);
    }

    private static isValidPrice(price: any): price is number {
        return typeof price === 'number' && 
               !isNaN(price) && 
               isFinite(price) && 
               price > 0;
    }

    private static detectAndNormalize(price: number): number {
        if (price >= 100 && price <= 300) {
            return price;
        }

        if (price >= 1 && price <= 3) {
            return price * 100;
        }

        if (price > 300) {
            return price;
        }

        return price;
    }

    static formatPrice(priceInPence: number): string {
        return `${priceInPence.toFixed(1)}p`;
    }

    static formatDisplayPrice(priceInPence: number, fuelType: string): string {
        return `<strong>${fuelType}</strong> ${this.formatPrice(priceInPence)}`;
    }
}
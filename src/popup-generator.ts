/**
 * Server-side popup HTML generator for fuel stations
 */
export class PopupGenerator {
    /**
     * Generate complete popup HTML for a fuel station
     */
    static generatePopupHTML(brand: string, location: string, priceDescription: string, isBestPrice: boolean = false): string {
        const priceItems = this.parsePriceDescription(priceDescription);
        
        return `
            <div style="
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                overflow: hidden;
                margin: 0;
            ">
                <div style="
                    background: ${isBestPrice ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}; 
                    color: ${isBestPrice ? '#333' : 'white'}; 
                    padding: 12px 15px; 
                    margin: 0;
                ">
                    <h3 style="
                        margin: 0; 
                        font-size: 16px; 
                        font-weight: 600;
                        line-height: 1.2;
                    ">
                        ${isBestPrice ? '🏆 ' : ''}${brand}
                    </h3>
                    ${location ? `<div style="font-size: 11px; opacity: 0.9; margin-top: 4px; line-height: 1.3;">📍 ${location}</div>` : ''}
                </div>
                <div style="padding: 15px;">
                    <h4 style="
                        margin: 0 0 10px 0; 
                        font-size: 13px; 
                        color: #666; 
                        text-transform: uppercase; 
                        letter-spacing: 0.5px;
                        font-weight: 600;
                    ">
                        Current Prices
                    </h4>
                    <div style="margin-top: 8px;">
                        ${priceItems.length > 0 ? priceItems.join('') : '<div style="font-size: 12px; color: #999; font-style: italic;">No price data available</div>'}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Parse price description and generate HTML for each fuel type
     */
    private static parsePriceDescription(description: string): string[] {
        if (!description) return [];

        const prices = description.split('<br />');
        const priceItems: string[] = [];

        for (let i = 0; i < Math.min(prices.length, 3); i++) {
            const price = prices[i];
            if (price && price.trim()) {
                const match = price.match(/([⛽💎])\s+([^£]+)£([\d.]+)/);
                if (match) {
                    const icon = match[1];
                    const fuel = match[2].trim().replace(/\([^)]*\)/g, '').trim();
                    const priceVal = parseFloat(match[3]);

                    if (!isNaN(priceVal)) {
                        const color = this.getPriceColor(priceVal);
                        
                        priceItems.push(`
                            <div style="
                                display: flex; 
                                justify-content: space-between; 
                                align-items: center;
                                padding: 6px 0; 
                                border-bottom: 1px solid #f0f0f0;
                                margin: 0;
                            ">
                                <span style="
                                    display: flex; 
                                    align-items: center; 
                                    font-size: 13px; 
                                    color: #333;
                                ">
                                    <span style="margin-right: 6px; font-size: 14px;">${icon}</span>
                                    ${fuel}
                                </span>
                                <span style="
                                    font-weight: 600; 
                                    font-size: 14px; 
                                    color: ${color};
                                    background: ${color}15;
                                    padding: 2px 6px;
                                    border-radius: 4px;
                                ">
                                    £${priceVal.toFixed(2)}
                                </span>
                            </div>
                        `);
                    }
                }
            }
        }

        return priceItems;
    }

    /**
     * Get color based on price value
     */
    private static getPriceColor(price: number): string {
        if (price < 1.40) return '#00C851'; // Green
        if (price < 1.50) return '#ffbb33'; // Amber
        return '#FF4444'; // Red
    }

    /**
     * Generate structured fuel price data
     */
    static generateStructuredPrices(description: string): Array<{
        type: string;
        icon: string;
        price: number;
        color: string;
        displayName: string;
    }> {
        if (!description) return [];

        const prices = description.split('<br />');
        const structuredPrices: Array<{
            type: string;
            icon: string;
            price: number;
            color: string;
            displayName: string;
        }> = [];

        for (const price of prices) {
            if (price && price.trim()) {
                const match = price.match(/([⛽💎])\s+([^£]+)£([\d.]+)/);
                if (match) {
                    const icon = match[1];
                    const fuel = match[2].trim().replace(/\([^)]*\)/g, '').trim();
                    const priceVal = parseFloat(match[3]);

                    if (!isNaN(priceVal)) {
                        structuredPrices.push({
                            type: fuel.toLowerCase().replace(/\s+/g, '_'),
                            icon: icon,
                            price: priceVal,
                            color: this.getPriceColor(priceVal),
                            displayName: fuel
                        });
                    }
                }
            }
        }

        return structuredPrices;
    }
}
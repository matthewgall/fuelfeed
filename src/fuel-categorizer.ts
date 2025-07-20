/// <reference path="../worker-configuration.d.ts" />

export interface FuelCategory {
    name: string;
    displayName: string;
    types: string[];
    icon: string;
}

export class FuelCategorizer {
    private static readonly FUEL_CATEGORIES: FuelCategory[] = [
        {
            name: 'unleaded',
            displayName: 'Unleaded',
            types: ['E5', 'E10', 'unleaded', 'petrol', 'gasoline'],
            icon: '⛽'
        },
        {
            name: 'diesel',
            displayName: 'Diesel',
            types: ['B7', 'diesel', 'gasoil'],
            icon: '⛽'
        },
        {
            name: 'premium',
            displayName: 'Premium',
            types: ['super', 'premium', 'v-power', 'momentum'],
            icon: '💎'
        }
    ];

    static categorizeFuelType(fuelType: string): FuelCategory | null {
        const normalizedFuel = fuelType.toLowerCase().trim();
        
        for (const category of this.FUEL_CATEGORIES) {
            for (const type of category.types) {
                if (normalizedFuel.includes(type.toLowerCase()) || 
                    type.toLowerCase().includes(normalizedFuel)) {
                    return category;
                }
            }
        }
        
        return null;
    }

    static groupFuelsByCategory(fuelPrices: { [key: string]: number }): { [key: string]: { price: number, originalType: string } } {
        const grouped: { [key: string]: { price: number, originalType: string } } = {};
        
        for (const [fuelType, price] of Object.entries(fuelPrices)) {
            const category = this.categorizeFuelType(fuelType);
            
            if (category) {
                // If we already have this category, keep the lowest price
                if (!grouped[category.name] || price < grouped[category.name].price) {
                    grouped[category.name] = {
                        price,
                        originalType: fuelType
                    };
                }
            } else {
                // Unknown fuel type - keep as is
                grouped[fuelType] = {
                    price,
                    originalType: fuelType
                };
            }
        }
        
        return grouped;
    }

    static getCategoryDisplayName(categoryName: string): string {
        const category = this.FUEL_CATEGORIES.find(c => c.name === categoryName);
        return category ? category.displayName : categoryName;
    }

    static getCategoryIcon(categoryName: string): string {
        const category = this.FUEL_CATEGORIES.find(c => c.name === categoryName);
        return category ? category.icon : '⛽';
    }

    static formatFuelDisplay(categoryName: string, price: number, originalType: string): string {
        const displayName = this.getCategoryDisplayName(categoryName);
        const icon = this.getCategoryIcon(categoryName);
        const priceDisplay = `£${price.toFixed(2)}`;
        
        // Show original type in smaller text if it's different from category name
        const category = this.FUEL_CATEGORIES.find(c => c.name === categoryName);
        const showOriginal = category && !category.types.includes(originalType.toLowerCase());
        
        if (showOriginal) {
            return `${icon} ${displayName} (${originalType}) ${priceDisplay}`;
        } else {
            return `${icon} ${displayName} ${priceDisplay}`;
        }
    }

    static getAllCategories(): FuelCategory[] {
        return [...this.FUEL_CATEGORIES];
    }
}
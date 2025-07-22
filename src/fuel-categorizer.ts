/// <reference path="../worker-configuration.d.ts" />

import { EmojiUtils } from './utils/emoji-utils.js';

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
            types: ['E10', 'unleaded', 'petrol', 'gasoline', 'regular'],
            icon: EmojiUtils.getEmoji('fuel')
        },
        {
            name: 'super_unleaded',
            displayName: 'Super Unleaded',
            types: ['E5', 'super unleaded', 'super petrol', 'premium unleaded', 'v-power unleaded', 'momentum 99'],
            icon: EmojiUtils.getEmoji('diamond')
        },
        {
            name: 'diesel',
            displayName: 'Diesel',
            types: ['B7', 'diesel', 'gasoil', 'regular diesel'],
            icon: EmojiUtils.getEmoji('truck')
        },
        {
            name: 'super_diesel',
            displayName: 'Super Diesel',
            types: ['SDV', 'super diesel', 'premium diesel', 'v-power diesel', 'ultimate diesel', 'city diesel'],
            icon: EmojiUtils.getEmoji('dieselSuper')
        },
        {
            name: 'lpg',
            displayName: 'LPG',
            types: ['LPG', 'autogas', 'propane'],
            icon: EmojiUtils.getEmoji('fire')
        }
    ];

    static categorizeFuelType(fuelType: string): FuelCategory | null {
        const normalizedFuel = fuelType.toLowerCase().trim()
            .replace(/[^\w\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' '); // Normalize whitespace
        
        // Direct exact matches first (most specific)
        for (const category of this.FUEL_CATEGORIES) {
            for (const type of category.types) {
                const normalizedType = type.toLowerCase().trim();
                if (normalizedFuel === normalizedType) {
                    return category;
                }
            }
        }
        
        // Partial matches with priority order
        // Check for specific fuel codes first (E10, E5, B7, SDV, LPG)
        if (normalizedFuel.includes('e10') || normalizedFuel === 'e10') {
            return this.FUEL_CATEGORIES.find(c => c.name === 'unleaded') || null;
        }
        if (normalizedFuel.includes('e5') || normalizedFuel === 'e5') {
            return this.FUEL_CATEGORIES.find(c => c.name === 'super_unleaded') || null;
        }
        if (normalizedFuel.includes('b7') || normalizedFuel === 'b7') {
            return this.FUEL_CATEGORIES.find(c => c.name === 'diesel') || null;
        }
        if (normalizedFuel.includes('sdv') || normalizedFuel === 'sdv') {
            return this.FUEL_CATEGORIES.find(c => c.name === 'super_diesel') || null;
        }
        if (normalizedFuel.includes('lpg') || normalizedFuel === 'lpg') {
            return this.FUEL_CATEGORIES.find(c => c.name === 'lpg') || null;
        }
        
        // Brand-specific premium fuels
        if (normalizedFuel.includes('v power') || normalizedFuel.includes('vpower') || normalizedFuel.includes('v-power')) {
            if (normalizedFuel.includes('diesel')) {
                return this.FUEL_CATEGORIES.find(c => c.name === 'super_diesel') || null;
            } else {
                return this.FUEL_CATEGORIES.find(c => c.name === 'super_unleaded') || null;
            }
        }
        if (normalizedFuel.includes('momentum') || normalizedFuel.includes('ultimate') || normalizedFuel.includes('synergy supreme')) {
            if (normalizedFuel.includes('diesel')) {
                return this.FUEL_CATEGORIES.find(c => c.name === 'super_diesel') || null;
            } else {
                return this.FUEL_CATEGORIES.find(c => c.name === 'super_unleaded') || null;
            }
        }
        
        // Super/Premium detection
        if (normalizedFuel.includes('super') || normalizedFuel.includes('premium')) {
            if (normalizedFuel.includes('diesel')) {
                return this.FUEL_CATEGORIES.find(c => c.name === 'super_diesel') || null;
            } else if (normalizedFuel.includes('unleaded') || normalizedFuel.includes('petrol')) {
                return this.FUEL_CATEGORIES.find(c => c.name === 'super_unleaded') || null;
            }
        }
        
        // Basic fuel type detection
        if (normalizedFuel.includes('diesel')) {
            return this.FUEL_CATEGORIES.find(c => c.name === 'diesel') || null;
        }
        if (normalizedFuel.includes('unleaded') || normalizedFuel.includes('petrol') || normalizedFuel.includes('gasoline')) {
            return this.FUEL_CATEGORIES.find(c => c.name === 'unleaded') || null;
        }
        
        console.warn(`Unrecognized fuel type: "${fuelType}"`);
        return null;
    }

    static groupFuelsByCategory(fuelPrices: { [key: string]: number }): { [key: string]: { price: number, originalType: string, allPrices?: number[] } } {
        const grouped: { [key: string]: { 
            price: number, 
            originalType: string, 
            allPrices: number[],
            fuelTypes: string[]
        } } = {};
        
        for (const [fuelType, price] of Object.entries(fuelPrices)) {
            const category = this.categorizeFuelType(fuelType);
            
            if (category) {
                if (!grouped[category.name]) {
                    // First fuel of this category
                    grouped[category.name] = {
                        price,
                        originalType: fuelType,
                        allPrices: [price],
                        fuelTypes: [fuelType]
                    };
                } else {
                    // Additional fuel of same category - collect for averaging
                    grouped[category.name].allPrices.push(price);
                    grouped[category.name].fuelTypes.push(fuelType);
                    
                    // Use the lowest price as the display price
                    if (price < grouped[category.name].price) {
                        grouped[category.name].price = price;
                        grouped[category.name].originalType = fuelType;
                    }
                }
            } else {
                // Unknown fuel type - keep as is
                grouped[fuelType] = {
                    price,
                    originalType: fuelType,
                    allPrices: [price],
                    fuelTypes: [fuelType]
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
        return category ? category.icon : EmojiUtils.getEmoji('fuel');
    }

    static formatFuelDisplay(categoryName: string, price: number, originalType: string, allPrices?: number[]): string {
        const displayName = this.getCategoryDisplayName(categoryName);
        const icon = this.getCategoryIcon(categoryName);
        const priceDisplay = `£${price.toFixed(2)}`;
        
        // Show additional context for fuel types
        let contextInfo = '';
        
        if (originalType.toLowerCase().includes('e10')) {
            contextInfo = ' (E10)';
        } else if (originalType.toLowerCase().includes('e5')) {
            contextInfo = ' (E5)';
        } else if (originalType.toLowerCase().includes('b7')) {
            contextInfo = ' (B7)';
        } else if (originalType.toLowerCase().includes('sdv')) {
            contextInfo = ' (SDV)';
        } else if (originalType.toLowerCase().includes('lpg')) {
            contextInfo = ' (Autogas)';
        }
        
        // Show if multiple prices were averaged
        if (allPrices && allPrices.length > 1) {
            const avgPrice = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;
            if (Math.abs(avgPrice - price) > 0.005) { // Show average if significantly different
                contextInfo += ` (avg £${avgPrice.toFixed(2)})`;
            }
        }
        
        return `${icon} ${displayName}${contextInfo} ${priceDisplay}`;
    }

    static getAllCategories(): FuelCategory[] {
        return [...this.FUEL_CATEGORIES];
    }

    static getOrderedFuelEntries(groupedFuels: { [key: string]: { price: number, originalType: string, allPrices?: number[] } }): Array<[string, { price: number, originalType: string, allPrices?: number[] }]> {
        const orderedEntries: Array<[string, { price: number, originalType: string, allPrices?: number[] }]> = [];
        
        // First, add fuels in the standard order (unleaded, diesel, premium)
        for (const category of this.FUEL_CATEGORIES) {
            if (groupedFuels[category.name]) {
                orderedEntries.push([category.name, groupedFuels[category.name]]);
            }
        }
        
        // Then add any other fuel types not in the standard categories
        for (const [fuelType, data] of Object.entries(groupedFuels)) {
            const isStandardCategory = this.FUEL_CATEGORIES.some(cat => cat.name === fuelType);
            if (!isStandardCategory) {
                orderedEntries.push([fuelType, data]);
            }
        }
        
        return orderedEntries;
    }
}
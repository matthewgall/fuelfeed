import { PriceNormalizer } from './src/price-normalizer.js';

// Test data similar to what we get from BP
const testPrices = {
    'E5': 160.90000,
    'E10': 139.90000,  
    'B7': 145.90000,
    'SDV': 164.90000
};

console.log('Testing BP price normalization:');
console.log('Input prices:', testPrices);

const normalized = PriceNormalizer.normalizePrices(testPrices, 'BP');
console.log('Normalized prices:', normalized);

console.log('\nFormatted display prices:');
Object.entries(normalized).forEach(([fuel, price]) => {
    console.log(PriceNormalizer.formatDisplayPrice(price, fuel));
});

// Test invalid prices
console.log('\nTesting invalid price handling:');
const invalidPrices = {
    'E5': null,
    'E10': 'not_a_number', 
    'B7': -5,
    'SDV': Infinity
};

const normalizedInvalid = PriceNormalizer.normalizePrices(invalidPrices, 'test');
console.log('Invalid input:', invalidPrices);
console.log('Normalized result:', normalizedInvalid);
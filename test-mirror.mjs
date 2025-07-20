#!/usr/bin/env node

// Test script for the improved mirror functionality

import { downloadFeed, validateFeedData } from './mirror.mjs';
import fs from 'node:fs';

const TEST_FEED_DATA = {
    valid: {
        stations: [
            {
                site_id: "TEST001",
                brand: "TestBrand",
                prices: { unleaded: 145.9 },
                address: "Test Station",
                location: { latitude: 51.5074, longitude: -0.1278 }
            }
        ],
        last_updated: new Date().toISOString()
    },
    invalid_no_stations: {
        data: "some other format"
    },
    invalid_empty_stations: {
        stations: []
    },
    invalid_bad_stations: {
        stations: [
            { incomplete: "data" },
            { site_id: "TEST002" } // missing required fields
        ]
    }
};

async function testValidation() {
    console.log('🧪 Testing data validation...\n');
    
    // Test valid data
    try {
        validateFeedData(TEST_FEED_DATA.valid, 'valid-test');
        console.log('✅ Valid data test passed');
    } catch (error) {
        console.log('❌ Valid data test failed:', error.message);
    }
    
    // Test invalid data formats
    const invalidTests = [
        ['no-stations', TEST_FEED_DATA.invalid_no_stations],
        ['empty-stations', TEST_FEED_DATA.invalid_empty_stations],
        ['bad-stations', TEST_FEED_DATA.invalid_bad_stations]
    ];
    
    for (const [name, data] of invalidTests) {
        try {
            validateFeedData(data, name);
            console.log(`❌ ${name} test should have failed but didn't`);
        } catch (error) {
            console.log(`✅ ${name} test correctly failed: ${error.message}`);
        }
    }
}

async function testNetworkHandling() {
    console.log('\n🌐 Testing network handling...\n');
    
    // Test with invalid URL (should fail after retries)
    try {
        const result = await downloadFeed('invalid-test', 'https://invalid-url-that-does-not-exist.com/data.json');
        console.log('❌ Invalid URL test should have failed but didn\'t');
    } catch (error) {
        console.log('✅ Invalid URL test correctly failed after retries');
    }
    
    // Test with timeout URL (using a slow endpoint)
    try {
        const result = await downloadFeed('timeout-test', 'https://httpbin.org/delay/15');
        console.log('❌ Timeout test should have failed but didn\'t');
    } catch (error) {
        console.log('✅ Timeout test correctly failed:', error.message);
    }
}

async function runTests() {
    console.log('🚀 Starting mirror script tests...\n');
    
    // Ensure test data directory exists
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
    }
    
    await testValidation();
    await testNetworkHandling();
    
    console.log('\n✨ Mirror script tests completed!');
}

if (import.meta.url === new URL(import.meta.url).href) {
    runTests().catch(console.error);
}
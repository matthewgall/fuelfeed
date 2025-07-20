#!/usr/bin/env node

// Test script to measure bounding box performance improvements

const TEST_BBOXES = [
    // London area
    '-0.5,51.3,0.2,51.7',
    // Manchester area  
    '-2.4,53.3,-2.1,53.6',
    // Full UK bounds
    '-8.0,49.8,2.0,60.9',
    // Small central London
    '-0.2,51.4,0.1,51.6'
];

const API_BASE = 'http://localhost:8787/api';

async function measureRequest(url, label) {
    const start = performance.now();
    try {
        const response = await fetch(url);
        const end = performance.now();
        const data = await response.json();
        
        const stationCount = data.features ? data.features.length : 'unknown';
        const responseSize = JSON.stringify(data).length;
        
        console.log(`${label}:`);
        console.log(`  Time: ${(end - start).toFixed(2)}ms`);
        console.log(`  Stations: ${stationCount}`);
        console.log(`  Size: ${(responseSize / 1024).toFixed(1)}KB`);
        console.log(`  Cache: ${response.headers.get('X-Station-Count') ? 'HIT' : 'MISS'}`);
        console.log('');
        
        return { time: end - start, stations: stationCount, size: responseSize };
    } catch (error) {
        console.log(`${label}: ERROR - ${error.message}`);
        return null;
    }
}

async function runTests() {
    console.log('Testing bounding box performance...\n');
    
    // Test full dataset
    await measureRequest(`${API_BASE}/data.mapbox`, 'Full dataset (no bbox)');
    
    // Test each bounding box
    for (let i = 0; i < TEST_BBOXES.length; i++) {
        const bbox = TEST_BBOXES[i];
        await measureRequest(`${API_BASE}/data.mapbox?bbox=${bbox}`, `Bbox ${i + 1}: ${bbox}`);
    }
    
    // Test cache performance by repeating first bbox
    console.log('Testing cache performance...\n');
    const firstBbox = TEST_BBOXES[0];
    await measureRequest(`${API_BASE}/data.mapbox?bbox=${firstBbox}`, 'First request (cache miss)');
    await measureRequest(`${API_BASE}/data.mapbox?bbox=${firstBbox}`, 'Second request (cache hit)');
}

runTests().catch(console.error);
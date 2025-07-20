// Simple test to verify bbox filtering works correctly

// Mock data structure that matches the fuel data format
const mockFuelData = {
    "bp": {
        "station1": {
            "address": { "brand": "BP", "address": "Test Street", "postcode": "TE1 1ST" },
            "location": { "latitude": 51.5074, "longitude": -0.1278 }, // London
            "prices": { "E5": 160.9, "E10": 139.9 },
            "updated": "2025-07-19"
        },
        "station2": {
            "address": { "brand": "BP", "address": "Another Street", "postcode": "TE2 2ND" },
            "location": { "latitude": 53.4808, "longitude": -2.2426 }, // Manchester
            "prices": { "E5": 155.9, "E10": 134.9 },
            "updated": "2025-07-19"
        }
    },
    "shell": {
        "station3": {
            "address": { "brand": "Shell", "address": "Third Street", "postcode": "TE3 3RD" },
            "location": { "latitude": 55.9533, "longitude": -3.1883 }, // Edinburgh
            "prices": { "E5": 162.9, "E10": 141.9 },
            "updated": "2025-07-19"
        }
    }
};

// Test bounding box filtering function
function testBboxFiltering(data, bounds) {
    let filteredCount = 0;
    
    for (let brand of Object.keys(data)) {
        for (let stationId of Object.keys(data[brand])) {
            let station = data[brand][stationId];
            
            if (bounds && station.location) {
                const lng = station.location.longitude;
                const lat = station.location.latitude;
                
                if (lng >= bounds.west && lng <= bounds.east && 
                    lat >= bounds.south && lat <= bounds.north) {
                    filteredCount++;
                    console.log(`✓ Station ${stationId} (${station.address.brand}) at ${lat},${lng} is within bounds`);
                } else {
                    console.log(`✗ Station ${stationId} (${station.address.brand}) at ${lat},${lng} is outside bounds`);
                }
            }
        }
    }
    
    return filteredCount;
}

console.log('Testing viewport-based filtering:\n');

// Test case 1: London area only
console.log('Test 1: London area bounding box');
const londonBounds = {
    west: -0.5,
    south: 51.2,
    east: 0.2,
    north: 51.8
};
console.log('Bounds:', londonBounds);
let londonCount = testBboxFiltering(mockFuelData, londonBounds);
console.log(`Result: ${londonCount} stations in London area\n`);

// Test case 2: UK-wide bounding box
console.log('Test 2: UK-wide bounding box');
const ukBounds = {
    west: -8.0,
    south: 49.5,
    east: 2.0,
    north: 61.0
};
console.log('Bounds:', ukBounds);
let ukCount = testBboxFiltering(mockFuelData, ukBounds);
console.log(`Result: ${ukCount} stations in UK area\n`);

// Test case 3: No bounds (should include all)
console.log('Test 3: No bounds specified');
let allCount = 0;
for (let brand of Object.keys(mockFuelData)) {
    allCount += Object.keys(mockFuelData[brand]).length;
}
console.log(`Result: ${allCount} total stations without filtering\n`);

console.log('Viewport filtering tests completed!');
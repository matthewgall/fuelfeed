// Test the bbox parameter parsing logic from the API

function testBboxParsing() {
    console.log('Testing bbox parameter parsing:\n');
    
    // Test cases for different bbox parameter formats
    const testCases = [
        {
            name: 'Valid London bbox',
            bbox: '-0.5,51.2,0.2,51.8',
            expected: { west: -0.5, south: 51.2, east: 0.2, north: 51.8 }
        },
        {
            name: 'Invalid bbox (too few coordinates)',
            bbox: '-0.5,51.2,0.2',
            expected: null
        },
        {
            name: 'Invalid bbox (non-numeric)',
            bbox: '-0.5,51.2,invalid,51.8',
            expected: null
        },
        {
            name: 'Valid negative coordinates',
            bbox: '-10.5,-60.2,-5.2,-55.8',
            expected: { west: -10.5, south: -60.2, east: -5.2, north: -55.8 }
        },
        {
            name: 'No bbox parameter',
            bbox: null,
            expected: null
        }
    ];
    
    testCases.forEach(testCase => {
        console.log(`Test: ${testCase.name}`);
        console.log(`Input: ${testCase.bbox}`);
        
        let bounds = null;
        if (testCase.bbox) {
            const coords = testCase.bbox.split(',').map(Number);
            if (coords.length === 4 && coords.every(coord => !isNaN(coord))) {
                bounds = {
                    west: coords[0],
                    south: coords[1], 
                    east: coords[2],
                    north: coords[3]
                };
            }
        }
        
        const result = JSON.stringify(bounds);
        const expected = JSON.stringify(testCase.expected);
        const passed = result === expected;
        
        console.log(`Result: ${result}`);
        console.log(`Expected: ${expected}`);
        console.log(`Status: ${passed ? '✓ PASS' : '✗ FAIL'}\n`);
    });
}

// Test URL generation for frontend
function testUrlGeneration() {
    console.log('Testing frontend URL generation:\n');
    
    const mockBounds = {
        getWest: () => -0.5,
        getSouth: () => 51.2,
        getEast: () => 0.2,
        getNorth: () => 51.8
    };
    
    function getMapBounds() {
        return `${mockBounds.getWest()},${mockBounds.getSouth()},${mockBounds.getEast()},${mockBounds.getNorth()}`;
    }
    
    const bbox = getMapBounds();
    const url = `/api/data.mapbox?bbox=${bbox}`;
    
    console.log('Generated URL:', url);
    console.log('Expected format: /api/data.mapbox?bbox=-0.5,51.2,0.2,51.8');
    console.log(`Status: ${url === '/api/data.mapbox?bbox=-0.5,51.2,0.2,51.8' ? '✓ PASS' : '✗ FAIL'}\n`);
}

testBboxParsing();
testUrlGeneration();

console.log('API format tests completed!');
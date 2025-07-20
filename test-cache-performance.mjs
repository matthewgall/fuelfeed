// Test the improved caching system performance

// Mock StationCache for testing
class MockStationCache {
    constructor() {
        this.tileSize = 0.1;
        this.maxCacheSize = 100;
        this.cacheExpiry = 30 * 60 * 1000;
        this.maxMemoryMB = 10;
        this.cache = new Map();
        this.accessOrder = [];
        this.memoryUsage = 0;
        this.stats = { hits: 0, misses: 0, evictions: 0, apiCalls: 0 };
    }

    boundsToTiles(bounds) {
        const tiles = [];
        const minTileX = Math.floor(bounds.west / this.tileSize);
        const maxTileX = Math.floor(bounds.east / this.tileSize);
        const minTileY = Math.floor(bounds.south / this.tileSize);
        const maxTileY = Math.floor(bounds.north / this.tileSize);
        
        for (let x = minTileX; x <= maxTileX; x++) {
            for (let y = minTileY; y <= maxTileY; y++) {
                tiles.push({ x, y, key: `${x},${y}` });
            }
        }
        return tiles;
    }

    tileToBounds(tile) {
        return {
            west: tile.x * this.tileSize,
            south: tile.y * this.tileSize,
            east: (tile.x + 1) * this.tileSize,
            north: (tile.y + 1) * this.tileSize
        };
    }

    hasValidData(bounds) {
        const requiredTiles = this.boundsToTiles(bounds);
        const now = Date.now();
        
        const hasAll = requiredTiles.every(tile => {
            const entry = this.cache.get(tile.key);
            return entry && (now - entry.timestamp) < this.cacheExpiry;
        });
        
        if (hasAll) {
            this.stats.hits++;
        } else {
            this.stats.misses++;
        }
        
        return hasAll;
    }

    estimateEntrySize(entry) {
        const jsonSize = JSON.stringify(entry.stations).length * 2;
        return jsonSize + 200;
    }

    storeStations(bounds, geoJsonData) {
        const requiredTiles = this.boundsToTiles(bounds);
        const now = Date.now();
        this.stats.apiCalls++;
        
        requiredTiles.forEach(tile => {
            const tileBounds = this.tileToBounds(tile);
            const tileStations = geoJsonData.features.filter(station => {
                const coord = station.geometry.coordinates;
                return coord[0] >= tileBounds.west && coord[0] < tileBounds.east &&
                       coord[1] >= tileBounds.south && coord[1] < tileBounds.north;
            });
            
            const entry = { stations: tileStations, timestamp: now, bounds: tileBounds };
            
            const oldEntry = this.cache.get(tile.key);
            if (oldEntry) {
                this.memoryUsage -= this.estimateEntrySize(oldEntry);
            }
            
            const entrySize = this.estimateEntrySize(entry);
            this.cache.set(tile.key, entry);
            this.memoryUsage += entrySize;
        });
    }

    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0 ? 
            (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) : 0;
        
        return {
            totalEntries: this.cache.size,
            memoryUsageMB: (this.memoryUsage / 1024 / 1024).toFixed(2),
            performance: { ...this.stats, hitRate: hitRate + '%' }
        };
    }
}

// Generate mock station data
function generateMockStations(bounds, count = 50) {
    const features = [];
    for (let i = 0; i < count; i++) {
        const lng = bounds.west + Math.random() * (bounds.east - bounds.west);
        const lat = bounds.south + Math.random() * (bounds.north - bounds.south);
        
        features.push({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [lng, lat]
            },
            properties: {
                title: `Station ${i}`,
                description: "Test fuel prices"
            }
        });
    }
    
    return { type: "FeatureCollection", features };
}

// Test scenarios
function runCacheTests() {
    console.log('🧪 Testing Advanced Station Cache Performance\n');
    
    const cache = new MockStationCache();
    
    // Test 1: Basic caching
    console.log('Test 1: Basic Cache Functionality');
    const londonBounds = { west: -0.2, south: 51.4, east: 0.1, north: 51.6 };
    const londonStations = generateMockStations(londonBounds, 25);
    
    console.log('Before caching:', cache.hasValidData(londonBounds)); // Should be false
    cache.storeStations(londonBounds, londonStations);
    console.log('After caching:', cache.hasValidData(londonBounds)); // Should be true
    console.log('Stats:', cache.getStats());
    console.log('');
    
    // Test 2: Overlapping regions (should hit cache)
    console.log('Test 2: Overlapping Region Cache Hit');
    const overlappingBounds = { west: -0.15, south: 51.45, east: 0.05, north: 51.55 };
    console.log('Overlapping region cached:', cache.hasValidData(overlappingBounds));
    console.log('Stats after overlap test:', cache.getStats());
    console.log('');
    
    // Test 3: Partially overlapping (should miss cache)
    console.log('Test 3: Partial Overlap Cache Miss');
    const partialBounds = { west: 0.05, south: 51.3, east: 0.4, north: 51.5 };
    console.log('Partial overlap cached:', cache.hasValidData(partialBounds));
    
    // Store the new region
    const partialStations = generateMockStations(partialBounds, 30);
    cache.storeStations(partialBounds, partialStations);
    console.log('Stats after partial region:', cache.getStats());
    console.log('');
    
    // Test 4: Multiple small movements (realistic user behavior)
    console.log('Test 4: Simulating User Pan Behavior');
    let currentBounds = { west: -0.1, south: 51.5, east: 0.0, north: 51.6 };
    
    for (let i = 0; i < 10; i++) {
        // Small movements
        currentBounds.west += 0.01;
        currentBounds.east += 0.01;
        currentBounds.south += 0.005;
        currentBounds.north += 0.005;
        
        const isCached = cache.hasValidData(currentBounds);
        if (!isCached) {
            const newStations = generateMockStations(currentBounds, 20);
            cache.storeStations(currentBounds, newStations);
        }
        
        console.log(`Pan ${i + 1}: ${isCached ? 'Cache HIT' : 'Cache MISS'}`);
    }
    
    console.log('Final stats after panning:', cache.getStats());
    console.log('');
    
    // Test 5: Memory usage with large dataset
    console.log('Test 5: Memory Usage Test');
    const largeBounds = { west: -2.0, south: 50.0, east: 2.0, north: 54.0 };
    const largeDataset = generateMockStations(largeBounds, 1000);
    
    console.log('Memory before large dataset:', cache.getStats().memoryUsageMB + 'MB');
    cache.storeStations(largeBounds, largeDataset);
    console.log('Memory after large dataset:', cache.getStats().memoryUsageMB + 'MB');
    console.log('');
    
    // Test 6: Cache efficiency calculation
    console.log('Test 6: Cache Efficiency Summary');
    const finalStats = cache.getStats();
    console.log('📊 Final Performance Metrics:');
    console.table({
        'Cache Entries': finalStats.totalEntries,
        'Memory Usage': finalStats.memoryUsageMB + 'MB',
        'API Calls': finalStats.performance.apiCalls,
        'Cache Hits': finalStats.performance.hits,
        'Cache Misses': finalStats.performance.misses,
        'Hit Rate': finalStats.performance.hitRate,
        'Data Saved': `${finalStats.performance.hits} requests avoided`
    });
    
    console.log('\n✅ Cache Performance Test Complete!');
    
    // Calculate bandwidth savings
    const totalRequests = finalStats.performance.hits + finalStats.performance.misses;
    const savedRequests = finalStats.performance.hits;
    const bandwidthSaved = (savedRequests / totalRequests * 100).toFixed(1);
    
    console.log(`💾 Estimated bandwidth savings: ${bandwidthSaved}%`);
    console.log(`📡 API calls reduced from ${totalRequests} to ${finalStats.performance.apiCalls}`);
}

// Run the tests
runCacheTests();
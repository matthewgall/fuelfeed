// Advanced spatial caching system for fuel station data
class StationCache {
    constructor() {
        // Cache configuration
        this.tileSize = 0.1; // degrees (roughly 11km at UK latitude)
        this.maxCacheSize = 100; // maximum tiles to cache
        this.cacheExpiry = 30 * 60 * 1000; // 30 minutes in milliseconds
        this.maxMemoryMB = 10; // maximum memory usage in MB
        
        // Cache storage
        this.cache = new Map(); // Map<string, CacheEntry>
        this.accessOrder = []; // Array of tile keys for LRU eviction
        this.memoryUsage = 0; // approximate memory usage in bytes
        
        // Performance tracking
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            apiCalls: 0
        };
        
        // Load persisted cache from localStorage
        this.loadFromStorage();
        
        console.log('StationCache initialized with tile size:', this.tileSize, 'Max memory:', this.maxMemoryMB + 'MB');
    }
    
    // Convert geographic bounds to tile coordinates
    boundsToTiles(bounds) {
        const tiles = [];
        
        // Calculate tile boundaries
        const minTileX = Math.floor(bounds.west / this.tileSize);
        const maxTileX = Math.floor(bounds.east / this.tileSize);
        const minTileY = Math.floor(bounds.south / this.tileSize);
        const maxTileY = Math.floor(bounds.north / this.tileSize);
        
        // Generate all tiles that intersect with bounds
        for (let x = minTileX; x <= maxTileX; x++) {
            for (let y = minTileY; y <= maxTileY; y++) {
                tiles.push({ x, y, key: `${x},${y}` });
            }
        }
        
        return tiles;
    }
    
    // Convert tile coordinates to geographic bounds
    tileToBounds(tile) {
        return {
            west: tile.x * this.tileSize,
            south: tile.y * this.tileSize,
            east: (tile.x + 1) * this.tileSize,
            north: (tile.y + 1) * this.tileSize
        };
    }
    
    // Check if we have all required tiles cached and not expired
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
    
    // Get all stations for the given bounds from cache
    getStations(bounds) {
        const requiredTiles = this.boundsToTiles(bounds);
        const allStations = [];
        const now = Date.now();
        
        requiredTiles.forEach(tile => {
            const entry = this.cache.get(tile.key);
            if (entry && (now - entry.timestamp) < this.cacheExpiry) {
                // Update access order for LRU
                this.updateAccessOrder(tile.key);
                
                // Filter stations to exact bounds (tiles may overlap)
                const filteredStations = entry.stations.filter(station => {
                    const coord = station.geometry.coordinates;
                    return coord[0] >= bounds.west && coord[0] <= bounds.east &&
                           coord[1] >= bounds.south && coord[1] <= bounds.north;
                });
                
                allStations.push(...filteredStations);
            }
        });
        
        // Remove duplicates (stations may appear in multiple tiles)
        const uniqueStations = this.deduplicateStations(allStations);
        
        return {
            type: 'FeatureCollection',
            features: uniqueStations
        };
    }
    
    // Estimate memory usage of a cache entry
    estimateEntrySize(entry) {
        // Rough estimate: JSON string length * 2 (for UTF-16) + overhead
        const jsonSize = JSON.stringify(entry.stations).length * 2;
        return jsonSize + 200; // Add overhead for timestamps, bounds, etc.
    }
    
    // Store stations for a specific bounds
    storeStations(bounds, geoJsonData) {
        const requiredTiles = this.boundsToTiles(bounds);
        const now = Date.now();
        
        this.stats.apiCalls++;
        
        requiredTiles.forEach(tile => {
            const tileBounds = this.tileToBounds(tile);
            
            // Filter stations that belong to this tile
            const tileStations = geoJsonData.features.filter(station => {
                const coord = station.geometry.coordinates;
                return coord[0] >= tileBounds.west && coord[0] < tileBounds.east &&
                       coord[1] >= tileBounds.south && coord[1] < tileBounds.north;
            });
            
            const entry = {
                stations: tileStations,
                timestamp: now,
                bounds: tileBounds
            };
            
            // Remove old entry from memory usage calculation
            const oldEntry = this.cache.get(tile.key);
            if (oldEntry) {
                this.memoryUsage -= this.estimateEntrySize(oldEntry);
            }
            
            // Add new entry and update memory usage
            const entrySize = this.estimateEntrySize(entry);
            this.cache.set(tile.key, entry);
            this.memoryUsage += entrySize;
            
            this.updateAccessOrder(tile.key);
        });
        
        // Enforce cache size and memory limits
        this.enforceLimit();
        
        // Persist to localStorage
        this.saveToStorage();
        
        console.log(`Cached data for ${requiredTiles.length} tiles. Cache size: ${this.cache.size}, Memory: ${(this.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    }
    
    // Remove duplicate stations based on station ID or coordinates
    deduplicateStations(stations) {
        const seen = new Set();
        return stations.filter(station => {
            // Create unique key from coordinates and title
            const key = `${station.geometry.coordinates[0]},${station.geometry.coordinates[1]}:${station.properties.title}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    
    // Update LRU access order
    updateAccessOrder(tileKey) {
        // Remove from current position
        const index = this.accessOrder.indexOf(tileKey);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        // Add to end (most recent)
        this.accessOrder.push(tileKey);
    }
    
    // Enforce cache size and memory limits using LRU eviction
    enforceLimit() {
        const maxMemoryBytes = this.maxMemoryMB * 1024 * 1024;
        
        while ((this.cache.size > this.maxCacheSize) || (this.memoryUsage > maxMemoryBytes)) {
            const oldestKey = this.accessOrder.shift();
            if (oldestKey) {
                const entry = this.cache.get(oldestKey);
                if (entry) {
                    this.memoryUsage -= this.estimateEntrySize(entry);
                }
                this.cache.delete(oldestKey);
                this.stats.evictions++;
                console.log('Evicted tile from cache:', oldestKey, 'Reason:', this.cache.size > this.maxCacheSize ? 'size limit' : 'memory limit');
            } else {
                break; // No more entries to evict
            }
        }
    }
    
    // Clear expired entries
    clearExpired() {
        const now = Date.now();
        const expiredKeys = [];
        
        this.cache.forEach((entry, key) => {
            if (now - entry.timestamp >= this.cacheExpiry) {
                expiredKeys.push(key);
            }
        });
        
        expiredKeys.forEach(key => {
            const entry = this.cache.get(key);
            if (entry) {
                this.memoryUsage -= this.estimateEntrySize(entry);
            }
            this.cache.delete(key);
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
        });
        
        if (expiredKeys.length > 0) {
            console.log(`Cleared ${expiredKeys.length} expired cache entries`);
            this.saveToStorage();
        }
    }
    
    // Persist cache to localStorage
    saveToStorage() {
        try {
            const cacheData = {
                entries: Array.from(this.cache.entries()),
                accessOrder: this.accessOrder,
                timestamp: Date.now()
            };
            localStorage.setItem('fuelStationCache', JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Failed to save cache to localStorage:', e);
        }
    }
    
    // Load cache from localStorage
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('fuelStationCache');
            if (stored) {
                const cacheData = JSON.parse(stored);
                const now = Date.now();
                
                // Only load if cache is less than 1 hour old
                if (now - cacheData.timestamp < 60 * 60 * 1000) {
                    this.cache = new Map(cacheData.entries);
                    this.accessOrder = cacheData.accessOrder || [];
                    
                    // Clear any expired entries
                    this.clearExpired();
                    
                    console.log(`Loaded ${this.cache.size} cached tiles from localStorage`);
                } else {
                    console.log('Stored cache too old, starting fresh');
                    localStorage.removeItem('fuelStationCache');
                }
            }
        } catch (e) {
            console.warn('Failed to load cache from localStorage:', e);
            localStorage.removeItem('fuelStationCache');
        }
    }
    
    // Clear all cache data
    clear() {
        this.cache.clear();
        this.accessOrder = [];
        this.memoryUsage = 0;
        this.stats = { hits: 0, misses: 0, evictions: 0, apiCalls: 0 };
        localStorage.removeItem('fuelStationCache');
        console.log('Cache cleared');
    }
    
    // Get cache statistics
    getStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;
        
        this.cache.forEach(entry => {
            if (now - entry.timestamp < this.cacheExpiry) {
                validEntries++;
            } else {
                expiredEntries++;
            }
        });
        
        const hitRate = this.stats.hits + this.stats.misses > 0 ? 
            (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) : 0;
        
        return {
            totalEntries: this.cache.size,
            validEntries,
            expiredEntries,
            maxSize: this.maxCacheSize,
            memoryUsageMB: (this.memoryUsage / 1024 / 1024).toFixed(2),
            maxMemoryMB: this.maxMemoryMB,
            tileSize: this.tileSize,
            expiryMinutes: this.cacheExpiry / (60 * 1000),
            performance: {
                ...this.stats,
                hitRate: hitRate + '%'
            }
        };
    }
}

// Make globally available
window.StationCache = StationCache;
/// <reference path="../worker-configuration.d.ts" />

export interface CacheConfig {
    defaultTtl: number;
    compressResponse: boolean;
    enableEdgeCache: boolean;
}

export interface SpatialTile {
    x: number;
    y: number;
    zoom: number;
    key: string;
}

export class CacheManager {
    private config: CacheConfig;
    private static readonly TILE_SIZE = 0.1; // degrees
    private static readonly POPULAR_REGIONS = [
        { name: 'london', bounds: { west: -0.5, south: 51.3, east: 0.2, north: 51.7 } },
        { name: 'manchester', bounds: { west: -2.4, south: 53.3, east: -2.1, north: 53.6 } },
        { name: 'birmingham', bounds: { west: -2.0, south: 52.4, east: -1.8, north: 52.6 } },
        { name: 'glasgow', bounds: { west: -4.4, south: 55.8, east: -4.1, north: 56.0 } }
    ];

    constructor(config: CacheConfig = {
        defaultTtl: 900,
        compressResponse: true,
        enableEdgeCache: true
    }) {
        this.config = config;
    }

    generateSpatialTiles(bounds: { west: number, south: number, east: number, north: number }): SpatialTile[] {
        const tiles: SpatialTile[] = [];
        const zoom = this.calculateOptimalZoom(bounds);
        const tileSize = CacheManager.TILE_SIZE / Math.pow(2, zoom);
        
        const minTileX = Math.floor(bounds.west / tileSize);
        const maxTileX = Math.floor(bounds.east / tileSize);
        const minTileY = Math.floor(bounds.south / tileSize);
        const maxTileY = Math.floor(bounds.north / tileSize);
        
        for (let x = minTileX; x <= maxTileX; x++) {
            for (let y = minTileY; y <= maxTileY; y++) {
                tiles.push({
                    x,
                    y,
                    zoom,
                    key: `tile-${zoom}-${x}-${y}`
                });
            }
        }
        
        return tiles;
    }

    private calculateOptimalZoom(bounds: { west: number, south: number, east: number, north: number }): number {
        const width = bounds.east - bounds.west;
        const height = bounds.north - bounds.south;
        const area = width * height;
        
        // Larger areas get lower zoom (bigger tiles), smaller areas get higher zoom (smaller tiles)
        if (area > 10) return 0; // Very large area
        if (area > 1) return 1;  // Large area
        if (area > 0.1) return 2; // Medium area
        return 3; // Small area
    }

    async getCachedResponse(key: string, env: any): Promise<Response | null> {
        try {
            const cached = await env.KV.get(key);
            if (!cached) return null;
            
            const data = JSON.parse(cached);
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=900',
                'X-Cache': 'HIT'
            };
            
            if (this.config.enableEdgeCache) {
                headers['CF-Cache-Status'] = 'HIT';
                headers['Vary'] = 'Accept-Encoding';
            }
            
            let responseBody = data.content;
            
            if (this.config.compressResponse && data.compressed) {
                headers['Content-Encoding'] = 'gzip';
                responseBody = this.base64ToArrayBuffer(data.content);
            }
            
            return new Response(responseBody, { headers });
        } catch (error) {
            console.log('Cache retrieval error:', error);
            return null;
        }
    }

    async storeResponse(key: string, data: any, env: any, ttl: number = this.config.defaultTtl): Promise<void> {
        try {
            let content = JSON.stringify(data);
            let compressed = false;
            
            if (this.config.compressResponse && content.length > 1024) {
                content = await this.compressData(content);
                compressed = true;
            }
            
            const cacheEntry = {
                content,
                compressed,
                timestamp: Date.now(),
                size: content.length
            };
            
            await env.KV.put(key, JSON.stringify(cacheEntry), { expirationTtl: ttl });
        } catch (error) {
            console.log('Cache storage error:', error);
        }
    }

    private async compressData(data: string): Promise<string> {
        // Simple base64 encoding for now - in production you'd use actual compression
        return btoa(unescape(encodeURIComponent(data)));
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    generateCacheKey(type: 'mapbox' | 'json', bounds?: { west: number, south: number, east: number, north: number }, extra?: string): string {
        if (type === 'json') {
            return extra ? `fueldata-${extra}` : 'fueldata';
        }
        
        if (bounds) {
            const precision = 3; // 3 decimal places for coordinates
            const w = bounds.west.toFixed(precision);
            const s = bounds.south.toFixed(precision);
            const e = bounds.east.toFixed(precision);
            const n = bounds.north.toFixed(precision);
            return `mapbox-bbox-${w},${s},${e},${n}`;
        }
        
        return 'mapbox-full';
    }

    async warmPopularRegions(env: any, fullData: any): Promise<void> {
        console.log('Warming cache for popular regions...');
        
        for (const region of CacheManager.POPULAR_REGIONS) {
            try {
                const features = this.filterStationsByBounds(fullData, region.bounds);
                const response = {
                    type: "FeatureCollection",
                    features
                };
                
                const cacheKey = this.generateCacheKey('mapbox', region.bounds);
                await this.storeResponse(cacheKey, response, env, 1800); // 30 minute TTL for popular regions
                
                console.log(`Warmed cache for ${region.name}: ${features.length} stations`);
            } catch (error) {
                console.log(`Failed to warm cache for ${region.name}:`, error);
            }
        }
    }

    private filterStationsByBounds(data: any, bounds: { west: number, south: number, east: number, north: number }): any[] {
        const features: any[] = [];
        
        for (let brand of Object.keys(data)) {
            for (let s of Object.keys(data[brand])) {
                let stn: any = data[brand][s];
                
                if (!stn.location || typeof stn.location.longitude !== 'number' || typeof stn.location.latitude !== 'number') {
                    continue;
                }
                
                const lng = stn.location.longitude;
                const lat = stn.location.latitude;
                
                if (lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north) {
                    let prices: any = [];
                    for (let fuel of Object.keys(stn.prices)) {
                        prices.push(`${fuel}: £${stn.prices[fuel]}`);
                    }
                    
                    features.push({
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [lng, lat]
                        },
                        "properties": {
                            "title": `${stn.address.brand}, ${stn.address.postcode}`,
                            "description": prices.join("<br />"),
                            "updated": stn.updated
                        }
                    });
                }
            }
        }
        
        return features;
    }

    createCacheHeaders(etag?: string, maxAge: number = 900): Record<string, string> {
        const headers: Record<string, string> = {
            'Cache-Control': `public, max-age=${maxAge}`,
            'Vary': 'Accept-Encoding'
        };
        
        if (etag) {
            headers['ETag'] = `"${etag}"`;
        }
        
        if (this.config.enableEdgeCache) {
            headers['CF-Cache-Status'] = 'MISS';
        }
        
        return headers;
    }
}
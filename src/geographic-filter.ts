/**
 * Server-side geographic filtering and spatial indexing for fuel stations
 */
import { STATION_LIMITS, GEOGRAPHIC_BOUNDS, MAP_CONFIG } from './constants'

export interface BoundingBox {
    north: number;
    south: number;
    east: number;
    west: number;
}

export interface DeviceCapabilities {
    isMobile: boolean;
    isLowEndMobile: boolean;
    maxStations: number;
}

export class GeographicFilter {
    /**
     * Parse bounding box from query parameters
     */
    static parseBoundingBox(boundingBoxParam: string): BoundingBox | null {
        try {
            const [west, south, east, north] = boundingBoxParam.split(',').map(parseFloat);
            
            // Validate bounds
            if (isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
                return null;
            }
            
            // Basic sanity checks
            if (west >= east || south >= north) {
                return null;
            }
            
            // Limit bounds to UK geographic bounds
            const clampedBounds = {
                west: Math.max(GEOGRAPHIC_BOUNDS.UK_WEST, Math.min(west, GEOGRAPHIC_BOUNDS.UK_EAST)),
                south: Math.max(GEOGRAPHIC_BOUNDS.UK_SOUTH, Math.min(south, GEOGRAPHIC_BOUNDS.UK_NORTH)),
                east: Math.max(GEOGRAPHIC_BOUNDS.UK_WEST, Math.min(east, GEOGRAPHIC_BOUNDS.UK_EAST)),
                north: Math.max(GEOGRAPHIC_BOUNDS.UK_SOUTH, Math.min(north, GEOGRAPHIC_BOUNDS.UK_NORTH))
            };
            
            return clampedBounds;
        } catch (error) {
            console.error('Error parsing bounding box:', error);
            return null;
        }
    }

    /**
     * Detect device capabilities using Cloudflare request data and User-Agent fallback
     */
    static detectDeviceCapabilities(request: Request): DeviceCapabilities {
        // Use Cloudflare's device type detection if available
        const cf = (request as any).cf;
        let isMobile = false;
        let isLowEndMobile = false;
        
        if (cf) {
            // Cloudflare provides device type information
            if (cf.deviceType) {
                isMobile = cf.deviceType === 'mobile' || cf.deviceType === 'tablet';
            }
            
            // Check for additional Cloudflare mobile indicators
            if (cf.isMobile !== undefined) {
                isMobile = cf.isMobile;
            }
            
            // Use bot management data (mobile crawlers are often identified)
            if (cf.botManagement && cf.botManagement.score < 30 && cf.botManagement.verifiedBot === false) {
                // Very low bot score might indicate mobile app traffic
                // This is a heuristic, not definitive
            }
        }
        
        // Fallback to User-Agent detection if Cloudflare data unavailable
        const userAgent = request.headers.get('User-Agent') || '';
        if (!cf || cf.deviceType === undefined) {
            const ua = userAgent.toLowerCase();
            isMobile = /mobile|android|iphone|ipad|phone|tablet/i.test(ua);
        }
        
        // Enhanced low-end mobile detection using Cloudflare data + User-Agent
        if (isMobile) {
            // Use Cloudflare connection data if available
            if (cf && cf.httpProtocol) {
                // HTTP/1.1 might indicate older devices, HTTP/2+ indicates newer
                if (cf.httpProtocol === 'HTTP/1.1') {
                    isLowEndMobile = true;
                }
            }
            
            // Use Cloudflare country/ASN data for additional context
            if (cf && cf.asn && cf.country) {
                // Some mobile carriers are known for budget devices
                const budgetCarrierASNs: number[] = [
                    // Add ASNs for carriers known for budget devices if needed
                ];
                if (budgetCarrierASNs.includes(Number(cf.asn))) {
                    isLowEndMobile = true;
                }
            }
            
            // Fallback to User-Agent heuristics
            const ua = userAgent.toLowerCase();
            if (!isLowEndMobile) {
                isLowEndMobile = (
                    /android [1-4]\./i.test(ua) ||
                    /cpu os [1-9]_/i.test(ua) ||
                    /windows phone/i.test(ua) ||
                    ua.includes('opera mini') ||
                    ua.includes('opera mobi') ||
                    ua.includes('ucbrowser') ||
                    /android.*go/i.test(ua) // Android Go devices
                );
            }
        }
        
        // Station limits based on device type using constants
        let maxStations: number;
        if (isLowEndMobile) {
            maxStations = STATION_LIMITS.LOW_END_MOBILE;
        } else if (isMobile) {
            maxStations = STATION_LIMITS.MOBILE;
        } else {
            maxStations = STATION_LIMITS.DESKTOP;
        }
        
        return {
            isMobile,
            isLowEndMobile,
            maxStations
        };
    }

    /**
     * Filter stations by geographic bounds
     */
    static filterStationsByBounds(stations: any[], bounds: BoundingBox): any[] {
        return stations.filter(station => {
            const coordinates = station.geometry?.coordinates;
            if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
                return false;
            }
            
            const [lng, lat] = coordinates;
            
            // Check if station is within bounds
            return lng >= bounds.west && lng <= bounds.east && 
                   lat >= bounds.south && lat <= bounds.north;
        });
    }

    /**
     * Apply device-specific station limits
     */
    static applyStationLimits(stations: any[], maxStations: number): any[] {
        if (stations.length <= maxStations) {
            return stations;
        }
        
        // Sort by importance (best prices first, then by average price)
        const sortedStations = stations.sort((a, b) => {
            // Prioritize best price stations
            if (a.properties?.is_best_price && !b.properties?.is_best_price) return -1;
            if (!a.properties?.is_best_price && b.properties?.is_best_price) return 1;
            
            // Then sort by lowest price (ascending)
            const aPrice = a.properties?.lowest_price || Infinity;
            const bPrice = b.properties?.lowest_price || Infinity;
            
            return aPrice - bPrice;
        });
        
        return sortedStations.slice(0, maxStations);
    }

    /**
     * Calculate distance between two points (rough approximation for sorting)
     */
    static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return MAP_CONFIG.EARTH_RADIUS_KM * c;
    }

    /**
     * Sort stations by proximity to center point
     */
    static sortByProximity(stations: any[], centerLat: number, centerLng: number): any[] {
        return stations.sort((a, b) => {
            const aCoords = a.geometry?.coordinates;
            const bCoords = b.geometry?.coordinates;
            
            if (!aCoords || !bCoords) return 0;
            
            const distA = this.calculateDistance(centerLat, centerLng, aCoords[1], aCoords[0]);
            const distB = this.calculateDistance(centerLat, centerLng, bCoords[1], bCoords[0]);
            
            return distA - distB;
        });
    }

    /**
     * Main filtering function that combines all optimizations
     */
    static filterAndOptimizeStations(
        stations: any[], 
        bounds?: BoundingBox, 
        deviceCapabilities?: DeviceCapabilities,
        centerLat?: number,
        centerLng?: number
    ): any[] {
        let filteredStations = stations;
        
        // Apply geographic bounds filtering
        if (bounds) {
            filteredStations = this.filterStationsByBounds(filteredStations, bounds);
        }
        
        // Sort by proximity if center point provided
        if (centerLat !== undefined && centerLng !== undefined) {
            filteredStations = this.sortByProximity(filteredStations, centerLat, centerLng);
        }
        
        // Apply device-specific limits
        if (deviceCapabilities) {
            filteredStations = this.applyStationLimits(filteredStations, deviceCapabilities.maxStations);
        }
        
        return filteredStations;
    }
}
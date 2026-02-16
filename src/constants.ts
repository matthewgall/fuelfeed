/**
 * Application-wide constants for FuelFeed
 * Centralized configuration to improve maintainability and clarity
 */

// Cache TTL values (in seconds)
export const CACHE_TTL = {
    FUEL_DATA: 86400,      // 24 hours - Raw fuel data from providers
    MAPBOX_DATA: 43200,    // 12 hours - Processed MapBox GeoJSON data
    BASE_DATA: 3600,       // 1 hour - Base cache for API responses
    POPULAR_REGIONS: 1800  // 30 minutes - Cache for high-traffic areas
} as const;

// Station filtering limits based on device capabilities
export const STATION_LIMITS = {
    LOW_END_MOBILE: 100,           // Ultra low-end mobile devices
    MOBILE: 300,                   // Standard mobile devices  
    DESKTOP: 1000,                 // Desktop/laptop devices
    SERVER_PROCESSING: 10000,      // Server-side processing with bounds
    SERVER_NO_BOUNDS: 15000        // Server-side processing without bounds
} as const;

// Price analysis thresholds (in pounds)
export const PRICE_THRESHOLDS = {
    LOW: 1.40,                     // Green - good price
    MEDIUM: 1.50,                  // Amber - average price
    // Above MEDIUM = Red - high price
    PENCE_CONVERSION: 10           // Threshold to convert pence to pounds
} as const;

// Device detection breakpoints (in pixels)
export const DEVICE_BREAKPOINTS = {
    MOBILE_WIDTH: 768,             // Standard mobile breakpoint
    LOW_END_MOBILE_WIDTH: 480,     // Low-end mobile devices
    ULTRA_LOW_END_WIDTH: 320,      // Ultra low-end devices
    LOW_END_CORES: 2,              // CPU core threshold for low-end detection
    LOW_END_MEMORY: 2              // GB RAM threshold for low-end detection
} as const;

// Geographic bounds for data filtering
export const GEOGRAPHIC_BOUNDS = {
    UK_WEST: -10,                  // Westernmost longitude for UK
    UK_EAST: 3,                    // Easternmost longitude for UK
    UK_SOUTH: 49,                  // Southernmost latitude for UK
    UK_NORTH: 61                   // Northernmost latitude for UK
} as const;

// Request timeout values (in milliseconds)
export const REQUEST_TIMEOUTS = {
    DESKTOP: 0,                    // No timeout for desktop
    MOBILE: 10000,                 // 10 seconds for mobile
    LOW_END_MOBILE: 15000,         // 15 seconds for low-end mobile
    ULTRA_LOW_END: 20000          // 20 seconds for ultra low-end devices
} as const;

// Debounce delays for API requests (in milliseconds)
export const DEBOUNCE_DELAYS = {
    DESKTOP: 500,                  // Fast response for desktop
    MOBILE: 1500,                  // Moderate delay for mobile
    LOW_END_MOBILE: 2000,         // Longer delay for low-end mobile
    ULTRA_LOW_END: 4000           // Very long delay for ultra low-end devices
} as const;

// Map configuration constants
export const MAP_CONFIG = {
    TILE_SIZE: 0.1,               // Degrees per tile for spatial caching
    EARTH_RADIUS_KM: 6371,        // Earth's radius in kilometers
    MIN_ZOOM_MOBILE: 6,           // Minimum zoom level for mobile
    MIN_ZOOM_DESKTOP: 4,          // Minimum zoom level for desktop
    MAX_ZOOM_MOBILE: 14,          // Maximum zoom level for mobile
    MAX_ZOOM_DESKTOP: 18          // Maximum zoom level for desktop
} as const;

// Dynamic pricing configuration
export const DYNAMIC_PRICING = {
    THRESHOLD_MARGIN: 0.05,       // 5p difference for good/high price thresholds
    MIN_SAMPLE_SIZE: 10,          // Minimum stations needed for reliable analysis
    OUTLIER_PERCENTILE: 0.1,      // Remove top/bottom 10% as outliers
    MIN_PRICE: 0.5,               // Minimum valid price in pounds
    MAX_PRICE: 5.0,               // Maximum valid price in pounds
    PENCE_TO_POUNDS_THRESHOLD: 10 // Prices above this are assumed to be in pence
} as const;

// Data quality bounds for plausibility checks (in pounds)
export const DATA_QUALITY_BOUNDS = {
    DEFAULT_MIN: 1.0,
    DEFAULT_MAX: 3.0,
    LPG_MIN: 0.3,
    LPG_MAX: 2.0
} as const;

// Static price fallback thresholds
export const STATIC_PRICE_FALLBACK = {
    LOW: 1.40,                    // Static fallback for low prices
    MEDIUM: 1.50                  // Static fallback for medium prices
} as const;

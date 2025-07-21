/**
 * Global type definitions for FuelFeed PWA
 */

// Global variables that will be available
declare global {
  const BUILD_TIMESTAMP: string;
  const maptilersdk: any; // MapTiler SDK loaded externally
  
  interface Window {
    map?: any;
    DeviceDetection?: any;
    ViewportPersistence?: any;
    GeolocationManager?: any;
    URLStateManager?: any;
    SEOManager?: any;
    OfflineDB?: any;
    offlineManager?: any;
    highlightStationId?: string;
    gc?: () => void; // Chrome's garbage collection
    debug?: any;
  }
}

// Device detection types
export interface DeviceCapabilities {
  isMobile: boolean;
  isLowEndMobile: boolean;
  maxStations: number;
  clientSafetyLimit: number;
}

// Location types
export interface Coordinates {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export interface Viewport {
  center: [number, number]; // [lng, lat]
  zoom: number;
  timestamp?: number;
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Station data types
export interface StationProperties {
  station_id: string;
  brand: string;
  address?: string;
  postcode?: string;
  prices?: { [fuelType: string]: number };
  updated?: string;
  is_best_price?: boolean;
  lowest_price?: number;
  price_description?: string;
}

export interface StationFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: StationProperties;
}

export interface StationCollection {
  type: 'FeatureCollection';
  features: StationFeature[];
  cached?: boolean;
  timestamp?: number;
}

// Cache types
export interface CacheMetadata {
  key: string;
  data: any;
  expiry: number;
  created: number;
}

// Offline DB types
export interface StoredStation {
  id: string;
  brand: string;
  address: string;
  postcode: string;
  lat: number;
  lng: number;
  prices: { [fuelType: string]: number };
  updated: string;
  isBestPrice: boolean;
  lowestPrice: number | null;
  priceDescription: string;
  data: StationFeature; // Full GeoJSON feature
}

export interface UserPreference {
  key: string;
  value: any;
  updated: number;
}

export interface SearchHistoryEntry {
  id?: number;
  location: Coordinates;
  bounds: BoundingBox;
  resultCount: number;
  timestamp: number;
}

// Performance monitoring types
export interface PerformanceMetrics {
  performanceIssues: number;
  isLowPerformanceMode: boolean;
  memoryUsage?: {
    used: number;
    total: number;
    percentage: number;
  };
}

// Export empty object to make this a module
export {};
/**
 * FuelFeed PWA - Main Entry Point
 * Built with TypeScript for better maintainability and type safety
 */

// Import types first
import './types/global';

// Import utilities
import { DeviceDetection } from './utils/device-detection';
import { PerformanceMonitor } from './utils/performance-monitor';
import { MemoryManager } from './utils/memory-manager';

// Import location services
import { ViewportPersistence } from './location/viewport-persistence';
import { GeolocationManager } from './location/geolocation-manager';
import { URLStateManager } from './location/url-state-manager';
import { SEOManager } from './location/seo-manager';

// Import offline services
import { OfflineDB } from './offline/offline-db';
import { OfflineManager } from './offline/offline-manager';

// Import map and app
import { initializeMap } from './map/map-init';
import { initializeApp } from './app/app-main';

// Make utilities globally available for backward compatibility
(window as any).DeviceDetection = DeviceDetection;
(window as any).ViewportPersistence = ViewportPersistence;
(window as any).GeolocationManager = GeolocationManager;
(window as any).URLStateManager = URLStateManager;
(window as any).SEOManager = SEOManager;
(window as any).OfflineDB = OfflineDB;
(window as any).PerformanceMonitor = PerformanceMonitor;
(window as any).MemoryManager = MemoryManager;

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

async function initialize() {
    try {
        console.log('🚀 Initializing FuelFeed PWA...');
        console.log(`Built at: ${BUILD_TIMESTAMP}`);
        
        // Initialize offline DB first
        await OfflineDB.init();
        
        // Initialize offline manager
        const offlineManager = new OfflineManager();
        (window as any).offlineManager = offlineManager;
        
        // Initialize map
        await initializeMap();
        
        // Initialize main app
        await initializeApp();
        
        console.log('✅ FuelFeed PWA initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize FuelFeed PWA:', error);
    }
}

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/js/worker.js')
            .then((registration) => {
                console.log('✅ Service Worker registered:', registration.scope);
                
                // Listen for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('🔄 New version available - refresh to update');
                            }
                        });
                    }
                });
            })
            .catch((error) => {
                console.error('❌ Service Worker registration failed:', error);
            });
    });
}

// Debugging utilities
if (process.env.NODE_ENV === 'development') {
    (window as any).debug = {
        deviceDetection: DeviceDetection,
        performanceMonitor: PerformanceMonitor,
        memoryManager: MemoryManager,
        offlineDB: OfflineDB,
        viewportPersistence: ViewportPersistence
    };
}
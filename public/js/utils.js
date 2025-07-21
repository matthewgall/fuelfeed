/**
 * General utility functions for the FuelFeed frontend
 */

/**
 * Debounce function to limit the rate at which a function can fire
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Mobile detection utilities
 */
const DeviceDetection = {
    get isMobile() {
        return window.innerWidth <= 768;
    },
    
    get isLowEndMobile() {
        return window.innerWidth <= 480 || navigator.hardwareConcurrency <= 2;
    },
    
    get clientSafetyLimit() {
        if (this.isLowEndMobile) {
            return 100; // Ultra low-end mobile devices
        } else if (this.isMobile) {
            return 300; // Standard mobile devices  
        } else {
            return 1000; // Desktop/laptop devices
        }
    }
};

/**
 * Performance monitoring utilities
 */
const PerformanceUtils = {
    performanceIssues: 0,
    isLowPerformanceMode: false,
    
    detectLowPerformanceMode() {
        const memoryInfo = performance.memory;
        if (memoryInfo) {
            const usedMB = memoryInfo.usedJSHeapSize / 1024 / 1024;
            const totalMB = memoryInfo.totalJSHeapSize / 1024 / 1024;
            
            // If using more than 80% of available memory or more than 100MB
            if (usedMB / totalMB > 0.8 || usedMB > 100) {
                this.performanceIssues++;
                if (this.performanceIssues > 3 && !this.isLowPerformanceMode) {
                    console.warn('Switching to low performance mode due to memory pressure');
                    this.isLowPerformanceMode = true;
                    return true;
                }
            }
        }
        return false;
    }
};

/**
 * Map bounds utilities
 */
function getMapBounds() {
    try {
        if (!map || !map.getBounds) {
            console.warn('Map not available for bounds calculation');
            return null;
        }
        
        const bounds = map.getBounds();
        const boundingBox = [
            bounds.getWest(),
            bounds.getSouth(), 
            bounds.getEast(),
            bounds.getNorth()
        ].join(',');
        
        return {
            bbox: boundingBox,
            center: map.getCenter(),
            zoom: map.getZoom()
        };
    } catch (error) {
        console.error('Error getting map bounds:', error);
        return null;
    }
}

/**
 * Memory cleanup utilities
 */
const MemoryManager = {
    cleanupMemory() {
        // Clear any inactive popup references
        if (window.gc) {
            try {
                window.gc();
                console.log('Manual garbage collection triggered');
            } catch (e) {
                // Ignore if GC not available
            }
        }
        
        // Clear detail cache for stations not visible
        if (typeof stationDetailCache !== 'undefined') {
            const bounds = getMapBounds();
            if (bounds && stationDetailCache.size > 50) {
                console.log('Clearing detail cache for memory management');
                stationDetailCache.clear();
                detailLoadingCache.clear();
            }
        }
    },
    
    aggressiveCleanup() {
        if (typeof stationDetailCache !== 'undefined') {
            stationDetailCache.clear();
        }
        if (typeof detailLoadingCache !== 'undefined') {
            detailLoadingCache.clear();
        }
        if (typeof stationCache !== 'undefined' && stationCache.clear) {
            stationCache.clear();
        }
        
        this.cleanupMemory();
        console.log('Aggressive memory cleanup completed');
    }
};
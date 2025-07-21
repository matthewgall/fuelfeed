if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker
        .register("/js/worker.js")
        .then(res => console.log("service worker registered"))
        .catch(err => console.log("service worker not registered", err))
    })
}

maptilersdk.config.apiKey = 'cwsqqYCkA54i9eIGaph9';

// Version compatibility check
if (typeof maptilersdk.version !== 'undefined') {
    console.log('MapTiler SDK version:', maptilersdk.version);
} else {
    console.log('MapTiler SDK version not available');
}

// Check for required APIs
if (!maptilersdk.Map || !maptilersdk.Popup) {
    console.error('Required MapTiler APIs not available');
}

// Mobile detection (must be at top before map initialization)
const isMobile = window.innerWidth <= 768; // Broader mobile detection
const isLowEndMobile = window.innerWidth <= 480 || navigator.hardwareConcurrency <= 2;

// Viewport persistence system
class ViewportPersistence {
    static STORAGE_KEY = 'fuelfeed-viewport';
    static DEFAULT_VIEWPORT = {
        center: [-2.0, 53.5], // Center on UK
        zoom: isMobile ? 7 : 6
    };
    
    static saveViewport(center, zoom) {
        try {
            const viewport = {
                center: [center.lng, center.lat],
                zoom: zoom,
                timestamp: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(viewport));
            console.log('Viewport saved:', viewport);
        } catch (error) {
            console.warn('Failed to save viewport:', error);
        }
    }
    
    static loadViewport() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return this.DEFAULT_VIEWPORT;
            
            const viewport = JSON.parse(stored);
            
            // Check if stored viewport is too old (older than 30 days)
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            if (Date.now() - viewport.timestamp > maxAge) {
                localStorage.removeItem(this.STORAGE_KEY);
                return this.DEFAULT_VIEWPORT;
            }
            
            // Validate coordinates are within reasonable bounds (UK area)
            const [lng, lat] = viewport.center;
            if (lng < -8 || lng > 2 || lat < 49 || lat > 61) {
                console.warn('Stored viewport outside UK bounds, using default');
                return this.DEFAULT_VIEWPORT;
            }
            
            // Validate zoom level
            if (viewport.zoom < 4 || viewport.zoom > 18) {
                viewport.zoom = this.DEFAULT_VIEWPORT.zoom;
            }
            
            console.log('Viewport loaded:', viewport);
            return viewport;
        } catch (error) {
            console.warn('Failed to load viewport:', error);
            return this.DEFAULT_VIEWPORT;
        }
    }
    
    static clearViewport() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            console.log('Viewport cleared');
        } catch (error) {
            console.warn('Failed to clear viewport:', error);
        }
    }
}

// Load saved viewport or use defaults
const savedViewport = ViewportPersistence.loadViewport();

// Mobile-optimized map configuration with v3.6.0 compatibility
var map;
try {
    map = new maptilersdk.Map({
        container: 'map',
        style: maptilersdk.MapStyle.STREETS,
        center: savedViewport.center,
        zoom: savedViewport.zoom,
        minZoom: isMobile ? 6 : 4, // Prevent zooming out too far on mobile
        maxZoom: isMobile ? 14 : 18, // Limit max zoom on mobile
        // Mobile-friendly interaction options
        touchZoomRotate: true, // Enable touch zoom for better UX
        dragRotate: false, // Disable rotation for simpler mobile UX
        touchPitch: false, // Disable pitch for simpler mobile UX
        doubleClickZoom: false, // Prevent accidental double-tap zoom
        scrollZoom: isMobile ? false : { around: 'center' }, // Disable scroll zoom on mobile
        dragPan: true, // Always enable drag panning
        keyboard: false, // Disable keyboard navigation on mobile
        boxZoom: false, // Disable box zoom on mobile
        trackResize: !isMobile, // Reduce resize tracking on mobile
        renderWorldCopies: false // Don't render world copies for performance
    });
    
    console.log('MapTiler map initialized successfully');
} catch (mapError) {
    console.error('Failed to initialize MapTiler map:', mapError);
    
    // Fallback: try with minimal options
    try {
        map = new maptilersdk.Map({
            container: 'map',
            style: maptilersdk.MapStyle.STREETS,
            center: [-2.0, 53.5],
            zoom: 6
        });
        console.log('Map initialized with fallback configuration');
    } catch (fallbackError) {
        console.error('Map initialization completely failed:', fallbackError);
    }
}

// Debounce function to limit API calls
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

// Initialize advanced caching system
const stationCache = new StationCache();
let currentRequest = null;

// Popup management and error prevention
let popupCreationInProgress = false;
let popupErrorCount = 0;
const MAX_POPUP_ERRORS = 3;
let activePopup = null;
let popupClickCount = 0;

// Comprehensive popup cleanup function
function cleanupAllPopups() {
    try {
        // Close active popup if exists
        if (activePopup && activePopup.remove) {
            activePopup.remove();
        }
        activePopup = null;
        
        // Remove all popup DOM elements
        const allPopups = document.querySelectorAll('.maplibregl-popup, .mapboxgl-popup, .fuel-station-popup');
        allPopups.forEach(popup => {
            if (popup && popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        });
        
        // Force cleanup of any orphaned popup elements
        const popupContainers = document.querySelectorAll('[class*="popup"]');
        popupContainers.forEach(container => {
            if (container.classList.toString().includes('popup') && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        });
        
    } catch (cleanupError) {
        console.warn('Popup cleanup error:', cleanupError);
    }
}

// Function to get current map bounds as object
function getMapBounds() {
    try {
        if (!map || !map.getBounds) {
            console.warn('Map not available for bounds calculation');
            return null;
        }
        
        const bounds = map.getBounds();
        if (!bounds) {
            console.warn('Map bounds not available');
            return null;
        }
        
        return {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
        };
    } catch (error) {
        console.error('Error getting map bounds:', error);
        return null;
    }
}

// Function to load stations for current viewport with intelligent caching
function loadStationsInView() {
    const bounds = getMapBounds();
    
    if (!bounds) {
        console.warn('Cannot load stations - map bounds not available');
        return;
    }
    
    // Skip loading if zoom level is too low on mobile (reduces data)
    try {
        if (isMobile && map.getZoom && map.getZoom() < 8) {
            console.log('Skipping station load - zoom too low for mobile');
            if (map.getSource && map.getSource('stations')) {
                map.getSource('stations').setData({type: 'FeatureCollection', features: []});
            }
            return;
        }
    } catch (error) {
        console.warn('Error checking zoom level:', error);
    }
    
    // Check if we have all required data cached
    if (stationCache.hasValidData(bounds)) {
        console.log('Loading stations from cache');
        const cachedData = stationCache.getStations(bounds);
        
        // Limit stations on mobile devices
        if (isMobile && cachedData.features.length > getMaxStations()) {
            cachedData.features = cachedData.features.slice(0, getMaxStations());
        }
        
        try {
            if (map.getSource && map.getSource('stations')) {
                map.getSource('stations').setData(cachedData);
            } else {
                console.warn('Stations source not available for cached data');
            }
        } catch (error) {
            console.error('Error setting cached station data:', error);
        }
        console.log(`Loaded ${cachedData.features.length} stations from cache`);
        return;
    }
    
    // Cancel previous request if still pending
    if (currentRequest) {
        currentRequest.abort();
    }
    
    // Create bbox parameter for API with station limit
    const maxStations = getMaxStations();
    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
    const url = `/api/data.mapbox?bbox=${bbox}&limit=${maxStations}`;
    console.log(`Fetching max ${maxStations} stations from API for bounds:`, bbox);
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    
    // Create new AbortController for this request
    const controller = new AbortController();
    currentRequest = controller;
    
    // Add timeout for mobile devices
    const timeoutId = isLowEndMobile ? setTimeout(() => {
        controller.abort();
        console.warn('Request timeout on low-end mobile');
    }, 10000) : null;
    
    // Fetch data with abort signal
    fetch(url, { signal: controller.signal })
        .then(response => response.json())
        .then(data => {
            if (timeoutId) clearTimeout(timeoutId);
            
            // Limit stations for mobile performance
            if (isMobile && data.features && data.features.length > maxStations) {
                data.features = data.features.slice(0, maxStations);
                console.log(`Limited to ${maxStations} stations for mobile performance`);
            }
            
            // Update the data source with new data
            try {
                if (map.getSource && map.getSource('stations')) {
                    map.getSource('stations').setData(data);
                } else {
                    console.warn('Stations source not available for data update');
                }
            } catch (error) {
                console.error('Error updating station data:', error);
            }
            
            // Store in cache for future use
            stationCache.storeStations(bounds, data);
            
            console.log(`Loaded ${data.features.length} stations from API`);
            
            // Hide loading indicator
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            currentRequest = null;
        })
        .catch(error => {
            if (timeoutId) clearTimeout(timeoutId);
            
            if (error.name !== 'AbortError') {
                console.error('Error loading stations:', error);
                trackPerformanceIssue();
            }
            
            // Hide loading indicator on error
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            currentRequest = null;
        });
}

// Mobile-optimized debouncing with longer delay on mobile
const debounceDelay = isLowEndMobile ? 2000 : isMobile ? 1500 : 500; // Much longer delays for stability
const debouncedLoadStations = debounce(loadStationsInView, debounceDelay);

// Station limits based on device capability
const getMaxStations = () => {
    if (isLowEndMobile) return 100; // Very low limit for low-end devices
    if (isMobile) return 300; // Moderate limit for mobile
    return 1000; // Higher limit for desktop
};

// Memory cleanup for mobile
function cleanupMemory() {
    if (isMobile) {
        // Force garbage collection hint
        if (window.gc && typeof window.gc === 'function') {
            window.gc();
        }
        
        // Clear all popups on mobile for memory
        const oldPopups = document.querySelectorAll('.mapboxgl-popup');
        oldPopups.forEach(popup => popup.remove());
        
        // Clear event listeners cache if it exists
        if (window.maptilersdk && map._listeners) {
            // Reduce listener overhead on mobile
            console.log('Cleaning mobile memory');
        }
        
        // Clear any cached DOM references
        const unusedElements = document.querySelectorAll('[data-cleanup="true"]');
        unusedElements.forEach(el => el.remove());
    }
}

// Aggressive memory management for low-end devices
function aggressiveCleanup() {
    if (isLowEndMobile) {
        cleanupMemory();
        
        // Clear cache more aggressively
        stationCache.clear();
        
        // Reset performance counter
        performanceIssues = 0;
        
        console.log('Aggressive cleanup performed');
    }
}

// Performance monitoring
let performanceIssues = 0;
let isLowPerformanceMode = false;

function trackPerformanceIssue() {
    performanceIssues++;
    
    if (performanceIssues > 3 && isLowEndMobile) {
        console.warn('Entering low performance mode');
        isLowPerformanceMode = true;
        aggressiveCleanup();
        
        // Disable expensive features
        if (map.getLayer('stations-labels')) {
            map.setLayoutProperty('stations-labels', 'visibility', 'none');
        }
    } else if (performanceIssues > 5 && isMobile) {
        console.warn('Multiple performance issues detected, reducing functionality');
        isLowPerformanceMode = true;
        
        // Reduce cache size and cleanup
        stationCache.clear();
        cleanupMemory();
    }
}

// Monitor frame rate and trigger cleanup
let frameCount = 0;
let lastFrameTime = performance.now();

function monitorPerformance() {
    if (!isMobile) return;
    
    frameCount++;
    const now = performance.now();
    
    if (frameCount % 60 === 0) { // Check every 60 frames
        const fps = 1000 / ((now - lastFrameTime) / 60);
        
        if (fps < 20 && isLowEndMobile) {
            console.warn(`Low FPS detected: ${fps.toFixed(1)}`);
            trackPerformanceIssue();
        }
        
        lastFrameTime = now;
    }
    
    requestAnimationFrame(monitorPerformance);
}

map.on('load', function () {
    try {
        // Add error handling for map operations
        if (!map || !map.addSource) {
            console.error('Map not properly initialized');
            return;
        }
        
        // Add a source for the stations - initially empty
        map.addSource('stations', {
            'type': 'geojson',
            'data': {
                'type': 'FeatureCollection',
                'features': []
            }
        });
    } catch (error) {
        console.error('Error adding map source:', error);
        return;
    }

    // Add enhanced station layer with price-based styling (simplified for mobile)
    const stationLayerConfig = {
        'id': 'stations-layer',
        'source': 'stations',
        'type': 'circle',
        'paint': isMobile ? {
            // Simplified mobile rendering
            'circle-radius': isLowEndMobile ? 8 : [
                'interpolate',
                ['linear'],
                ['zoom'],
                6, 4,
                10, 8,
                14, 12
            ],
            'circle-color': [
                'case',
                ['get', 'is_best_price'], '#FFD700', // Gold for best prices
                ['has', 'lowest_price'], [
                    'step',
                    ['get', 'lowest_price'],
                    '#00C851', 1.40, '#ffbb33', 1.50, '#FF4444'
                ],
                '#007cbf'
            ],
            'circle-stroke-width': isLowEndMobile ? 1 : 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9,
            'circle-stroke-opacity': 0.8
        } : {
            // Full desktop rendering
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                8, 6,
                12, 10,
                16, 14
            ],
            'circle-color': [
                'case',
                ['get', 'is_best_price'], '#FFD700',
                ['has', 'lowest_price'],
                [
                    'interpolate',
                    ['linear'],
                    ['get', 'lowest_price'],
                    1.30, '#00C851',
                    1.40, '#ffbb33',
                    1.50, '#FF4444'
                ],
                '#007cbf'
            ],
            'circle-stroke-width': [
                'case',
                ['get', 'is_best_price'], 4,
                2
            ],
            'circle-stroke-color': [
                'case',
                ['get', 'is_best_price'], '#FF6B35',
                '#ffffff'
            ],
            'circle-opacity': [
                'case',
                ['get', 'is_best_price'], 1.0,
                0.8
            ],
            'circle-stroke-opacity': 1
        }
    };
    
    try {
        map.addLayer(stationLayerConfig);
    } catch (error) {
        console.error('Error adding station layer:', error);
        return;
    }
    
    // Add a label layer for station brands (simplified for mobile)
    if (!isLowEndMobile) {
        try {
            map.addLayer({
                'id': 'stations-labels',
                'source': 'stations',
                'type': 'symbol',
                'layout': {
                    'text-field': ['get', 'brand'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': isMobile ? [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        8, 0,
                        10, 8,
                        14, 10
                    ] : [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, 0,
                        12, 10,
                        16, 12
                    ],
                    'text-offset': [0, 2],
                    'text-anchor': 'top'
                },
                'paint': {
                    'text-color': '#333333',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': isMobile ? 0.5 : 1
                }
            });
        } catch (error) {
            console.error('Error adding labels layer:', error);
        }
    }

    // Load initial data for current view
    loadStationsInView();

    // Reload data when map moves (debounced) - reduce events on mobile
    try {
        if (!isLowEndMobile) {
            map.on('moveend', debouncedLoadStations);
            map.on('zoomend', debouncedLoadStations);
        } else {
            // Very limited event handling for low-end devices
            map.on('zoomend', debouncedLoadStations);
        }
    } catch (error) {
        console.error('Error adding map event listeners:', error);
    }
    
    // Mobile-specific optimizations
    if (isMobile) {
        // More aggressive cleanup on mobile
        setInterval(cleanupMemory, isLowEndMobile ? 60 * 1000 : 2 * 60 * 1000); // Every 1-2 minutes
        
        // Reduce cache cleanup frequency on mobile
        setInterval(() => {
            stationCache.clearExpired();
            if (isLowPerformanceMode) {
                aggressiveCleanup();
            }
        }, isLowEndMobile ? 5 * 60 * 1000 : 10 * 60 * 1000); // Every 5-10 minutes
        
        // Add visibility change handler to cleanup when app goes to background
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                cleanupMemory();
                // Cancel any pending requests when app goes to background
                if (currentRequest) {
                    currentRequest.abort();
                    currentRequest = null;
                }
                // Aggressive cleanup when backgrounded
                if (isLowEndMobile) {
                    aggressiveCleanup();
                }
            } else if (!document.hidden && isLowEndMobile) {
                // Reload data when coming back to foreground on low-end devices
                setTimeout(() => {
                    loadStationsInView();
                }, 1000);
            }
        });
        
        // Start performance monitoring
        if (isLowEndMobile) {
            requestAnimationFrame(monitorPerformance);
        }
        
        // Reset popup error count periodically to allow recovery
        setInterval(() => {
            if (popupErrorCount > 0) {
                popupErrorCount = Math.max(0, popupErrorCount - 1);
                console.log('Popup error count reset to:', popupErrorCount);
            }
            
            // Periodic deep cleanup to prevent memory leaks
            if (popupClickCount > 10) {
                console.log('Performing deep popup cleanup');
                cleanupAllPopups();
                popupClickCount = 0;
            }
        }, 30000); // Reset one error every 30 seconds
    } else {
        // Desktop cleanup (original frequency)
        setInterval(() => {
            stationCache.clearExpired();
        }, 5 * 60 * 1000);
    }

    // Mobile-optimized popup for station info with improved state management
    map.on('click', 'stations-layer', function (e) {
        console.log('Station clicked, event:', e);
        console.log('Event lngLat:', e.lngLat);
        console.log('Event features:', e.features);
        
        // Track popup clicks and force cleanup periodically
        popupClickCount++;
        
        // Force cleanup every 4 clicks to prevent state corruption
        if (popupClickCount % 4 === 0) {
            console.log('Performing periodic popup cleanup');
            cleanupAllPopups();
            // Brief pause to let cleanup complete, but copy all event data deeply
            const eventData = {
                features: e.features ? [...e.features] : [],
                lngLat: e.lngLat ? { lng: e.lngLat.lng, lat: e.lngLat.lat } : null,
                point: e.point ? { x: e.point.x, y: e.point.y } : null
            };
            console.log('Preserved event data:', eventData);
            setTimeout(() => {
                handlePopupClick(eventData);
            }, 50);
            return;
        }
        
        handlePopupClick(e);
    });
    
    // Separate popup handling function for better control
    function handlePopupClick(e) {
        // Prevent recursion and limit errors
        if (popupCreationInProgress) {
            console.warn('Popup creation already in progress, skipping');
            return;
        }
        
        if (popupErrorCount >= MAX_POPUP_ERRORS) {
            console.error('Too many popup errors, disabling popup creation');
            return;
        }
        
        popupCreationInProgress = true;
        
        try {
            // Basic validation first
            if (!e || !e.features || !e.features[0]) {
                console.warn('Invalid click event or no features');
                return;
            }
            
            const feature = e.features[0];
            if (!feature.properties) {
                console.warn('Feature has no properties');
                return;
            }
            
            const props = feature.properties;
            
            // Clean up existing popups using our comprehensive function
            cleanupAllPopups();
            
            // Get coordinates safely with multiple fallback methods
            let coordinates = null;
            
            // Method 1: Use event coordinates
            if (e.lngLat && typeof e.lngLat.lng === 'number' && typeof e.lngLat.lat === 'number') {
                coordinates = { lng: e.lngLat.lng, lat: e.lngLat.lat };
                console.log('Using event coordinates:', coordinates);
            } 
            // Method 2: Use feature geometry
            else if (feature.geometry && feature.geometry.coordinates && Array.isArray(feature.geometry.coordinates)) {
                const coords = feature.geometry.coordinates;
                if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                    coordinates = { lng: coords[0], lat: coords[1] };
                    console.log('Using feature geometry coordinates:', coordinates);
                }
            }
            // Method 3: Try to convert pixel coordinates if available
            else if (e.point && map.unproject) {
                try {
                    const unprojected = map.unproject(e.point);
                    if (unprojected && typeof unprojected.lng === 'number' && typeof unprojected.lat === 'number') {
                        coordinates = { lng: unprojected.lng, lat: unprojected.lat };
                        console.log('Using unprojected coordinates:', coordinates);
                    }
                } catch (unprojectError) {
                    console.warn('Failed to unproject coordinates:', unprojectError);
                }
            }
            
            if (!coordinates) {
                console.error('No valid coordinates found for popup');
                console.log('Event lngLat:', e.lngLat);
                console.log('Feature geometry:', feature.geometry);
                return;
            }
            
            console.log('Using coordinates for popup:', coordinates);
            
            // Use server-generated popup HTML for better performance
            let content;
            if (props.popup_html) {
                // Use server-generated popup HTML
                content = props.popup_html;
            } else if (props.description) {
                // Fallback: parse description for older data
                try {
                    const prices = props.description.split('<br />');
                    const priceItems = [];
                    
                    for (let i = 0; i < Math.min(prices.length, 3); i++) { // Limit to 3 for safety
                        const price = prices[i];
                        if (price && price.trim()) {
                            const match = price.match(/([⛽💎])\s+([^£]+)£([\d.]+)/);
                            if (match) {
                                const icon = match[1];
                                const fuel = match[2].trim().replace(/\([^)]*\)/g, '').trim();
                                const priceVal = parseFloat(match[3]);
                                
                                if (!isNaN(priceVal)) {
                                    let color = '#333';
                                    if (priceVal < 1.40) color = '#00C851';
                                    else if (priceVal < 1.50) color = '#ffbb33';
                                    else color = '#FF4444';
                                    
                                    priceItems.push(`
                                        <div style="
                                            display: flex; 
                                            justify-content: space-between; 
                                            align-items: center;
                                            padding: 6px 0; 
                                            border-bottom: 1px solid #f0f0f0;
                                            margin: 0;
                                        ">
                                            <span style="
                                                font-size: 13px; 
                                                color: #555;
                                                font-weight: 500;
                                                display: flex;
                                                align-items: center;
                                            ">
                                                <span style="margin-right: 8px; font-size: 14px;">${icon}</span>
                                                ${fuel}
                                            </span>
                                            <span style="
                                                color: ${color}; 
                                                font-weight: bold; 
                                                font-size: 14px;
                                                background: ${color}15;
                                                padding: 2px 8px;
                                                border-radius: 12px;
                                            ">£${priceVal.toFixed(2)}</span>
                                        </div>
                                    `);
                                }
                            }
                        }
                    }
                    priceContent = priceItems.join('');
                } catch (parseError) {
                    console.warn('Price parsing failed:', parseError);
                    priceContent = '<div style="font-size: 12px; color: #999;">Price data unavailable</div>';
                }
                
                // Build fallback content for older data without server-generated popup
                const titleParts = (props.title || 'Station').split(', ');
                const brand = titleParts[0] || 'Station';
                const location = titleParts.slice(1).join(', ') || '';
                
                content = `
                <div style="
                    max-width: 320px; 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    overflow: hidden;
                    margin: 0;
                ">
                    <div style="
                        background: ${props.is_best_price ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}; 
                        color: ${props.is_best_price ? '#333' : 'white'}; 
                        padding: 12px 15px; 
                        margin: 0;
                    ">
                        <h3 style="
                            margin: 0; 
                            font-size: 16px; 
                            font-weight: 600;
                            line-height: 1.2;
                        ">
                            ${props.is_best_price ? '🏆 ' : ''}${brand}
                        </h3>
                        ${location ? `<div style="font-size: 11px; opacity: 0.9; margin-top: 4px; line-height: 1.3;">📍 ${location}</div>` : ''}
                    </div>
                    <div style="padding: 15px;">
                        <h4 style="
                            margin: 0 0 10px 0; 
                            font-size: 13px; 
                            color: #666; 
                            text-transform: uppercase; 
                            letter-spacing: 0.5px;
                            font-weight: 600;
                        ">
                            Current Prices
                        </h4>
                        <div style="margin-top: 8px;">
                            ${priceContent || '<div style="font-size: 12px; color: #999; font-style: italic;">No price data available</div>'}
                        </div>
                    </div>
                </div>
                `;
            } else {
                // No popup data available
                content = `
                    <div style="
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        padding: 15px;
                        text-align: center;
                        color: #666;
                    ">
                        <div style="font-size: 14px;">Station information unavailable</div>
                    </div>
                `;
            }
            
            // Create popup with v3.6.0 compatible options and better error handling
            try {
                // Ensure we have valid MapTiler SDK
                if (!maptilersdk || !maptilersdk.Popup) {
                    throw new Error('MapTiler SDK not available');
                }
                
                const popup = new maptilersdk.Popup({
                    closeButton: true,
                    closeOnClick: true,
                    maxWidth: '350px'
                });
                
                // Verify popup object is valid
                if (!popup || typeof popup.setLngLat !== 'function' || typeof popup.setHTML !== 'function' || typeof popup.addTo !== 'function') {
                    throw new Error('Invalid popup object or methods');
                }
                
                // Validate coordinates one more time before setting
                if (!coordinates || typeof coordinates.lng !== 'number' || typeof coordinates.lat !== 'number') {
                    throw new Error('Invalid coordinates at popup creation: ' + JSON.stringify(coordinates));
                }
                
                console.log('Setting popup coordinates:', coordinates);
                console.log('Map object:', map);
                console.log('Popup object:', popup);
                
                // Use the same approach that works for the test popup
                popup.setLngLat(coordinates);
                popup.setHTML(content);
                popup.addTo(map);
                
                // Track the active popup
                activePopup = popup;
                
                // Add event listener for when popup is closed
                popup.on('close', () => {
                    if (activePopup === popup) {
                        activePopup = null;
                    }
                });
                
                console.log('Popup created successfully');
                
            } catch (popupError) {
                console.error('MapTiler popup creation failed:', popupError);
                popupErrorCount++;
                
                // Force cleanup on error
                cleanupAllPopups();
                
                // Simple fallback for mobile
                if (isLowEndMobile && props.title) {
                    setTimeout(() => {
                        alert(props.title);
                    }, 100);
                }
            }
                
        } catch (error) {
            console.error('Popup handler failed:', error);
            popupErrorCount++;
            trackPerformanceIssue();
            
            // Force cleanup on error
            cleanupAllPopups();
        } finally {
            // Always reset the flag to prevent permanent blocking
            setTimeout(() => {
                popupCreationInProgress = false;
            }, 100);
        }
    }

    // Simplified hover effects for mobile performance
    if (!isMobile) {
        // Desktop-only hover effects
        let hoverTimeout = null;
        
        map.on('mouseenter', 'stations-layer', function (e) {
            map.getCanvas().style.cursor = 'pointer';
            
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                try {
                    map.setPaintProperty('stations-layer', 'circle-stroke-width', [
                        'case',
                        ['==', ['get', 'title'], e.features[0].properties.title],
                        4, 2
                    ]);
                } catch (error) {
                    console.warn('Hover effect failed:', error);
                }
            }, 50);
        });

        map.on('mouseleave', 'stations-layer', function () {
            map.getCanvas().style.cursor = '';
            clearTimeout(hoverTimeout);
            
            try {
                map.setPaintProperty('stations-layer', 'circle-stroke-width', 2);
            } catch (error) {
                console.warn('Hover reset failed:', error);
            }
        });
        
        // Also apply hover effects to labels (desktop only)
        if (map.getLayer('stations-labels')) {
            map.on('mouseenter', 'stations-labels', function () {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', 'stations-labels', function () {
                map.getCanvas().style.cursor = '';
            });
            
            // Make labels clickable too
            map.on('click', 'stations-labels', function (e) {
                // Trigger the same popup as clicking on the circle
                const feature = e.features[0];
                if (feature && feature.properties) {
                    const syntheticEvent = {
                        features: [feature],
                        lngLat: e.lngLat
                    };
                    // Manually trigger popup creation
                    map.fire('click', { target: map, lngLat: e.lngLat, point: e.point, features: [feature] });
                }
            });
        }
    } else {
        // Mobile-only simple cursor change
        map.on('mouseenter', 'stations-layer', function () {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'stations-layer', function () {
            map.getCanvas().style.cursor = '';
        });
    }
});

// Global functions for cache management (useful for debugging)
window.cacheStats = () => {
    const stats = stationCache.getStats();
    console.table(stats);
    return stats;
};

window.clearCache = () => {
    stationCache.clear();
    console.log('Cache cleared manually');
};

window.refreshStations = () => {
    stationCache.clear();
    loadStationsInView();
    console.log('Stations refreshed');
};

// Log cache stats on page load for debugging
setTimeout(() => {
    const stats = stationCache.getStats();
    console.log('Cache initialized:', stats);
}, 1000);

// Add viewport persistence event listeners
let viewportSaveTimeout = null;

function saveCurrentViewport() {
    if (!map || !map.getCenter || !map.getZoom) return;
    
    try {
        const center = map.getCenter();
        const zoom = map.getZoom();
        ViewportPersistence.saveViewport(center, zoom);
    } catch (error) {
        console.warn('Failed to save current viewport:', error);
    }
}

// Debounced viewport saving to avoid excessive localStorage writes
function debouncedSaveViewport() {
    clearTimeout(viewportSaveTimeout);
    viewportSaveTimeout = setTimeout(saveCurrentViewport, 1000); // Save 1 second after movement stops
}

// Listen for map movement events
map.on('moveend', debouncedSaveViewport);
map.on('zoomend', debouncedSaveViewport);

// Save viewport when page is about to unload
window.addEventListener('beforeunload', saveCurrentViewport);

// Save viewport when tab becomes hidden (mobile background)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        saveCurrentViewport();
    }
});

console.log('Viewport persistence initialized');

// Service Worker enhanced offline management
class OfflineManager {
    static async getCacheStatus() {
        if (!navigator.serviceWorker.controller) {
            console.warn('Service worker not available');
            return null;
        }
        
        return new Promise((resolve) => {
            const messageChannel = new MessageChannel();
            messageChannel.port1.onmessage = (event) => {
                resolve(event.data);
            };
            
            navigator.serviceWorker.controller.postMessage({
                type: 'GET_CACHE_STATUS'
            }, [messageChannel.port2]);
        });
    }
    
    static async clearFuelCache() {
        if (!navigator.serviceWorker.controller) return false;
        
        return new Promise((resolve) => {
            const messageChannel = new MessageChannel();
            messageChannel.port1.onmessage = (event) => {
                resolve(event.data.success);
            };
            
            navigator.serviceWorker.controller.postMessage({
                type: 'CLEAR_FUEL_CACHE'
            }, [messageChannel.port2]);
        });
    }
    
    static async forceFuelUpdate() {
        if (!navigator.serviceWorker.controller) return false;
        
        return new Promise((resolve) => {
            const messageChannel = new MessageChannel();
            messageChannel.port1.onmessage = (event) => {
                resolve(event.data.success);
            };
            
            navigator.serviceWorker.controller.postMessage({
                type: 'FORCE_FUEL_UPDATE'
            }, [messageChannel.port2]);
        });
    }
    
    static registerBackgroundSync() {
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            navigator.serviceWorker.ready.then(registration => {
                return registration.sync.register('fuel-data-sync');
            }).catch(error => {
                console.warn('Background sync registration failed:', error);
            });
        }
    }
}

// Listen for service worker messages
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        const { type, timestamp } = event.data;
        
        switch (type) {
            case 'FUEL_DATA_UPDATED':
                console.log('Background fuel data update received');
                // Refresh stations if user is online
                if (navigator.onLine) {
                    loadStationsInView();
                }
                break;
        }
    });
    
    // Register background sync on network reconnection
    window.addEventListener('online', () => {
        console.log('Network restored, registering background sync');
        OfflineManager.registerBackgroundSync();
    });
}

// Global functions for debugging and management
window.resetViewport = () => {
    ViewportPersistence.clearViewport();
    location.reload();
};

window.getViewportInfo = () => {
    const stored = ViewportPersistence.loadViewport();
    const current = {
        center: map.getCenter(),
        zoom: map.getZoom()
    };
    console.log('Stored viewport:', stored);
    console.log('Current viewport:', current);
    return { stored, current };
};

// Offline status management
class OfflineStatus {
    static init() {
        this.indicator = document.getElementById('offline-indicator');
        this.updateStatus();
        
        // Listen for network changes
        window.addEventListener('online', () => this.updateStatus());
        window.addEventListener('offline', () => this.updateStatus());
        
        // Check if data is coming from cache
        this.monitorCachedResponses();
    }
    
    static updateStatus() {
        if (!this.indicator) return;
        
        if (navigator.onLine) {
            this.indicator.style.display = 'none';
        } else {
            this.indicator.textContent = 'Offline Mode';
            this.indicator.className = '';
            this.indicator.style.display = 'block';
        }
    }
    
    static showCachedDataIndicator() {
        if (!this.indicator) return;
        
        this.indicator.textContent = 'Cached Data';
        this.indicator.className = 'cached-data';
        this.indicator.style.display = 'block';
        
        // Hide after 3 seconds
        setTimeout(() => {
            if (navigator.onLine) {
                this.indicator.style.display = 'none';
            }
        }, 3000);
    }
    
    static async monitorCachedResponses() {
        // Override fetch to detect cached responses
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            try {
                const response = await originalFetch.apply(this, args);
                
                // Check if response came from service worker cache
                if (response.headers.get('X-Served-By') === 'ServiceWorker-Offline') {
                    OfflineStatus.showCachedDataIndicator();
                }
                
                return response;
            } catch (error) {
                throw error;
            }
        };
    }
}

// Initialize offline status on DOM load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => OfflineStatus.init());
} else {
    OfflineStatus.init();
}

// Offline debugging functions
window.getCacheStatus = () => OfflineManager.getCacheStatus();
window.clearFuelCache = () => OfflineManager.clearFuelCache();
window.forceFuelUpdate = () => OfflineManager.forceFuelUpdate();
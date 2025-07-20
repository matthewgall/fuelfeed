if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker
        .register("/js/worker.js")
        .then(res => console.log("service worker registered"))
        .catch(err => console.log("service worker not registered", err))
    })
}

maptilersdk.config.apiKey = 'cwsqqYCkA54i9eIGaph9';

// Mobile-optimized map configuration
var map = new maptilersdk.Map({
    container: 'map',
    style: maptilersdk.MapStyle.STREETS,
    geolocate: maptilersdk.GeolocationType.POINT,
    center: [-2.0, 53.5], // Center on UK
    zoom: 6,
    // Mobile-friendly interaction options
    touchZoomRotate: true,
    dragRotate: false, // Disable rotation for simpler mobile UX
    touchPitch: false, // Disable pitch for simpler mobile UX
    doubleClickZoom: false, // Prevent accidental double-tap zoom
    scrollZoom: { around: 'center' } // Better mobile scroll behavior
});

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

// Function to get current map bounds as object
function getMapBounds() {
    const bounds = map.getBounds();
    return {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
    };
}

// Function to load stations for current viewport with intelligent caching
function loadStationsInView() {
    const bounds = getMapBounds();
    
    // Check if we have all required data cached
    if (stationCache.hasValidData(bounds)) {
        console.log('Loading stations from cache');
        const cachedData = stationCache.getStations(bounds);
        map.getSource('stations').setData(cachedData);
        console.log(`Loaded ${cachedData.features.length} stations from cache`);
        return;
    }
    
    // Cancel previous request if still pending
    if (currentRequest) {
        currentRequest.abort();
    }
    
    // Create bbox parameter for API
    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
    const url = `/api/data.mapbox?bbox=${bbox}`;
    console.log('Fetching stations from API for bounds:', bbox);
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'block';
    
    // Create new AbortController for this request
    const controller = new AbortController();
    currentRequest = controller;
    
    // Fetch data with abort signal
    fetch(url, { signal: controller.signal })
        .then(response => response.json())
        .then(data => {
            // Update the data source with new data
            map.getSource('stations').setData(data);
            
            // Store in cache for future use
            stationCache.storeStations(bounds, data);
            
            console.log(`Loaded ${data.features.length} stations from API`);
            
            // Hide loading indicator
            loadingIndicator.style.display = 'none';
            currentRequest = null;
        })
        .catch(error => {
            if (error.name !== 'AbortError') {
                console.error('Error loading stations:', error);
            }
            
            // Hide loading indicator on error
            loadingIndicator.style.display = 'none';
            currentRequest = null;
        });
}

// Mobile-optimized debouncing with longer delay on mobile
const isMobile = window.innerWidth <= 480;
const debounceDelay = isMobile ? 1000 : 500; // Longer delay on mobile for stability
const debouncedLoadStations = debounce(loadStationsInView, debounceDelay);

// Memory cleanup for mobile
function cleanupMemory() {
    if (isMobile) {
        // Force garbage collection hint
        if (window.gc && typeof window.gc === 'function') {
            window.gc();
        }
        
        // Clear old popup references
        const oldPopups = document.querySelectorAll('.mapboxgl-popup');
        if (oldPopups.length > 1) {
            for (let i = 0; i < oldPopups.length - 1; i++) {
                oldPopups[i].remove();
            }
        }
    }
}

// Performance monitoring
let performanceIssues = 0;
function trackPerformanceIssue() {
    performanceIssues++;
    if (performanceIssues > 5 && isMobile) {
        console.warn('Multiple performance issues detected, reducing functionality');
        // Could disable hover effects, reduce cache size, etc.
    }
}

map.on('load', function () {
    // Add a source for the stations - initially empty
    map.addSource('stations', {
        'type': 'geojson',
        'data': {
            'type': 'FeatureCollection',
            'features': []
        }
    });

    // Add enhanced station layer with price-based styling
    map.addLayer({
        'id': 'stations-layer',
        'source': 'stations',
        'type': 'circle',
        'paint': {
            // Size based on zoom level for better visibility
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                8, 6,
                12, 10,
                16, 14
            ],
            // Color based on price with special highlighting for best prices
            'circle-color': [
                'case',
                // Highlight stations with best prices in gold
                ['get', 'is_best_price'], '#FFD700', // Gold for best price stations
                // Regular price-based coloring
                ['has', 'lowest_price'],
                [
                    'interpolate',
                    ['linear'],
                    ['get', 'lowest_price'],
                    1.30, '#00C851', // Green for low prices (£1.30)
                    1.40, '#ffbb33', // Amber for medium prices (£1.40)
                    1.50, '#FF4444'  // Red for high prices (£1.50)
                ],
                '#007cbf' // Default blue if no price data
            ],
            'circle-stroke-width': [
                'case',
                ['get', 'is_best_price'], 4, // Thicker stroke for best price stations
                2 // Normal stroke for others
            ],
            'circle-stroke-color': [
                'case',
                ['get', 'is_best_price'], '#FF6B35', // Orange stroke for best price stations
                '#ffffff' // White stroke for others
            ],
            'circle-opacity': [
                'case',
                ['get', 'is_best_price'], 1.0, // Full opacity for best price stations
                0.8 // Normal opacity for others
            ],
            'circle-stroke-opacity': 1
        }
    });
    
    // Add a label layer for station brands
    map.addLayer({
        'id': 'stations-labels',
        'source': 'stations',
        'type': 'symbol',
        'layout': {
            'text-field': ['get', 'brand'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': [
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
            'text-halo-width': 1
        }
    });

    // Load initial data for current view
    loadStationsInView();

    // Reload data when map moves (debounced)
    map.on('moveend', debouncedLoadStations);
    map.on('zoomend', debouncedLoadStations);
    
    // Mobile-specific optimizations
    if (isMobile) {
        // Cleanup memory more frequently on mobile
        setInterval(cleanupMemory, 2 * 60 * 1000); // Every 2 minutes
        
        // Reduce cache cleanup frequency on mobile
        setInterval(() => {
            stationCache.clearExpired();
        }, 10 * 60 * 1000); // Every 10 minutes instead of 5
        
        // Add visibility change handler to cleanup when app goes to background
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                cleanupMemory();
                // Cancel any pending requests when app goes to background
                if (currentRequest) {
                    currentRequest.abort();
                    currentRequest = null;
                }
            }
        });
    } else {
        // Desktop cleanup (original frequency)
        setInterval(() => {
            stationCache.clearExpired();
        }, 5 * 60 * 1000);
    }

    // Mobile-optimized popup for station info
    map.on('click', 'stations-layer', function (e) {
        try {
            const feature = e.features[0];
            if (!feature || !feature.properties) return;
            
            const props = feature.properties;
            
            // Close any existing popups
            const existingPopups = document.querySelectorAll('.mapboxgl-popup');
            existingPopups.forEach(popup => popup.remove());
            
            // Create enhanced popup content with better styling
            const isMobile = window.innerWidth <= 480;
            
            // Simplified parsing for mobile performance
            const titleParts = props.title.split(', ');
            const brand = titleParts[0] || 'Station';
            const location = titleParts.slice(1).join(', ') || 'Location not available';
            
            // Simple extraction without complex regex
            let priceContent = '';
            if (props.description) {
                const prices = props.description.split('<br />');
                const priceItems = [];
                
                for (let i = 0; i < Math.min(prices.length, 4); i++) { // Limit to 4 items
                    const price = prices[i];
                    if (price && price.trim()) {
                        // Simple matching for mobile
                        const match = price.match(/([⛽🚛💎])\s+([^£]+)£([\d.]+)/);
                        if (match) {
                            const icon = match[1];
                            const fuel = match[2].trim().replace(/\([^)]*\)/g, '').trim();
                            const priceVal = parseFloat(match[3]);
                            
                            let color = '#333';
                            if (priceVal < 1.40) color = '#00C851';
                            else if (priceVal < 1.50) color = '#ffbb33';
                            else color = '#FF4444';
                            
                            priceItems.push(`
                                <div style="display: flex; justify-content: space-between; padding: 4px 0;">
                                    <span>${icon} ${fuel}</span>
                                    <span style="color: ${color}; font-weight: bold;">£${priceVal.toFixed(2)}</span>
                                </div>
                            `);
                        }
                    }
                }
                priceContent = priceItems.join('');
            }
            
            const content = `
                <div style="max-width: ${isMobile ? '280px' : '320px'}; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                    <div style="background: ${props.is_best_price ? '#FFD700' : '#667eea'}; color: ${props.is_best_price ? '#333' : 'white'}; padding: 12px; margin: -15px -15px 12px -15px; border-radius: 6px 6px 0 0;">
                        <h3 style="margin: 0; font-size: ${isMobile ? '16px' : '15px'}; font-weight: 600;">
                            ${props.is_best_price ? '🏆 ' : ''}${brand}
                        </h3>
                        <div style="font-size: ${isMobile ? '12px' : '11px'}; opacity: 0.9; margin-top: 4px;">
                            📍 ${location}
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <h4 style="margin: 0 0 8px 0; font-size: ${isMobile ? '13px' : '12px'}; color: #666;">
                            ⛽ Prices
                        </h4>
                        ${priceContent || '<div style="color: #999;">No price data</div>'}
                    </div>
                    
                    <div style="font-size: ${isMobile ? '10px' : '9px'}; color: #888; border-top: 1px solid #f0f0f0; padding-top: 8px;">
                        🕐 Updated: ${(() => {
                            try {
                                if (!props.updated || props.updated === 'Unknown') return 'Unknown';
                                const date = new Date(props.updated);
                                return isNaN(date.getTime()) ? props.updated : date.toLocaleDateString();
                            } catch (e) {
                                return 'Unknown';
                            }
                        })()}
                    </div>
                </div>
            `;
            
            new maptilersdk.Popup({
                closeButton: true,
                closeOnClick: true,
                closeOnMove: false,
                maxWidth: isMobile ? '90vw' : '350px',
                anchor: isMobile ? 'bottom' : 'auto'
            })
                .setLngLat(e.lngLat)
                .setHTML(content)
                .addTo(map);
                
        } catch (error) {
            console.warn('Popup creation failed:', error);
            trackPerformanceIssue();
            
            // Fallback: show simple alert on mobile if popup fails
            if (window.innerWidth <= 480) {
                const props = e.features[0]?.properties;
                if (props?.title) {
                    setTimeout(() => {
                        alert(`${props.title}\n${props.description?.replace(/<br\s*\/?>/gi, '\n') || 'No price data'}`);
                    }, 100);
                }
            }
        }
    });

    // Simplified hover effects for mobile performance
    let hoverTimeout = null;
    
    map.on('mouseenter', 'stations-layer', function (e) {
        map.getCanvas().style.cursor = 'pointer';
        
        // Debounce hover effects on mobile to prevent performance issues
        if (window.innerWidth <= 480) return;
        
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
        
        // Skip hover reset on mobile
        if (window.innerWidth <= 480) return;
        
        try {
            map.setPaintProperty('stations-layer', 'circle-stroke-width', 2);
        } catch (error) {
            console.warn('Hover reset failed:', error);
        }
    });
    
    // Also apply hover effects to labels
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
        const clickEvent = { features: [feature], lngLat: e.lngLat };
        map.fire('click', { originalEvent: e.originalEvent, lngLat: e.lngLat, point: e.point, features: [feature] });
    });
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
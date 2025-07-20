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

// Debounced version of loadStationsInView (500ms delay)
const debouncedLoadStations = debounce(loadStationsInView, 500);

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
            // Color based on price (if available)
            'circle-color': [
                'case',
                ['has', 'lowest_price'],
                [
                    'interpolate',
                    ['linear'],
                    ['get', 'lowest_price'],
                    130, '#00C851', // Green for low prices
                    140, '#ffbb33', // Amber for medium prices  
                    150, '#FF4444'  // Red for high prices
                ],
                '#007cbf' // Default blue if no price data
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.8,
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
    
    // Periodically clean up expired cache entries (every 5 minutes)
    setInterval(() => {
        stationCache.clearExpired();
    }, 5 * 60 * 1000);

    // Mobile-optimized popup for station info
    map.on('click', 'stations-layer', function (e) {
        const feature = e.features[0];
        const props = feature.properties;
        
        // Close any existing popups
        const existingPopups = document.querySelectorAll('.mapboxgl-popup');
        existingPopups.forEach(popup => popup.remove());
        
        // Create enhanced popup content with better styling
        const isMobile = window.innerWidth <= 480;
        
        // Parse brand and location from title
        const titleParts = props.title.split(', ');
        const brand = titleParts[0] || 'Unknown Station';
        const location = titleParts.slice(1).join(', ') || 'Location not available';
        
        // Parse prices from description
        const prices = props.description.split('<br />');
        const priceElements = prices.map(price => {
            const [fuel, priceValue] = price.split(': ');
            const numericPrice = parseFloat(priceValue?.replace('£', '') || '0');
            let priceColor = '#333';
            
            // Color code prices
            if (numericPrice > 0) {
                if (numericPrice < 1.40) priceColor = '#00C851'; // Green
                else if (numericPrice < 1.50) priceColor = '#ffbb33'; // Amber
                else priceColor = '#FF4444'; // Red
            }
            
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
                    <span style="font-weight: 500; color: #555;">${fuel || ''}</span>
                    <span style="font-weight: bold; color: ${priceColor}; font-size: ${isMobile ? '16px' : '14px'};">${priceValue || 'N/A'}</span>
                </div>
            `;
        }).join('');
        
        const content = `
            <div style="max-width: ${isMobile ? '300px' : '340px'}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; margin: -15px -15px 15px -15px; border-radius: 8px 8px 0 0;">
                    <h3 style="margin: 0; font-size: ${isMobile ? '18px' : '16px'}; font-weight: 600;">
                        ${brand}
                    </h3>
                    <div style="font-size: ${isMobile ? '14px' : '12px'}; opacity: 0.9; margin-top: 4px;">
                        📍 ${location}
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <h4 style="margin: 0 0 10px 0; font-size: ${isMobile ? '15px' : '13px'}; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⛽ Current Prices
                    </h4>
                    ${priceElements || '<div style="color: #999; font-style: italic;">No price data available</div>'}
                </div>
                
                <div style="font-size: ${isMobile ? '12px' : '11px'}; color: #888; border-top: 1px solid #f0f0f0; padding-top: 10px; display: flex; align-items: center;">
                    <span style="margin-right: 5px;">🕐</span>
                    <strong>Updated:</strong>&nbsp;${(() => {
                        try {
                            if (!props.updated || props.updated === 'Unknown') return 'Unknown';
                            const date = new Date(props.updated);
                            return isNaN(date.getTime()) ? props.updated : date.toLocaleString();
                        } catch (e) {
                            return props.updated || 'Unknown';
                        }
                    })()}
                </div>
            </div>
        `;
        
        new maptilersdk.Popup({
            closeButton: true,
            closeOnClick: true,
            closeOnMove: false, // Keep open when map moves slightly
            maxWidth: isMobile ? '90vw' : '400px',
            anchor: isMobile ? 'bottom' : 'auto' // Bottom anchor works better on mobile
        })
            .setLngLat(e.lngLat)
            .setHTML(content)
            .addTo(map);
    });

    // Enhanced cursor and hover effects
    map.on('mouseenter', 'stations-layer', function (e) {
        map.getCanvas().style.cursor = 'pointer';
        
        // Highlight the hovered station
        map.setPaintProperty('stations-layer', 'circle-stroke-width', [
            'case',
            ['==', ['get', 'title'], e.features[0].properties.title],
            4, // Thicker stroke for hovered station
            2  // Normal stroke for others
        ]);
    });

    map.on('mouseleave', 'stations-layer', function () {
        map.getCanvas().style.cursor = '';
        
        // Reset stroke width
        map.setPaintProperty('stations-layer', 'circle-stroke-width', 2);
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
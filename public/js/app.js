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

    // Add a layer showing the stations
    map.addLayer({
        'id': 'stations-layer',
        'source': 'stations',
        'type': 'circle',
        'paint': {
            'circle-radius': 8,
            'circle-color': '#007cbf'
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
        
        // Create mobile-friendly popup content
        const isMobile = window.innerWidth <= 480;
        const content = `
            <div style="max-width: ${isMobile ? '280px' : '320px'};">
                <h3 style="margin: 0 0 10px 0; font-size: ${isMobile ? '18px' : '16px'}; color: #333;">
                    ${props.title}
                </h3>
                <div style="font-size: ${isMobile ? '16px' : '14px'}; line-height: 1.4; margin-bottom: 12px;">
                    ${props.description}
                </div>
                <div style="font-size: ${isMobile ? '13px' : '12px'}; color: #666; border-top: 1px solid #eee; padding-top: 8px;">
                    <strong>Updated:</strong> ${props.updated}
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

    // Change the cursor to a pointer when the mouse is over the stations layer
    map.on('mouseenter', 'stations-layer', function () {
        map.getCanvas().style.cursor = 'pointer';
    });

    // Change it back to a pointer when it leaves
    map.on('mouseleave', 'stations-layer', function () {
        map.getCanvas().style.cursor = '';
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
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker
        .register("/js/worker.js")
        .then(res => console.log("service worker registered"))
        .catch(err => console.log("service worker not registered", err))
    })
}

// Using self-hosted Protomaps instead of MapTiler API
// maptilersdk.config.apiKey = 'cwsqqYCkA54i9eIGaph9'; // No longer needed

// Use official Protomaps basemap light theme
const protomapsStyle = {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
    sources: {
        protomaps: {
            type: "vector",
            tiles: ["https://protomaps.matthewgall.workers.dev/planet-latest/{z}/{x}/{y}.mvt"],
            maxzoom: 15,
            attribution: '<a href="https://openstreetmap.org/copyright">© OpenStreetMap Contributors</a>'
        }
    },
    layers: basemaps.layers("protomaps", basemaps.namedFlavor("light"))
};

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

// Geolocation system for user positioning
class GeolocationManager {
    static TIMEOUT = 10000; // 10 second timeout
    static MAX_AGE = 5 * 60 * 1000; // Accept 5-minute old positions
    static STORAGE_KEY = 'fuelfeed-last-location';
    
    static async getCurrentLocation() {
        console.log('Requesting user location...');
        
        // Check if geolocation is available
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported by this browser');
        }
        
        try {
            const position = await this.requestLocation();
            const coords = {
                lng: position.coords.longitude,
                lat: position.coords.latitude,
                accuracy: position.coords.accuracy,
                timestamp: Date.now()
            };
            
            // Validate coordinates are reasonable (rough world bounds)
            if (coords.lat < -90 || coords.lat > 90 || coords.lng < -180 || coords.lng > 180) {
                throw new Error('Invalid coordinates received');
            }
            
            // Save location for future use
            this.saveLastLocation(coords);
            
            console.log('Location acquired:', coords);
            return coords;
            
        } catch (error) {
            console.warn('Geolocation failed:', error.message);
            
            // Try to use last known location as fallback
            const lastLocation = this.getLastLocation();
            if (lastLocation) {
                console.log('Using last known location:', lastLocation);
                return lastLocation;
            }
            
            throw error;
        }
    }
    
    static requestLocation() {
        return new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: false, // Prioritize speed over accuracy for fuel finding
                timeout: this.TIMEOUT,
                maximumAge: this.MAX_AGE
            };
            
            navigator.geolocation.getCurrentPosition(
                resolve,
                (error) => {
                    let errorMessage;
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = 'Location access denied by user';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = 'Location information unavailable';
                            break;
                        case error.TIMEOUT:
                            errorMessage = 'Location request timed out';
                            break;
                        default:
                            errorMessage = `Unknown geolocation error: ${error.message}`;
                            break;
                    }
                    reject(new Error(errorMessage));
                },
                options
            );
        });
    }
    
    static saveLastLocation(coords) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(coords));
        } catch (error) {
            console.warn('Failed to save location:', error);
        }
    }
    
    static getLastLocation() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return null;
            
            const location = JSON.parse(stored);
            
            // Check if stored location is too old (24 hours)
            const maxAge = 24 * 60 * 60 * 1000;
            if (Date.now() - location.timestamp > maxAge) {
                localStorage.removeItem(this.STORAGE_KEY);
                return null;
            }
            
            return location;
        } catch (error) {
            console.warn('Failed to load last location:', error);
            return null;
        }
    }
    
    static async findStationLocation(stationId) {
        try {
            console.log('Looking up station location for:', stationId);
            
            // First try to get a reasonable bounding box to search in
            // We'll search the whole UK initially
            const response = await fetch('/api/data.mapbox');
            if (!response.ok) {
                throw new Error(`Station lookup failed: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.features) {
                for (const feature of data.features) {
                    if (feature.properties.station_id === stationId) {
                        const [lng, lat] = feature.geometry.coordinates;
                        console.log(`Found station ${stationId} at [${lng}, ${lat}]`);
                        return { lng, lat };
                    }
                }
            }
            
            console.warn(`Station ${stationId} not found in current data`);
            return null;
            
        } catch (error) {
            console.error('Error finding station location:', error);
            return null;
        }
    }
    
    static async initializeLocation(map) {
        // Check URL first (for shareable links including station links)
        const urlLocation = URLStateManager.getLocationFromURL();
        if (urlLocation) {
            console.log('Using location from URL:', urlLocation);
            
            // If there's a station parameter, try to find and center on that station
            if (urlLocation.station) {
                console.log('Station specified in URL:', urlLocation.station);
                const stationLocation = await this.findStationLocation(urlLocation.station);
                if (stationLocation) {
                    console.log('Found station, centering map on station location');
                    map.flyTo({
                        center: [stationLocation.lng, stationLocation.lat],
                        zoom: 15, // Zoom in close for station view
                        duration: 1500
                    });
                    window.highlightStationId = urlLocation.station;
                    return { ...stationLocation, station: urlLocation.station };
                } else {
                    console.warn('Station not found, using URL coordinates');
                }
            }
            
            // Use URL coordinates if no station or station not found
            map.setCenter([urlLocation.lng, urlLocation.lat]);
            if (urlLocation.zoom) map.setZoom(urlLocation.zoom);
            
            return urlLocation;
        }
        
        // Try to get current location
        try {
            const location = await this.getCurrentLocation();
            
            // Center map on user location with appropriate zoom
            const zoom = isMobile ? 12 : 11; // Closer zoom when we have user location
            map.flyTo({
                center: [location.lng, location.lat],
                zoom: zoom,
                duration: 1000
            });
            
            console.log('Map centered on user location');
            return location;
            
        } catch (error) {
            console.log('Using fallback to saved/default viewport');
            
            // Fall back to saved viewport or default
            const savedViewport = ViewportPersistence.loadViewport();
            map.setCenter(savedViewport.center);
            map.setZoom(savedViewport.zoom);
            
            return null;
        }
    }
}

// SEO and social sharing management
class SEOManager {
    static updateMetaTags(title, description, url = window.location.href, imageUrl = null) {
        // Update page title
        document.title = title;
        
        // Update or create meta tags
        this.updateMetaTag('description', description);
        this.updateMetaTag('og:title', title, 'property');
        this.updateMetaTag('og:description', description, 'property');
        this.updateMetaTag('og:url', url, 'property');
        this.updateMetaTag('twitter:title', title);
        this.updateMetaTag('twitter:description', description);
        
        // Update canonical URL
        this.updateCanonicalURL(url);
        
        if (imageUrl) {
            this.updateMetaTag('og:image', imageUrl, 'property');
            this.updateMetaTag('twitter:image', imageUrl);
        }
        
        console.log('Updated meta tags for sharing:', { title, description, url });
    }
    
    static updateMetaTag(name, content, attribute = 'name') {
        let element = document.querySelector(`meta[${attribute}="${name}"]`);
        if (element) {
            element.setAttribute('content', content);
        } else {
            element = document.createElement('meta');
            element.setAttribute(attribute, name);
            element.setAttribute('content', content);
            document.head.appendChild(element);
        }
    }
    
    static updateCanonicalURL(url) {
        let canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
            canonical.setAttribute('href', url);
        } else {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            canonical.setAttribute('href', url);
            document.head.appendChild(canonical);
        }
    }
    
    static generateStationSEO(stationData, coordinates) {
        const brand = stationData.brand || 'Fuel Station';
        const postcode = stationData.postcode || '';
        const lowestPrice = stationData.lowest_price;
        
        const title = `${brand} ${postcode} - Fuel Prices | fuelaround.me`;
        const description = lowestPrice 
            ? `${brand} in ${postcode} - Fuel from £${lowestPrice.toFixed(2)}. Compare live petrol & diesel prices near you. Find cheap fuel today!`
            : `${brand} in ${postcode} - Compare live fuel prices. Find the cheapest petrol and diesel near you on fuelaround.me`;
            
        const stationUrl = URLStateManager.createStationURL(
            stationData.station_id, 
            coordinates, 
            15
        );
        
        this.updateMetaTags(title, description, stationUrl);
        
        return { title, description, url: stationUrl };
    }
}

// URL state management for shareable links
class URLStateManager {
    static updateURL(center, zoom, stationId = null) {
        if (!window.history?.replaceState) return;
        
        try {
            const url = new URL(window.location);
            url.searchParams.set('lat', center.lat.toFixed(4));
            url.searchParams.set('lng', center.lng.toFixed(4));
            url.searchParams.set('zoom', zoom.toFixed(1));
            
            // Add station parameter if provided
            if (stationId) {
                url.searchParams.set('station', stationId);
            } else {
                url.searchParams.delete('station');
            }
            
            // Update URL without triggering page reload
            window.history.replaceState(null, '', url);
        } catch (error) {
            console.warn('Failed to update URL state:', error);
        }
    }
    
    static getLocationFromURL() {
        try {
            const url = new URL(window.location);
            const lat = parseFloat(url.searchParams.get('lat'));
            const lng = parseFloat(url.searchParams.get('lng'));
            const zoom = parseFloat(url.searchParams.get('zoom'));
            const station = url.searchParams.get('station');
            
            // Validate coordinates
            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return null;
            }
            
            return {
                lat,
                lng,
                zoom: isNaN(zoom) ? undefined : zoom,
                station: station || undefined
            };
        } catch (error) {
            console.warn('Failed to parse URL location:', error);
            return null;
        }
    }
    
    static getStationFromURL() {
        try {
            const url = new URL(window.location);
            return url.searchParams.get('station');
        } catch (error) {
            console.warn('Failed to parse station from URL:', error);
            return null;
        }
    }
    
    static clearURLState() {
        if (!window.history?.replaceState) return;
        
        try {
            const url = new URL(window.location);
            url.searchParams.delete('lat');
            url.searchParams.delete('lng');
            url.searchParams.delete('zoom');
            url.searchParams.delete('station');
            
            window.history.replaceState(null, '', url);
        } catch (error) {
            console.warn('Failed to clear URL state:', error);
        }
    }
    
    static createStationURL(stationId, center, zoom) {
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('lat', center.lat.toFixed(4));
        url.searchParams.set('lng', center.lng.toFixed(4));
        url.searchParams.set('zoom', zoom.toFixed(1));
        url.searchParams.set('station', stationId);
        return url.toString();
    }
}

// Function to open a specific station popup from URL
function openStationFromURL(stationId) {
    try {
        console.log('Attempting to open station from URL:', stationId);
        
        // Query the map for the station feature
        const features = map.querySourceFeatures('stations', {
            filter: ['==', 'station_id', stationId]
        });
        
        if (features.length > 0) {
            const feature = features[0];
            const [lng, lat] = feature.geometry.coordinates;
            
            console.log('Found station feature, opening popup');
            
            // Load the station detail and show popup
            loadStationDetail(stationId).then(stationData => {
                if (stationData && stationData.popup_html) {
                    showStationPopup([lng, lat], stationData.popup_html);
                    
                    // Update URL to include the station parameter
                    const center = { lat, lng };
                    const zoom = map.getZoom();
                    URLStateManager.updateURL(center, zoom, stationId);
                }
            }).catch(error => {
                console.error('Failed to load station detail:', error);
            });
            
        } else {
            console.warn('Station feature not found on map:', stationId);
        }
        
    } catch (error) {
        console.error('Error opening station from URL:', error);
    }
}

// Load saved viewport or use defaults (keeping existing functionality)
const savedViewport = ViewportPersistence.loadViewport();

// Mobile-optimized map configuration with v3.6.0 compatibility
var map;
try {
    map = new maptilersdk.Map({
        container: 'map',
        style: protomapsStyle, // Using self-hosted Protomaps
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
    
    console.log('Protomaps map initialized successfully');
} catch (mapError) {
    console.error('Failed to initialize Protomaps map:', mapError);

    // Fallback: try with minimal options
    try {
        map = new maptilersdk.Map({
            container: 'map',
            style: protomapsStyle, // Using self-hosted Protomaps
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

// Station detail cache for lazy loading
const stationDetailCache = new Map();
let detailLoadingCache = new Map(); // Track in-progress loads to prevent duplicates

// Lazy loading functions for station details
async function loadStationDetail(stationId) {
    console.log(`Loading station detail for ${stationId}`);
    
    // Check cache first
    if (stationDetailCache.has(stationId)) {
        console.log(`Station detail ${stationId} loaded from cache`);
        return stationDetailCache.get(stationId);
    }
    
    // Check if already loading to prevent duplicate requests
    if (detailLoadingCache.has(stationId)) {
        console.log(`Station detail ${stationId} already loading, waiting...`);
        return await detailLoadingCache.get(stationId);
    }
    
    // Create loading promise
    const loadingPromise = fetchStationDetail(stationId);
    detailLoadingCache.set(stationId, loadingPromise);
    
    try {
        const stationData = await loadingPromise;
        
        // Cache the result
        stationDetailCache.set(stationId, stationData);
        console.log(`Station detail ${stationId} loaded and cached`);
        
        return stationData;
    } catch (error) {
        console.error(`Failed to load station detail ${stationId}:`, error);
        throw error;
    } finally {
        // Clean up loading tracker
        detailLoadingCache.delete(stationId);
    }
}

async function fetchStationDetail(stationId) {
    const controller = new AbortController();
    
    // Set timeout for station detail requests
    const timeoutMs = isMobile ? 8000 : 5000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(`/api/station/${stationId}`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Station detail request failed: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error('Station detail request timed out');
        }
        throw error;
    }
}

function showLoadingPopup(coordinates, title) {
    const loadingContent = `
        <div style="
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 15px;
            text-align: center;
        ">
            <div style="margin-bottom: 8px; font-weight: 600;">${title}</div>
            <div style="color: #666; font-size: 14px;">Loading station details...</div>
            <div style="margin-top: 10px;">
                <div style="
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 2px solid #f0f0f0;
                    border-left: 2px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                "></div>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    
    return new maptilersdk.Popup({
        closeButton: false,
        className: 'loading-popup'
    })
    .setLngLat(coordinates)
    .setHTML(loadingContent)
    .addTo(map);
}

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
        
        // Apply client-side safety limits for ultra low-end devices
        const clientLimit = getClientSafetyLimit();
        if (clientLimit && cachedData.features && cachedData.features.length > clientLimit) {
            cachedData.features = cachedData.features.slice(0, clientLimit);
            console.log(`Client-side safety limit: reduced cached data to ${clientLimit} stations`);
        }
        
        try {
            if (map.getSource && map.getSource('stations')) {
                map.getSource('stations').setData(cachedData);
                
                // Store cached data globally for price analytics
                window.lastStationData = cachedData;
                
                // Update price analytics if available
                if (window.priceAnalytics && window.priceAnalytics.overlayVisible) {
                    window.priceAnalytics.updateStatistics(cachedData, bounds);
                }
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
    
    // Create bbox parameter for API with center point (let server handle limits)
    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
    const center = map.getCenter();
    const centerParam = `${center.lng},${center.lat}`;
    const url = `/api/data.mapbox?bbox=${bbox}&center=${centerParam}`;
    console.log(`Fetching stations from API for bounds: ${bbox}, center: ${centerParam}`);
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    
    // Create new AbortController for this request
    const controller = new AbortController();
    currentRequest = controller;
    
    // Add adaptive timeout based on device capabilities
    let timeoutMs = null;
    if (isLowEndMobile) {
        const clientLimit = getClientSafetyLimit();
        if (clientLimit && clientLimit <= 50) {
            timeoutMs = 20000; // Ultra low-end: 20 second timeout
        } else {
            timeoutMs = 15000; // Low-end mobile: 15 second timeout
        }
    } else if (isMobile) {
        timeoutMs = 10000; // Regular mobile: 10 second timeout
    }
    
    const timeoutId = timeoutMs ? setTimeout(() => {
        controller.abort();
        console.warn(`Request timeout after ${timeoutMs}ms on mobile device`);
    }, timeoutMs) : null;
    
    // Fetch data with abort signal
    fetch(url, { signal: controller.signal })
        .then(response => response.json())
        .then(data => {
            if (timeoutId) clearTimeout(timeoutId);
            
            // Apply client-side safety limits for ultra low-end devices
            const clientLimit = getClientSafetyLimit();
            if (clientLimit && data.features && data.features.length > clientLimit) {
                data.features = data.features.slice(0, clientLimit);
                console.log(`Client-side safety limit: reduced to ${clientLimit} stations for ultra low-end device`);
            }
            
            // Update the data source with new data
            try {
                if (map.getSource && map.getSource('stations')) {
                    map.getSource('stations').setData(data);
                    
                    // Store data globally for price analytics
                    window.lastStationData = data;
                    
                    // Update price analytics if available
                    if (window.priceAnalytics && window.priceAnalytics.overlayVisible) {
                        const mapBounds = getMapBounds();
                        if (mapBounds) {
                            window.priceAnalytics.updateStatistics(data, mapBounds);
                        }
                    }
                    
                    // Auto-open popup for highlighted station after a short delay
                    if (window.highlightStationId) {
                        setTimeout(() => openStationFromURL(window.highlightStationId), 1000);
                        window.highlightStationId = null; // Clear to prevent repeated opens
                    }
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

// Client-side safety limits for very low-end devices (backup to server-side filtering)
const getClientSafetyLimit = () => {
    // Even more aggressive limits for extremely low-end devices
    if (navigator.hardwareConcurrency <= 2 && navigator.deviceMemory && navigator.deviceMemory <= 2) {
        return 50; // Ultra low-end devices
    }
    if (isLowEndMobile && window.innerWidth <= 320) {
        return 75; // Very small, old devices
    }
    // For most devices, trust server-side filtering
    return null; // No client-side limit
};

// Mobile-optimized debouncing with ultra aggressive delays for very low-end devices  
let debounceDelay = 500; // Default desktop delay
if (isLowEndMobile) {
    const clientLimit = getClientSafetyLimit();
    if (clientLimit && clientLimit <= 50) {
        debounceDelay = 4000; // Ultra low-end devices: 4 second delay
    } else {
        debounceDelay = 2000; // Low-end mobile: 2 second delay  
    }
} else if (isMobile) {
    debounceDelay = 1500; // Regular mobile: 1.5 second delay
}

const debouncedLoadStations = debounce(loadStationsInView, debounceDelay);
console.log(`Using ${debounceDelay}ms debounce delay for device optimization`);

// Enhanced memory cleanup for mobile with ultra low-end device support
function cleanupMemory() {
    if (isMobile) {
        // Force garbage collection hint
        if (window.gc && typeof window.gc === 'function') {
            window.gc();
        }
        
        // Clear all popups on mobile for memory
        const oldPopups = document.querySelectorAll('.mapboxgl-popup, .maplibregl-popup');
        oldPopups.forEach(popup => popup.remove());
        
        // Ultra aggressive cleanup for very low-end devices
        const clientLimit = getClientSafetyLimit();
        if (clientLimit && clientLimit <= 50) {
            // Clear cache more aggressively
            if (stationCache) {
                stationCache.clearExpiredEntries();
                // Keep only most recent cache entry on ultra low-end devices
                stationCache.cache.forEach((value, key, map) => {
                    if (map.size > 1) {
                        const entries = Array.from(map.entries());
                        const sortedByTime = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
                        // Keep only the most recent entry
                        map.clear();
                        map.set(sortedByTime[0][0], sortedByTime[0][1]);
                    }
                });
            }
            
            // Clear console logs to free memory
            if (console.clear && typeof console.clear === 'function') {
                console.clear();
            }
        }
        
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
        'layout': {
            'visibility': 'visible'
        },
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
        // Add stations layer on top of all basemap layers
        // The Protomaps basemap has many layers, so we need to ensure stations are visible
        map.addLayer(stationLayerConfig);
        console.log('Added stations layer successfully');
        console.log('Map layers:', map.getStyle().layers.map(l => l.id));
    } catch (error) {
        console.error('Error adding station layer:', error);
        console.error('Error details:', error.message);
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

    // Initialize location (geolocation or URL state) before loading stations
    GeolocationManager.initializeLocation(map).finally(() => {
        // Load initial data for current view after location is set
        loadStationsInView();
    });

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

    // Function to update popup with distance information
function updatePopupDistance(stationCoordinates) {
    if (!window.distanceUtils || !window.distanceUtils.hasRecentLocation()) {
        return;
    }
    
    const distance = window.distanceUtils.getFormattedDistance(
        stationCoordinates.lat, 
        stationCoordinates.lng
    );
    
    if (distance) {
        // Use querySelector to find the distance elements in the current popup
        const distanceInfo = document.querySelector('.maplibregl-popup .distance-info, .mapboxgl-popup .distance-info');
        const distanceText = document.querySelector('.maplibregl-popup .distance-text, .mapboxgl-popup .distance-text');
        
        if (distanceInfo && distanceText) {
            distanceText.textContent = distance;
            distanceInfo.style.display = 'block';
        }
    }
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
    
    // Lazy loading popup handler with improved performance
    async function handlePopupClick(e) {
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
            
            // Clean up existing popups
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
            
            // NEW: Check if we have station_id for lazy loading
            if (props.station_id && props.has_prices) {
                console.log(`Using lazy loading for station ${props.station_id}`);
                
                // Show loading popup immediately
                const loadingPopup = showLoadingPopup(coordinates, props.title || 'Station');
                activePopup = loadingPopup;
                
                try {
                    // Load station details
                    const stationData = await loadStationDetail(props.station_id);
                    
                    // Remove loading popup
                    if (loadingPopup) {
                        loadingPopup.remove();
                    }
                    
                    // Show detailed popup
                    if (stationData.popup_html) {
                        activePopup = new maptilersdk.Popup({
                            className: 'fuel-popup'
                        })
                        .setLngLat(coordinates)
                        .setHTML(stationData.popup_html)
                        .addTo(map);
                        
                        // Add distance information if location is available
                        updatePopupDistance(coordinates);
                        
                        console.log(`Lazy loaded popup for station ${props.station_id}`);
                        
                        // Update URL to include station parameter for shareable links
                        const center = { lat: coordinates.lat, lng: coordinates.lng };
                        const zoom = map.getZoom();
                        URLStateManager.updateURL(center, zoom, props.station_id);
                        
                        // Update SEO meta tags for social sharing
                        SEOManager.generateStationSEO(stationData, center);
                    } else {
                        throw new Error('No popup HTML in station data');
                    }
                    
                } catch (error) {
                    console.error(`Failed to lazy load station ${props.station_id}:`, error);
                    
                    // Remove loading popup
                    if (loadingPopup) {
                        loadingPopup.remove();
                    }
                    
                    // Show basic fallback popup
                    const errorContent = `
                        <div style="padding: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <h3 style="margin: 0 0 10px 0; font-size: 16px;">${props.title || 'Station'}</h3>
                            <p style="margin: 0; color: #666;">Unable to load station details. Please try again.</p>
                            ${props.lowest_price ? `<p style="margin: 10px 0 0 0; font-weight: 600;">From £${props.lowest_price.toFixed(2)}</p>` : ''}
                        </div>
                    `;
                    
                    activePopup = new maptilersdk.Popup({
                        className: 'fuel-popup'
                    })
                    .setLngLat(coordinates)
                    .setHTML(errorContent)
                    .addTo(map);
                }
                
                return;
            }
            
            // FALLBACK: Use old popup logic for stations without station_id
            console.log('Using fallback popup generation for station without station_id');
            
            // Create basic popup for stations without detailed data
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
                            ${props.is_best_price ? '<span class="noto-emoji">🏆</span> ' : ''}${brand}
                        </h3>
                        ${location ? `<div style="font-size: 11px; opacity: 0.9; margin-top: 4px; line-height: 1.3;"><span class="noto-emoji">📍</span> ${location}</div>` : ''}
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
                
                // Add distance information if location is available
                updatePopupDistance(coordinates);
                
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
    
    // Initialize Price Analytics
    try {
        if (typeof PriceAnalytics !== 'undefined') {
            window.priceAnalytics = new PriceAnalytics();
            window.priceAnalytics.init(map);
            console.log('📊 Price analytics initialized successfully');
        } else {
            console.warn('PriceAnalytics class not found');
        }
    } catch (error) {
        console.warn('Failed to initialize price analytics:', error);
    }
    
    // Initialize distance tracking
    try {
        if (typeof DistanceUtils !== 'undefined' && window.distanceUtils) {
            window.distanceUtils.init().then(success => {
                if (success) {
                    console.log('📍 Location tracking enabled');
                }
            });
        }
    } catch (error) {
        console.warn('Failed to initialize distance tracking:', error);
    }
    
    // Test popup triangle (temporary)
    window.testPopupTriangle = () => {
        const testPopup = new maptilersdk.Popup({
            closeButton: true,
            closeOnClick: true
        })
        .setLngLat([-2.0, 53.5])
        .setHTML('<div style="padding: 15px;">Test popup - check triangle</div>')
        .addTo(map);
    };
    
    // Show onboarding for first-time users
    try {
        if (typeof OnboardingOverlay !== 'undefined' && window.onboarding) {
            setTimeout(() => {
                window.onboarding.show();
            }, 1000); // Show after 1 second to let map load
        }
    } catch (error) {
        console.warn('Failed to initialize onboarding:', error);
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
        URLStateManager.updateURL(center, zoom);
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
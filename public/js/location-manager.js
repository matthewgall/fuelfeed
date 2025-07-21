/**
 * Location and URL state management for FuelFeed
 */

// Viewport persistence system
class ViewportPersistence {
    static STORAGE_KEY = 'fuelfeed-viewport';
    static DEFAULT_VIEWPORT = {
        center: [-2.0, 53.5], // Center on UK
        zoom: DeviceDetection.isMobile ? 7 : 6
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
            const zoom = DeviceDetection.isMobile ? 12 : 11; // Closer zoom when we have user location
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

// URL state management for shareable links
class URLStateManager {
    static updateURL(center, zoom) {
        if (!window.history?.replaceState) return;
        
        try {
            const url = new URL(window.location);
            url.searchParams.set('lat', center.lat.toFixed(4));
            url.searchParams.set('lng', center.lng.toFixed(4));
            url.searchParams.set('zoom', zoom.toFixed(1));
            
            window.history.replaceState(null, '', url);
        } catch (error) {
            console.warn('Failed to update URL:', error);
        }
    }
    
    static getLocationFromURL() {
        try {
            const url = new URL(window.location);
            const lat = parseFloat(url.searchParams.get('lat'));
            const lng = parseFloat(url.searchParams.get('lng'));
            const zoom = parseFloat(url.searchParams.get('zoom'));
            const station = url.searchParams.get('station');
            
            if (!isNaN(lat) && !isNaN(lng)) {
                const location = { lat, lng };
                if (!isNaN(zoom)) location.zoom = zoom;
                if (station) location.station = station;
                return location;
            }
            
            return null;
        } catch (error) {
            console.warn('Failed to parse URL location:', error);
            return null;
        }
    }
    
    static createStationURL(stationId, lat, lng) {
        try {
            const url = new URL(window.location.origin);
            url.searchParams.set('station', stationId);
            url.searchParams.set('lat', lat.toFixed(4));
            url.searchParams.set('lng', lng.toFixed(4));
            url.searchParams.set('zoom', '15');
            
            return url.toString();
        } catch (error) {
            console.warn('Failed to create station URL:', error);
            return window.location.href;
        }
    }
}

// SEO and social sharing management
class SEOManager {
    static updateMetaTags(title, description, url = window.location.href, imageUrl = null) {
        // Update page title
        document.title = title;
        
        // Update meta description
        this.updateMetaTag('name', 'description', description);
        
        // Update Open Graph tags
        this.updateMetaTag('property', 'og:title', title);
        this.updateMetaTag('property', 'og:description', description);
        this.updateMetaTag('property', 'og:url', url);
        
        if (imageUrl) {
            this.updateMetaTag('property', 'og:image', imageUrl);
        }
        
        // Update Twitter Card tags
        this.updateMetaTag('name', 'twitter:title', title);
        this.updateMetaTag('name', 'twitter:description', description);
        
        if (imageUrl) {
            this.updateMetaTag('name', 'twitter:image', imageUrl);
        }
        
        console.log('Meta tags updated:', { title, description, url });
    }
    
    static updateMetaTag(attr, name, content) {
        let element = document.querySelector(`meta[${attr}="${name}"]`);
        
        if (!element) {
            element = document.createElement('meta');
            element.setAttribute(attr, name);
            document.head.appendChild(element);
        }
        
        element.setAttribute('content', content);
    }
    
    static updateForStation(stationData) {
        const brand = stationData.brand || 'Fuel Station';
        const address = stationData.address || '';
        const prices = stationData.prices ? 
            Object.entries(stationData.prices)
                .map(([fuel, price]) => `${fuel}: £${price}`)
                .join(', ') : 'Prices available';
        
        const title = `${brand} - Fuel Prices | FuelFeed`;
        const description = `Current fuel prices at ${brand}${address ? ` in ${address}` : ''}. ${prices}. Compare fuel prices across the UK with FuelFeed.`;
        
        this.updateMetaTags(title, description);
    }
}
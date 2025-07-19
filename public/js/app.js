if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker
        .register("/js/worker.js")
        .then(res => console.log("service worker registered"))
        .catch(err => console.log("service worker not registered", err))
    })
}

maptilersdk.config.apiKey = 'cwsqqYCkA54i9eIGaph9';
var map = new maptilersdk.Map({
    container: 'map',
    style: maptilersdk.MapStyle.STREETS,
    geolocate: maptilersdk.GeolocationType.POINT
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

// Function to get current map bounds as bbox parameter
function getMapBounds() {
    const bounds = map.getBounds();
    return `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
}

// Cache to avoid redundant API calls for the same area
let lastBounds = null;
let currentRequest = null;

// Function to load stations for current viewport
function loadStationsInView() {
    const bbox = getMapBounds();
    
    // Skip if bounds haven't changed significantly (within 0.001 degrees)
    if (lastBounds && Math.abs(parseFloat(bbox.split(',')[0]) - lastBounds.west) < 0.001 &&
        Math.abs(parseFloat(bbox.split(',')[1]) - lastBounds.south) < 0.001 &&
        Math.abs(parseFloat(bbox.split(',')[2]) - lastBounds.east) < 0.001 &&
        Math.abs(parseFloat(bbox.split(',')[3]) - lastBounds.north) < 0.001) {
        return;
    }
    
    // Cancel previous request if still pending
    if (currentRequest) {
        currentRequest.abort();
    }
    
    const url = `/api/data.mapbox?bbox=${bbox}`;
    console.log('Loading stations for bounds:', bbox);
    
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
            
            // Cache the current bounds
            const coords = bbox.split(',').map(Number);
            lastBounds = {
                west: coords[0],
                south: coords[1],
                east: coords[2], 
                north: coords[3]
            };
            
            console.log(`Loaded ${data.features.length} stations`);
            
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

    // When a click event occurs on a feature in the stations layer, open a popup
    map.on('click', 'stations-layer', function (e) {
        new maptilersdk.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${e.features[0].properties.title}</strong><br /><br />${e.features[0].properties.description}<br /><br /><strong>Updated:</strong> ${e.features[0].properties.updated}`)
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
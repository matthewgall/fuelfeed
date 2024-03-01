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

map.on('load', function () {
    // Add a source for the state polygons.
    map.addSource('stations', {
        'type': 'geojson',
        'data': '/api/data.mapbox'
    });

    // Add a layer showing the state polygons.
    map.addLayer({
        'id': 'stations-layer',
        'source': 'stations',
        'type': 'circle',
        'paint': {
            'circle-radius': 8,
            'circle-color': '#007cbf'
        }
    });

    // When a click event occurs on a feature in the states layer, open a popup at the
    // location of the click, with description HTML from its properties.
    map.on('click', 'stations-layer', function (e) {
        new maptilersdk.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${e.features[0].properties.title}</strong><br /><br />${e.features[0].properties.description}<br /><br /><strong>Updated:</strong> ${e.features[0].properties.updated}`)
            .addTo(map);
    });

    // Change the cursor to a pointer when the mouse is over the states layer.
    map.on('mouseenter', 'stations-layer', function () {
        map.getCanvas().style.cursor = 'pointer';
    });

    // Change it back to a pointer when it leaves.
    map.on('mouseleave', 'stations-layer', function () {
        map.getCanvas().style.cursor = '';
    });
});
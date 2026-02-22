// Street data fetching and rendering via Overpass API
const HargeisaStreets = (function () {
    // Hargeisa bounding box (south, west, north, east)
    const BBOX = '9.52,44.02,9.60,44.11';

    // Multiple Overpass endpoints for fallback
    const OVERPASS_SERVERS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];

    // Street data store
    let streets = [];
    let streetLayers = {};

    // Tiered label layers: each tier appears at a different zoom level
    var labelTiers = {
        primary: null,
        secondary: null,
        minor: null
    };

    function getLabelTier(type) {
        if (type === 'motorway' || type === 'trunk' || type === 'primary') return 'primary';
        if (type === 'secondary' || type === 'tertiary') return 'secondary';
        return 'minor';
    }

    // Road type colors and weights
    const ROAD_STYLES = {
        motorway:     { color: '#d4503a', weight: 5, label: 'street-label-primary' },
        trunk:        { color: '#d4503a', weight: 5, label: 'street-label-primary' },
        primary:      { color: '#d4503a', weight: 4, label: 'street-label-primary' },
        secondary:    { color: '#e8a44a', weight: 3, label: 'street-label-secondary' },
        tertiary:     { color: '#6a9fd8', weight: 3, label: 'street-label-secondary' },
        residential:  { color: '#9ca8b8', weight: 2, label: 'street-label' },
        living_street:{ color: '#9ca8b8', weight: 2, label: 'street-label' },
        unclassified: { color: '#b0a8c0', weight: 2, label: 'street-label' },
        default:      { color: '#b0a8c0', weight: 2, label: 'street-label' }
    };

    // Build optimized Overpass query
    // - Single query (no duplicate named+all)
    // - out geom (geometry inline, avoids slow node resolution)
    // - Only useful road types (skip service/track/path)
    function buildQuery() {
        return '[out:json][timeout:30][bbox:' + BBOX + '];' +
            'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)$"];' +
            'out geom qt;';
    }

    // Fetch from multiple servers with fallback
    function fetchStreets() {
        var query = buildQuery();

        function tryServer(index) {
            if (index >= OVERPASS_SERVERS.length) {
                return Promise.reject(new Error('All Overpass servers failed'));
            }
            var url = OVERPASS_SERVERS[index] + '?data=' + encodeURIComponent(query);
            return fetch(url).then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            }).catch(function () {
                return tryServer(index + 1);
            });
        }

        return tryServer(0);
    }

    // Parse response - optimized for out geom (geometry is inline)
    function parseResponse(data) {
        var ways = [];

        data.elements.forEach(function (el) {
            if (el.type !== 'way' || !el.tags || !el.tags.highway || !el.geometry) return;

            var coords = [];
            for (var i = 0; i < el.geometry.length; i++) {
                var pt = el.geometry[i];
                if (pt) coords.push([pt.lat, pt.lon]);
            }

            if (coords.length >= 2) {
                ways.push({
                    id: el.id,
                    name: el.tags.name || el.tags['name:en'] || el.tags['name:so'] || null,
                    nameAlt: el.tags['name:so'] || el.tags['name:en'] || null,
                    type: el.tags.highway,
                    coords: coords,
                    tags: el.tags
                });
            }
        });

        return ways;
    }

    function getStyle(type) {
        return ROAD_STYLES[type] || ROAD_STYLES.default;
    }

    function getMidpoint(coords) {
        return coords[Math.floor(coords.length / 2)];
    }

    function getBounds(coords) {
        return L.latLngBounds(coords);
    }

    // Render streets using Canvas renderer for speed
    function renderStreets(map, wayData) {
        streets = wayData;

        var renderer = L.canvas({ padding: 0.5 });

        labelTiers.primary = L.layerGroup().addTo(map);
        labelTiers.secondary = L.layerGroup();
        labelTiers.minor = L.layerGroup();

        var labelledNames = { primary: {}, secondary: {}, minor: {} };
        var namedCount = 0;

        wayData.forEach(function (way) {
            var style = getStyle(way.type);

            var polyline = L.polyline(way.coords, {
                color: style.color,
                weight: style.weight,
                opacity: 0.7,
                renderer: renderer
            }).addTo(map);

            var popupContent = '<div class="street-popup">';
            popupContent += '<div class="street-name">' + (way.name || 'Unnamed Road') + '</div>';
            popupContent += '<div class="street-type">' + way.type.replace(/_/g, ' ') + '</div>';
            if (way.nameAlt && way.nameAlt !== way.name) {
                popupContent += '<div class="street-type">' + way.nameAlt + '</div>';
            }
            popupContent += '</div>';
            polyline.bindPopup(popupContent);

            streetLayers[way.id] = { polyline: polyline, data: way };

            if (way.name) {
                namedCount++;
                var tier = getLabelTier(way.type);

                if (!labelledNames[tier][way.name]) {
                    labelledNames[tier][way.name] = true;

                    var label = L.marker(getMidpoint(way.coords), {
                        icon: L.divIcon({
                            className: style.label,
                            html: way.name,
                            iconSize: null
                        }),
                        interactive: false
                    });

                    labelTiers[tier].addLayer(label);
                }
            }
        });

        document.getElementById('street-count').textContent =
            namedCount + ' named streets / ' + wayData.length + ' total roads';

        function updateLabels() {
            var zoom = map.getZoom();

            if (zoom >= 14) {
                if (!map.hasLayer(labelTiers.primary)) map.addLayer(labelTiers.primary);
            } else {
                if (map.hasLayer(labelTiers.primary)) map.removeLayer(labelTiers.primary);
            }

            if (zoom >= 15) {
                if (!map.hasLayer(labelTiers.secondary)) map.addLayer(labelTiers.secondary);
            } else {
                if (map.hasLayer(labelTiers.secondary)) map.removeLayer(labelTiers.secondary);
            }

            if (zoom >= 16) {
                if (!map.hasLayer(labelTiers.minor)) map.addLayer(labelTiers.minor);
            } else {
                if (map.hasLayer(labelTiers.minor)) map.removeLayer(labelTiers.minor);
            }
        }

        map.on('zoomend', updateLabels);
        updateLabels();
    }

    // Main load function with retry
    function load(map) {
        var overlay = document.getElementById('loading-overlay');
        var msgEl = overlay.querySelector('.loading-content p');
        var spinnerEl = overlay.querySelector('.loading-spinner');
        var retries = 0;
        var maxRetries = 3;

        function attempt() {
            fetchStreets()
                .then(function (data) {
                    var wayData = parseResponse(data);
                    renderStreets(map, wayData);

                    overlay.classList.add('hidden');
                    setTimeout(function () {
                        overlay.style.display = 'none';
                    }, 500);
                })
                .catch(function (err) {
                    console.error('Failed to load street data:', err);
                    retries++;
                    if (retries <= maxRetries) {
                        msgEl.textContent = 'Retrying... (' + retries + '/' + maxRetries + ')';
                        setTimeout(attempt, 2000 * retries);
                    } else {
                        msgEl.textContent = 'Failed to load street data. Please refresh the page.';
                        spinnerEl.style.display = 'none';
                    }
                });
        }

        attempt();
    }

    function getStreets() {
        return streets;
    }

    function getLayer(id) {
        return streetLayers[id];
    }

    function highlight(id, map) {
        var entry = streetLayers[id];
        if (!entry) return;

        Object.values(streetLayers).forEach(function (s) {
            var origStyle = getStyle(s.data.type);
            s.polyline.setStyle({
                color: origStyle.color,
                weight: origStyle.weight,
                opacity: 0.7
            });
        });

        entry.polyline.setStyle({
            color: '#ff0000',
            weight: 6,
            opacity: 1
        });
        entry.polyline.bringToFront();

        map.fitBounds(getBounds(entry.data.coords), {
            padding: [50, 50],
            maxZoom: 17
        });

        entry.polyline.openPopup();
    }

    return {
        load: load,
        getStreets: getStreets,
        getLayer: getLayer,
        highlight: highlight
    };
})();

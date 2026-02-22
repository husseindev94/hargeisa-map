// Street data fetching and rendering via Overpass API
const HargeisaStreets = (function () {
    // Hargeisa bounding box (south, west, north, east)
    const BBOX = '9.50,43.99,9.62,44.13';

    // Overpass API endpoint
    const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

    // Street data store
    let streets = [];
    let streetLayers = {};

    // Tiered label layers: each tier appears at a different zoom level
    var labelTiers = {
        primary: null,    // motorway, trunk, primary — show at zoom 14+
        secondary: null,  // secondary, tertiary — show at zoom 15+
        minor: null       // residential, living_street, unclassified, etc. — show at zoom 16+
    };

    // Which road types go in which tier
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
        service:      { color: '#c0c4c8', weight: 1, label: 'street-label' },
        track:        { color: '#c0c4c8', weight: 1, label: 'street-label' },
        path:         { color: '#d0d4d8', weight: 1, label: 'street-label' },
        default:      { color: '#b0a8c0', weight: 2, label: 'street-label' }
    };

    // Build Overpass query for all named roads in Hargeisa
    function buildQuery() {
        return '[out:json][timeout:60];(' +
            'way["highway"]["name"](' + BBOX + ');' +
            'way["highway"](' + BBOX + ');' +
            ');out body;>;out skel qt;';
    }

    // Fetch street data from Overpass API
    function fetchStreets() {
        const query = buildQuery();
        const url = OVERPASS_URL + '?data=' + encodeURIComponent(query);

        return fetch(url)
            .then(function (response) {
                if (!response.ok) throw new Error('Overpass API error: ' + response.status);
                return response.json();
            });
    }

    // Parse Overpass response into usable street data
    function parseResponse(data) {
        const nodes = {};
        const ways = [];

        data.elements.forEach(function (el) {
            if (el.type === 'node') {
                nodes[el.id] = [el.lat, el.lon];
            }
        });

        data.elements.forEach(function (el) {
            if (el.type === 'way' && el.tags && el.tags.highway) {
                const coords = [];
                el.nodes.forEach(function (nodeId) {
                    if (nodes[nodeId]) {
                        coords.push(nodes[nodeId]);
                    }
                });

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
            }
        });

        return ways;
    }

    // Get style for a road type
    function getStyle(type) {
        return ROAD_STYLES[type] || ROAD_STYLES.default;
    }

    // Calculate midpoint of a coordinate array
    function getMidpoint(coords) {
        var mid = Math.floor(coords.length / 2);
        return coords[mid];
    }

    // Calculate bounds of a coordinate array
    function getBounds(coords) {
        return L.latLngBounds(coords);
    }

    // Render streets on the map
    function renderStreets(map, wayData) {
        streets = wayData;

        // Create tiered label layer groups
        labelTiers.primary = L.layerGroup().addTo(map);
        labelTiers.secondary = L.layerGroup();
        labelTiers.minor = L.layerGroup();

        // Track names already labelled per tier to avoid duplicates
        var labelledNames = { primary: {}, secondary: {}, minor: {} };

        var namedCount = 0;

        wayData.forEach(function (way) {
            var style = getStyle(way.type);

            // Draw the street polyline
            var polyline = L.polyline(way.coords, {
                color: style.color,
                weight: style.weight,
                opacity: 0.7
            }).addTo(map);

            // Add popup with street info
            var popupContent = '<div class="street-popup">';
            popupContent += '<div class="street-name">' + (way.name || 'Unnamed Road') + '</div>';
            popupContent += '<div class="street-type">' + way.type.replace(/_/g, ' ') + '</div>';
            if (way.nameAlt && way.nameAlt !== way.name) {
                popupContent += '<div class="street-type">' + way.nameAlt + '</div>';
            }
            popupContent += '</div>';
            polyline.bindPopup(popupContent);

            // Store for search
            streetLayers[way.id] = { polyline: polyline, data: way };

            // Add street name label at midpoint (one label per unique name per tier)
            if (way.name) {
                namedCount++;
                var tier = getLabelTier(way.type);

                if (!labelledNames[tier][way.name]) {
                    labelledNames[tier][way.name] = true;

                    var midpoint = getMidpoint(way.coords);
                    var labelClass = style.label;

                    var label = L.marker(midpoint, {
                        icon: L.divIcon({
                            className: labelClass,
                            html: way.name,
                            iconSize: null
                        }),
                        interactive: false
                    });

                    labelTiers[tier].addLayer(label);
                }
            }
        });

        // Update street count
        document.getElementById('street-count').textContent =
            namedCount + ' named streets / ' + wayData.length + ' total roads';

        // Manage label visibility based on zoom — show tiers progressively
        function updateLabels() {
            var zoom = map.getZoom();

            // Primary labels: zoom 14+
            if (zoom >= 14) {
                if (!map.hasLayer(labelTiers.primary)) map.addLayer(labelTiers.primary);
            } else {
                if (map.hasLayer(labelTiers.primary)) map.removeLayer(labelTiers.primary);
            }

            // Secondary labels: zoom 15+
            if (zoom >= 15) {
                if (!map.hasLayer(labelTiers.secondary)) map.addLayer(labelTiers.secondary);
            } else {
                if (map.hasLayer(labelTiers.secondary)) map.removeLayer(labelTiers.secondary);
            }

            // Minor labels: zoom 16+
            if (zoom >= 16) {
                if (!map.hasLayer(labelTiers.minor)) map.addLayer(labelTiers.minor);
            } else {
                if (map.hasLayer(labelTiers.minor)) map.removeLayer(labelTiers.minor);
            }
        }

        map.on('zoomend', updateLabels);
        updateLabels();
    }

    // Main load function
    function load(map) {
        var overlay = document.getElementById('loading-overlay');

        fetchStreets()
            .then(function (data) {
                var wayData = parseResponse(data);
                renderStreets(map, wayData);

                // Hide loading overlay
                overlay.classList.add('hidden');
                setTimeout(function () {
                    overlay.style.display = 'none';
                }, 500);
            })
            .catch(function (err) {
                console.error('Failed to load street data:', err);
                overlay.querySelector('p').textContent =
                    'Failed to load street data. Please refresh the page.';
                overlay.querySelector('.loading-spinner').style.display = 'none';
            });
    }

    // Get all streets for search
    function getStreets() {
        return streets;
    }

    // Get layer for a street by ID
    function getLayer(id) {
        return streetLayers[id];
    }

    // Highlight a street
    function highlight(id, map) {
        var entry = streetLayers[id];
        if (!entry) return;

        // Reset any previous highlight
        Object.values(streetLayers).forEach(function (s) {
            var origStyle = getStyle(s.data.type);
            s.polyline.setStyle({
                color: origStyle.color,
                weight: origStyle.weight,
                opacity: 0.7
            });
        });

        // Highlight selected street
        entry.polyline.setStyle({
            color: '#ff0000',
            weight: 6,
            opacity: 1
        });
        entry.polyline.bringToFront();

        // Zoom to street
        map.fitBounds(getBounds(entry.data.coords), {
            padding: [50, 50],
            maxZoom: 17
        });

        // Open popup
        entry.polyline.openPopup();
    }

    return {
        load: load,
        getStreets: getStreets,
        getLayer: getLayer,
        highlight: highlight
    };
})();

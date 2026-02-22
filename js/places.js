// Places (POI) search via Overpass API
const HargeisaPlaces = (function () {
    const BBOX = '9.52,44.02,9.60,44.11';
    const OVERPASS_SERVERS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];

    // Category definitions with Overpass tags and marker colors
    const CATEGORIES = {
        hotels: {
            label: 'Hotels',
            tags: ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel', 'tourism=motel'],
            color: '#8e24aa',
            icon: '\u{1F3E8}'
        },
        restaurants: {
            label: 'Restaurants',
            tags: ['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food'],
            color: '#e65100',
            icon: '\u{1F37D}'
        },
        banks: {
            label: 'Banks',
            tags: ['amenity=bank', 'amenity=atm', 'amenity=money_transfer'],
            color: '#1565c0',
            icon: '\u{1F3E6}'
        },
        malls: {
            label: 'Malls',
            tags: ['shop=mall', 'shop=department_store', 'shop=supermarket', 'building=retail'],
            color: '#c62828',
            icon: '\u{1F3EC}'
        }
    };

    var markersLayer = null;
    var activeCategory = null;
    var placesCache = {};
    var allPlaces = [];

    function init(map) {
        markersLayer = L.layerGroup().addTo(map);

        // Set up category button handlers
        var buttons = document.querySelectorAll('.category-btn');
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var category = this.dataset.category;

                // Toggle: clicking active category clears it
                if (activeCategory === category) {
                    clearMarkers();
                    setActiveButton(null);
                    activeCategory = null;
                    return;
                }

                setActiveButton(category);
                activeCategory = category;
                loadCategory(category, map);
            });
        });
    }

    function setActiveButton(category) {
        var buttons = document.querySelectorAll('.category-btn');
        buttons.forEach(function (btn) {
            if (category && btn.dataset.category === category) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function buildQuery(category) {
        var cat = CATEGORIES[category];
        var parts = [];

        cat.tags.forEach(function (tag) {
            // Tags like "shop" (no value) vs "amenity=restaurant" (key=value)
            if (tag.indexOf('=') === -1) {
                parts.push('node["' + tag + '"](' + BBOX + ');');
                parts.push('way["' + tag + '"](' + BBOX + ');');
            } else {
                var kv = tag.split('=');
                parts.push('node["' + kv[0] + '"="' + kv[1] + '"](' + BBOX + ');');
                parts.push('way["' + kv[0] + '"="' + kv[1] + '"](' + BBOX + ');');
            }
        });

        return '[out:json][timeout:15];(' + parts.join('') + ');out center;';
    }

    function fetchFromServers(query) {
        function tryServer(index) {
            if (index >= OVERPASS_SERVERS.length) {
                return Promise.reject(new Error('All servers failed'));
            }
            var url = OVERPASS_SERVERS[index] + '?data=' + encodeURIComponent(query);
            return fetch(url).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).catch(function () {
                return tryServer(index + 1);
            });
        }
        return tryServer(0);
    }

    function loadCategory(category, map) {
        if (placesCache[category]) {
            displayPlaces(placesCache[category], category, map);
            return;
        }

        var btn = document.querySelector('.category-btn[data-category="' + category + '"]');
        btn.classList.add('loading');

        fetchFromServers(buildQuery(category))
            .then(function (data) {
                var places = parsePlaces(data, category);
                placesCache[category] = places;
                updateAllPlaces();
                displayPlaces(places, category, map);
                btn.classList.remove('loading');
            })
            .catch(function (err) {
                console.error('Failed to load ' + category + ':', err);
                btn.classList.remove('loading');
            });
    }

    function parsePlaces(data, category) {
        var places = [];

        data.elements.forEach(function (el) {
            var lat, lng;

            if (el.type === 'node') {
                lat = el.lat;
                lng = el.lon;
            } else if (el.center) {
                lat = el.center.lat;
                lng = el.center.lon;
            } else {
                return;
            }

            var name = el.tags.name || el.tags['name:en'] || el.tags['name:so'] || null;

            places.push({
                id: el.id,
                name: name,
                lat: lat,
                lng: lng,
                category: category,
                tags: el.tags
            });
        });

        return places;
    }

    function displayPlaces(places, category, map) {
        clearMarkers();

        var cat = CATEGORIES[category];

        places.forEach(function (place) {
            var marker = L.circleMarker([place.lat, place.lng], {
                radius: 8,
                fillColor: cat.color,
                color: '#fff',
                weight: 2,
                fillOpacity: 0.9
            }).addTo(markersLayer);

            // Build popup
            var popupHtml = '<div class="place-popup">';
            popupHtml += '<div class="place-name">' + (place.name || 'Unnamed ' + cat.label.slice(0, -1)) + '</div>';
            popupHtml += '<div class="place-category">' + cat.icon + ' ' + cat.label + '</div>';

            if (place.tags.phone || place.tags['contact:phone']) {
                popupHtml += '<div class="place-detail">Phone: ' + (place.tags.phone || place.tags['contact:phone']) + '</div>';
            }
            if (place.tags['addr:street']) {
                popupHtml += '<div class="place-detail">' + place.tags['addr:street'] + '</div>';
            }
            if (place.tags.opening_hours) {
                popupHtml += '<div class="place-detail">Hours: ' + place.tags.opening_hours + '</div>';
            }

            popupHtml += '</div>';
            marker.bindPopup(popupHtml, { offset: [0, -4] });

            // Fly to place and open popup on click
            marker.on('click', function () {
                map.flyTo([place.lat, place.lng], 18, { duration: 0.8 });
                setTimeout(function () {
                    marker.openPopup();
                }, 850);
            });
        });

        // Update result count
        var btn = document.querySelector('.category-btn[data-category="' + category + '"]');
        if (btn) {
            var countBadge = btn.querySelector('.category-count');
            if (!countBadge) {
                countBadge = document.createElement('span');
                countBadge.className = 'category-count';
                btn.appendChild(countBadge);
            }
            countBadge.textContent = places.length;
        }
    }

    function clearMarkers() {
        if (markersLayer) {
            markersLayer.clearLayers();
        }
        // Remove count badges
        var badges = document.querySelectorAll('.category-count');
        badges.forEach(function (b) { b.remove(); });
    }

    function updateAllPlaces() {
        allPlaces = [];
        Object.keys(placesCache).forEach(function (cat) {
            placesCache[cat].forEach(function (place) {
                allPlaces.push(place);
            });
        });
    }

    // Preload all categories in the background
    function preloadAll() {
        Object.keys(CATEGORIES).forEach(function (cat, idx) {
            setTimeout(function () {
                if (!placesCache[cat]) {
                    fetchFromServers(buildQuery(cat))
                        .then(function (data) {
                            placesCache[cat] = parsePlaces(data, cat);
                            updateAllPlaces();
                        })
                        .catch(function () {});
                }
            }, idx * 1500);
        });
    }

    // Search places by name
    function searchPlaces(query) {
        if (!query || allPlaces.length === 0) return [];

        var queryLower = query.toLowerCase();
        var matches = allPlaces.filter(function (place) {
            if (!place.name) return false;
            return place.name.toLowerCase().indexOf(queryLower) !== -1;
        });

        // Remove duplicates
        var seen = {};
        matches = matches.filter(function (place) {
            var key = place.name + '_' + place.category;
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });

        return matches.slice(0, 10);
    }

    function getCategories() {
        return CATEGORIES;
    }

    function getActiveCategory() {
        return activeCategory;
    }

    return {
        init: init,
        preloadAll: preloadAll,
        searchPlaces: searchPlaces,
        getCategories: getCategories,
        getActiveCategory: getActiveCategory,
        clearMarkers: clearMarkers
    };
})();

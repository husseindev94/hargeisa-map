// Hargeisa Map Application
// Main initialization

const HargeisaMap = (function () {
    // Hargeisa center coordinates
    const CENTER = [9.56, 44.064];
    const DEFAULT_ZOOM = 14;
    const MIN_ZOOM = 12;

    // Bounds to restrict map to Hargeisa area
    const HARGEISA_BOUNDS = L.latLngBounds(
        [9.46, 43.94],  // Southwest corner
        [9.66, 44.18]   // Northeast corner
    );

    let map;

    // Satellite tile layer
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri, Maxar, Earthstar Geographics',
        maxZoom: 19
    });

    function init() {
        // Create map
        map = L.map('map', {
            center: CENTER,
            zoom: DEFAULT_ZOOM,
            minZoom: MIN_ZOOM,
            maxBounds: HARGEISA_BOUNDS,
            maxBoundsViscosity: 1.0,
            zoomControl: false,
            layers: [satelliteLayer]
        });

        // Zoom control - bottom right
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Show coordinates on mouse move
        const coordDisplay = document.getElementById('coord-display');
        map.on('mousemove', function (e) {
            coordDisplay.textContent = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
        });

        // Sidebar toggle
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const sidebarClose = document.getElementById('sidebar-close');

        sidebarToggle.addEventListener('click', function () {
            sidebar.classList.toggle('open');
        });

        sidebarClose.addEventListener('click', function () {
            sidebar.classList.remove('open');
        });

        // District navigation
        const districtItems = document.querySelectorAll('#district-list li');
        districtItems.forEach(function (item) {
            item.addEventListener('click', function () {
                const lat = parseFloat(this.dataset.lat);
                const lng = parseFloat(this.dataset.lng);
                map.flyTo([lat, lng], 16, { duration: 1.5 });

                districtItems.forEach(function (el) { el.classList.remove('active'); });
                this.classList.add('active');

                // Close sidebar on mobile
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                }
            });
        });

        // Close search results when clicking on map
        map.on('click', function () {
            document.getElementById('search-results').classList.remove('active');
        });

        // Load streets
        HargeisaStreets.load(map);

        return map;
    }

    function getMap() {
        return map;
    }

    return { init: init, getMap: getMap };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    HargeisaMap.init();
});

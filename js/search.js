// Street search with autocomplete
const HargeisaSearch = (function () {
    var searchInput = document.getElementById('search-input');
    var searchResults = document.getElementById('search-results');
    var searchBtn = document.getElementById('search-btn');
    var debounceTimer = null;

    function init() {
        // Search on input
        searchInput.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                performSearch(searchInput.value.trim());
            }, 200);
        });

        // Search on button click
        searchBtn.addEventListener('click', function () {
            performSearch(searchInput.value.trim());
        });

        // Search on Enter
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                performSearch(searchInput.value.trim());
            }
            if (e.key === 'Escape') {
                searchResults.classList.remove('active');
            }
        });

        // Close results when clicking outside
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.search-container')) {
                searchResults.classList.remove('active');
            }
        });

        // Focus input
        searchInput.addEventListener('focus', function () {
            if (searchInput.value.trim().length > 0) {
                performSearch(searchInput.value.trim());
            }
        });
    }

    function performSearch(query) {
        if (query.length < 1) {
            searchResults.classList.remove('active');
            searchResults.innerHTML = '';
            return;
        }

        var streets = HargeisaStreets.getStreets();
        var queryLower = query.toLowerCase();

        // Filter named streets matching query
        var matches = streets.filter(function (street) {
            if (!street.name) return false;
            return street.name.toLowerCase().indexOf(queryLower) !== -1;
        });

        // Remove duplicates by name
        var seen = {};
        matches = matches.filter(function (street) {
            if (seen[street.name]) return false;
            seen[street.name] = true;
            return true;
        });

        // Sort: exact prefix matches first, then alphabetical
        matches.sort(function (a, b) {
            var aStarts = a.name.toLowerCase().indexOf(queryLower) === 0;
            var bStarts = b.name.toLowerCase().indexOf(queryLower) === 0;
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.name.localeCompare(b.name);
        });

        // Limit results
        matches = matches.slice(0, 15);

        renderResults(matches);
    }

    function renderResults(matches) {
        if (matches.length === 0) {
            searchResults.innerHTML = '<li style="color:#9aa0a6;cursor:default;">No streets found</li>';
            searchResults.classList.add('active');
            return;
        }

        var html = '';
        matches.forEach(function (street) {
            var typeLabel = street.type.replace(/_/g, ' ');
            html += '<li data-id="' + street.id + '">';
            html += '<span class="result-icon">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
            html += '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>';
            html += '<circle cx="12" cy="10" r="3"/>';
            html += '</svg>';
            html += '</span>';
            html += '<span>' + highlightMatch(street.name, searchInput.value.trim()) + '</span>';
            html += '<span class="result-type">' + typeLabel + '</span>';
            html += '</li>';
        });

        searchResults.innerHTML = html;
        searchResults.classList.add('active');

        // Add click handlers to results
        var items = searchResults.querySelectorAll('li[data-id]');
        items.forEach(function (item) {
            item.addEventListener('click', function () {
                var streetId = parseInt(this.dataset.id);
                var map = HargeisaMap.getMap();
                HargeisaStreets.highlight(streetId, map);

                // Update search input
                var street = HargeisaStreets.getStreets().find(function (s) {
                    return s.id === streetId;
                });
                if (street) {
                    searchInput.value = street.name;
                }

                searchResults.classList.remove('active');
            });
        });
    }

    function highlightMatch(text, query) {
        if (!query) return text;
        var idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return text;
        return text.substring(0, idx) +
            '<strong>' + text.substring(idx, idx + query.length) + '</strong>' +
            text.substring(idx + query.length);
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function () {
        init();
    });

    return { performSearch: performSearch };
})();

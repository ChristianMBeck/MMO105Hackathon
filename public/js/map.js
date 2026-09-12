(() => {
  const mapEl = document.getElementById("visit-map");
  if (!mapEl || typeof L === "undefined") return;

  const listEl = document.getElementById("map-list");
  const emptyEl = document.getElementById("map-empty");
  const clearBtn = document.getElementById("map-clear");
  const filterLabel = document.getElementById("map-filter-label");
  const countryCountEl = document.getElementById("map-country-count");
  const placeCountEl = document.getElementById("map-place-count");
  const photoCard = document.getElementById("map-photo-card");
  const photoImg = document.getElementById("map-photo-img");
  const photoMissing = document.getElementById("map-photo-missing");
  const photoName = document.getElementById("map-photo-name");
  const photoMeta = document.getElementById("map-photo-meta");
  const photoClose = document.getElementById("map-photo-close");
  const cartoKey = (window.WAYPOINT_MAP && window.WAYPOINT_MAP.cartoKey) || "";
  const tileUrl = cartoKey
    ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  const map = L.map(mapEl, {
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 12,
    zoomControl: true,
  }).setView([20, 8], 2);

  L.tileLayer(tileUrl, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  const pinIcon = L.divIcon({
    className: "wp-pin",
    html: "<span></span>",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });

  let data = { countries: [], places: [] };
  let activeCountry = "";
  let activePlaceId = "";
  let countryLayer = null;
  const featureByKey = new Map();
  const markersById = new Map();

  function photoSrc(place) {
    const path = place && place.photoPath;
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `/monument-photos/${path}`;
  }

  function hidePlaceCard() {
    activePlaceId = "";
    if (photoCard) photoCard.hidden = true;
    if (listEl) {
      listEl.querySelectorAll(".map-list-item.active").forEach((item) => item.classList.remove("active"));
    }
  }

  function showPlace(place) {
    if (!place) return;
    activePlaceId = place.id || place.name;
    const src = photoSrc(place);
    const meta = [place.country, formatDate(place.firstLoggedAt)].filter(Boolean).join(" · ");
    if (photoName) photoName.textContent = place.name || "Monument";
    if (photoMeta) photoMeta.textContent = meta;
    if (photoImg) {
      photoImg.hidden = !src;
      photoImg.alt = place.name || "";
      photoImg.src = src || "";
    }
    if (photoMissing) photoMissing.hidden = Boolean(src);
    if (photoCard) photoCard.hidden = false;
    if (listEl) {
      listEl.querySelectorAll(".map-list-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.placeId === activePlaceId);
      });
    }
    if (Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
      map.flyTo([place.lat, place.lon], 6, { duration: 0.6 });
    }
  }

  function keysFor(country) {
    return new Set((country.matchKeys || [country.name.toLowerCase()]).map((key) => String(key).toLowerCase()));
  }

  function featureMatches(feature, country) {
    const wanted = keysFor(country);
    const props = feature.properties || {};
    const candidates = [props.name, props.NAME, props.ADMIN, feature.id];
    return candidates.some((value) => value && wanted.has(String(value).toLowerCase()));
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function visiblePlaces() {
    if (!activeCountry) return data.places;
    const wanted = keysFor(data.countries.find((row) => row.name === activeCountry) || { name: activeCountry });
    return data.places.filter((place) => wanted.has(String(place.country || "").toLowerCase()) || place.country === activeCountry);
  }

  function renderList() {
    const countries = data.countries;
    const places = visiblePlaces();
    countryCountEl.textContent = String(countries.length);
    placeCountEl.textContent = String(data.places.length);
    clearBtn.hidden = !activeCountry;
    filterLabel.hidden = !activeCountry;
    filterLabel.textContent = activeCountry ? `${activeCountry} · ${places.length} place${places.length === 1 ? "" : "s"}` : "";

    const empty = !countries.length && !data.places.length;
    emptyEl.hidden = !empty;
    listEl.hidden = empty;
    listEl.innerHTML = "";
    if (empty) return;

    const source = activeCountry
      ? places
      : [
          ...countries.map((country) => ({ type: "country", ...country })),
          ...data.places.map((place) => ({ type: "place", ...place })),
        ];

    for (const item of source) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-list-item";
      const isPlace = item.type === "place" || item.lat != null;
      if (isPlace) button.dataset.placeId = item.id || item.name;
      if (isPlace && (item.id || item.name) === activePlaceId) button.classList.add("active");
      const meta = isPlace
        ? [item.country, formatDate(item.firstLoggedAt)].filter(Boolean).join(" · ")
        : `${item.placeCount} place${item.placeCount === 1 ? "" : "s"}`;
      button.innerHTML = `<strong>${item.name}</strong><span>${meta}</span>`;
      button.addEventListener("click", () => {
        if (isPlace) {
          showPlace(item);
          return;
        }
        hidePlaceCard();
        focusCountry(item.name);
      });
      listEl.appendChild(button);
    }
  }

  function focusCountry(name) {
    activeCountry = name;
    const feature = featureByKey.get(name.toLowerCase());
    if (feature) {
      map.fitBounds(L.geoJSON(feature).getBounds().pad(0.15), { maxZoom: 6 });
    }
    if (countryLayer) countryLayer.setStyle((feat) => styleFor(feat));
    renderList();
  }

  function styleFor(feature) {
    const visited = data.countries.some((country) => featureMatches(feature, country));
    const selected = activeCountry && data.countries.some((country) => country.name === activeCountry && featureMatches(feature, country));
    return {
      color: selected ? "#7af0e3" : visited ? "#3dd6c6" : "rgba(255,255,255,0.12)",
      weight: selected ? 1.8 : visited ? 1 : 0.6,
      fillColor: selected ? "#3dd6c6" : visited ? "#3dd6c6" : "#10131b",
      fillOpacity: selected ? 0.45 : visited ? 0.28 : 0.04,
    };
  }

  function bindCountryLayer(world) {
    featureByKey.clear();
    for (const country of data.countries) {
      const match = world.features.find((feature) => featureMatches(feature, country));
      if (match) featureByKey.set(country.name.toLowerCase(), match);
    }

    countryLayer = L.geoJSON(world, {
      style: (feature) => styleFor(feature),
      onEachFeature(feature, layer) {
        const country = data.countries.find((row) => featureMatches(feature, row));
        if (!country) return;
        layer.on("click", () => focusCountry(country.name));
        layer.bindTooltip(country.name, { sticky: true, className: "wp-tooltip" });
      },
    }).addTo(map);
  }

  function addPins() {
    const bounds = [];
    markersById.clear();
    for (const place of data.places) {
      const marker = L.marker([place.lat, place.lon], { icon: pinIcon }).addTo(map);
      marker.on("click", () => showPlace(place));
      markersById.set(place.id || place.name, marker);
      bounds.push([place.lat, place.lon]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
  }

  if (photoClose) photoClose.addEventListener("click", hidePlaceCard);

  clearBtn.addEventListener("click", () => {
    hidePlaceCard();
    activeCountry = "";
    if (countryLayer) countryLayer.setStyle((feat) => styleFor(feat));
    if (data.places.length) {
      map.fitBounds(
        data.places.map((place) => [place.lat, place.lon]),
        { padding: [40, 40], maxZoom: 5 }
      );
    } else {
      map.setView([20, 8], 2);
    }
    renderList();
  });

  Promise.all([fetch("/api/map"), fetch("/data/countries.geojson")])
    .then(async ([mapRes, worldRes]) => {
      if (!mapRes.ok) throw new Error("Could not load map visits.");
      if (!worldRes.ok) throw new Error("Could not load country outlines.");
      data = await mapRes.json();
      const world = await worldRes.json();
      bindCountryLayer(world);
      addPins();
      renderList();
      requestAnimationFrame(() => map.invalidateSize());
    })
    .catch((err) => {
      emptyEl.hidden = false;
      emptyEl.querySelector("p").textContent = err.message || "Could not load the map.";
    });
})();

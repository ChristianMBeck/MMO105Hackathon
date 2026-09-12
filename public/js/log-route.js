(() => {
  const mapEl = document.getElementById("route-map");
  const form = document.getElementById("log-form");
  const search = document.getElementById("place-search");
  const suggest = document.getElementById("place-suggest");
  const list = document.getElementById("route-stops");
  const totalEl = document.getElementById("route-total");
  const routeInput = document.getElementById("route-json");
  const countriesWrap = document.getElementById("route-countries");
  const chipsEl = document.getElementById("country-chips");
  const countryAdd = document.getElementById("country-add");
  const countryNames = document.getElementById("country-names");
  const countryAddBtn = document.getElementById("country-add-btn");
  const countryGuessBtn = document.getElementById("country-guess-btn");
  if (!mapEl || !form || typeof L === "undefined") return;

  const MODE_FACTORS = { plane: 1, car: 1.2, train: 1.15, bike: 1.1, foot: 1.15, other: 1.2 };
  const MODES = [
    { id: "car", label: "Car" },
    { id: "plane", label: "Plane" },
    { id: "train", label: "Train" },
    { id: "bike", label: "Bike" },
    { id: "foot", label: "Foot" },
  ];

  const cartoKey = (window.WAYPOINT_MAP && window.WAYPOINT_MAP.cartoKey) || "";
  const tileUrl = cartoKey
    ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  const map = L.map(mapEl, { worldCopyJump: true, minZoom: 2, maxZoom: 18 }).setView([20, 8], 2);
  L.tileLayer(tileUrl, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  const stops = [];
  const modes = [];
  const markers = [];
  let countries = [];
  let countriesManual = false;
  let line = null;
  let timer = 0;
  let guessTimer = 0;

  function haversineMiles(from, to) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(to.lat - from.lat);
    const dLon = toRad(to.lon - from.lon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function legMiles(from, to, mode) {
    return Math.round(haversineMiles(from, to) * (MODE_FACTORS[mode] || 1.2) * 10) / 10;
  }

  function pinIcon(index) {
    return L.divIcon({
      className: "route-pin",
      html: `<span>${index + 1}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  function syncInput() {
    routeInput.value = JSON.stringify({
      stops: stops.map((stop) => ({
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        country: stop.country || "",
        state: stop.state || "",
      })),
      modes: modes.slice(),
      countries: countries.slice(),
    });
  }

  function renderCountries() {
    if (!countriesWrap || !chipsEl) return;
    countriesWrap.hidden = !stops.length;
    chipsEl.replaceChildren();
    if (!countries.length && stops.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No countries guessed yet.";
      chipsEl.appendChild(empty);
    } else {
      countries.forEach((name, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "country-chip";
        btn.dataset.drop = String(index);
        btn.append(name, " ");
        const x = document.createElement("span");
        x.setAttribute("aria-hidden", "true");
        x.textContent = "×";
        btn.appendChild(x);
        chipsEl.appendChild(btn);
      });
    }
    syncInput();
  }

  async function guessCountries() {
    if (!stops.length) {
      countries = [];
      renderCountries();
      return;
    }
    try {
      const res = await fetch("/api/route-countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stops: stops.map((stop) => ({ lat: stop.lat, lon: stop.lon, country: stop.country || "" })),
          modes,
        }),
      });
      if (!res.ok) throw new Error("guess failed");
      const data = await res.json();
      countries = Array.isArray(data.countries) ? data.countries : [];
    } catch {
      countries = [...new Set(stops.map((stop) => stop.country).filter(Boolean))];
    }
    countriesManual = false;
    renderCountries();
  }

  function scheduleGuess() {
    if (countriesManual) {
      for (const stop of stops) {
        if (stop.country && !countries.some((item) => item.toLowerCase() === stop.country.toLowerCase())) {
          countries.push(stop.country);
        }
      }
      renderCountries();
      return;
    }
    clearTimeout(guessTimer);
    guessTimer = setTimeout(guessCountries, 200);
  }

  function addCountry(raw) {
    const name = String(raw || "").trim();
    if (!name) return;
    const options = countryNames ? [...countryNames.querySelectorAll("option")].map((opt) => opt.value) : [];
    const match = options.find((item) => item.toLowerCase() === name.toLowerCase()) || name;
    if (countries.some((item) => item.toLowerCase() === match.toLowerCase())) return;
    countries.push(match);
    countriesManual = true;
    if (countryAdd) countryAdd.value = "";
    renderCountries();
  }

  function drawMap() {
    markers.forEach((marker) => marker.remove());
    markers.length = 0;
    if (line) {
      line.remove();
      line = null;
    }
    stops.forEach((stop, index) => {
      const marker = L.marker([stop.lat, stop.lon], { icon: pinIcon(index) })
        .addTo(map)
        .bindTooltip(stop.name);
      markers.push(marker);
    });
    if (stops.length >= 2) {
      line = L.polyline(
        stops.map((stop) => [stop.lat, stop.lon]),
        { color: "#3dd6c6", weight: 3, opacity: 0.85 }
      ).addTo(map);
    }
    if (stops.length === 1) map.setView([stops[0].lat, stops[0].lon], 6);
    if (stops.length >= 2) map.fitBounds(line.getBounds(), { padding: [28, 28], maxZoom: 8 });
  }

  function renderList() {
    list.innerHTML = "";
    let total = 0;
    stops.forEach((stop, index) => {
      if (index > 0) {
        const mode = modes[index - 1] || "car";
        const miles = legMiles(stops[index - 1], stop, mode);
        total += miles;
        const leg = document.createElement("li");
        leg.className = "route-leg";
        const options = MODES.map((item) => `<option value="${item.id}" ${item.id === mode ? "selected" : ""}>${item.label}</option>`).join("");
        leg.innerHTML = `<span class="route-leg-line"></span><label>Mode <select data-leg="${index - 1}">${options}</select></label><span>${miles} mi</span>`;
        list.appendChild(leg);
      }
      const item = document.createElement("li");
      item.className = "route-stop";
      item.innerHTML = `<span class="route-num">${index + 1}</span><div><strong>${stop.name}</strong><small>${[stop.state, stop.country].filter(Boolean).join(", ")}</small></div><button type="button" class="btn btn-ghost sm" data-remove="${index}">Remove</button>`;
      list.appendChild(item);
    });
    if (!stops.length) totalEl.textContent = "Add two stops to estimate miles.";
    else if (stops.length === 1) totalEl.textContent = "Add another stop to estimate miles.";
    else totalEl.textContent = `Est. ${Math.round(total * 10) / 10} mi`;
    syncInput();
    drawMap();
    scheduleGuess();
  }

  function addStop(place) {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
    if (stops.length) modes.push("car");
    stops.push(place);
    renderList();
    search.value = "";
    suggest.hidden = true;
    suggest.innerHTML = "";
  }

  async function searchPlaces(q) {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error("Search failed");
    return res.json();
  }

  search.addEventListener("input", () => {
    const q = search.value.trim();
    clearTimeout(timer);
    if (q.length < 2) {
      suggest.hidden = true;
      suggest.innerHTML = "";
      return;
    }
    timer = setTimeout(async () => {
      try {
        const hits = await searchPlaces(q);
        if (!hits.length) {
          suggest.hidden = true;
          suggest.innerHTML = "";
          return;
        }
        suggest.innerHTML = hits
          .map((hit, index) => `<button type="button" data-hit="${index}">${hit.displayName || hit.name}</button>`)
          .join("");
        suggest.hidden = false;
        suggest.querySelectorAll("button").forEach((btn) => {
          btn.addEventListener("click", () => addStop(hits[Number(btn.dataset.hit)]));
        });
      } catch {
        suggest.hidden = true;
      }
    }, 350);
  });

  list.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove]");
    if (!btn) return;
    const index = Number(btn.dataset.remove);
    stops.splice(index, 1);
    modes.splice(Math.max(0, index - 1), 1);
    if (modes.length > Math.max(0, stops.length - 1)) modes.length = Math.max(0, stops.length - 1);
    renderList();
  });

  list.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-leg]");
    if (!select) return;
    modes[Number(select.dataset.leg)] = select.value;
    renderList();
  });

  map.on("click", async (event) => {
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${event.latlng.lat}&lon=${event.latlng.lng}`);
      if (!res.ok) return;
      addStop(await res.json());
    } catch {
      addStop({
        name: "Dropped pin",
        lat: event.latlng.lat,
        lon: event.latlng.lng,
        country: "",
        state: "",
      });
    }
  });

  form.addEventListener("submit", (event) => {
    syncInput();
    if (!stops.length) {
      event.preventDefault();
      totalEl.textContent = "Add at least one stop.";
    }
  });

  if (chipsEl) {
    chipsEl.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-drop]");
      if (!btn) return;
      countries.splice(Number(btn.dataset.drop), 1);
      countriesManual = true;
      renderCountries();
    });
  }
  if (countryAddBtn) countryAddBtn.addEventListener("click", () => addCountry(countryAdd && countryAdd.value));
  if (countryAdd) {
    countryAdd.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCountry(countryAdd.value);
      }
    });
  }
  if (countryGuessBtn) countryGuessBtn.addEventListener("click", () => guessCountries());

  fetch("/api/countries")
    .then((res) => (res.ok ? res.json() : []))
    .then((names) => {
      if (!countryNames || !Array.isArray(names)) return;
      countryNames.innerHTML = names.map((name) => `<option value="${name}"></option>`).join("");
    })
    .catch(() => {});

  setTimeout(() => map.invalidateSize(), 200);
})();

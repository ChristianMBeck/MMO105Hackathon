const fs = require("fs");
const path = require("path");
const { canonicalCountryName } = require("./geo");

const SKIP = new Set(["Antarctica", "French Southern and Antarctic Lands"]);
const WORLD_PATH = path.join(__dirname, "..", "public", "data", "countries.geojson");
const EARTH_RADIUS = 6378137;
const MAX_LAT = 85.0511287798;
const DEG = Math.PI / 180;

let cached = null;

function projectLonLat(lon, lat) {
  const clamped = Math.max(Math.min(MAX_LAT, lat), -MAX_LAT);
  const sin = Math.sin(clamped * DEG);
  return [EARTH_RADIUS * lon * DEG, (EARTH_RADIUS * Math.log((1 + sin) / (1 - sin))) / 2];
}

function bboxOfProjected(polygons, box) {
  const out = box || [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (const [x, y] of ring) {
        out[0] = Math.min(out[0], x);
        out[1] = Math.min(out[1], y);
        out[2] = Math.max(out[2], x);
        out[3] = Math.max(out[3], y);
      }
    }
  }
  return out;
}

function projectGeometry(geometry) {
  if (!geometry) return [];
  const projectRing = (ring) => ring.map(([lon, lat]) => projectLonLat(lon, lat));
  if (geometry.type === "Polygon") return [geometry.coordinates.map(projectRing)];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((rings) => rings.map(projectRing));
  }
  return [];
}

function loadWorld() {
  if (cached) return cached;
  const world = JSON.parse(fs.readFileSync(WORLD_PATH, "utf8"));
  cached = (world.features || [])
    .map((feature) => {
      const name = canonicalCountryName(feature.properties && feature.properties.name);
      if (!name || SKIP.has(name)) return null;
      const mercPolygons = projectGeometry(feature.geometry);
      if (!mercPolygons.length) return null;
      return {
        name,
        mercPolygons,
        mercBbox: bboxOfProjected(mercPolygons),
      };
    })
    .filter(Boolean);
  return cached;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInProjectedPolygon(x, y, rings) {
  if (!rings.length || !pointInRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(x, y, rings[i])) return false;
  }
  return true;
}

function pointInFeature(xy, feature) {
  const [x, y] = xy;
  const [minX, minY, maxX, maxY] = feature.mercBbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  return feature.mercPolygons.some((rings) => pointInProjectedPolygon(x, y, rings));
}

function countryAtLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const xy = projectLonLat(lon, lat);
  const hit = loadWorld().find((feature) => pointInFeature(xy, feature));
  return hit ? hit.name : "";
}

function orient(ax, ay, bx, by, cx, cy) {
  return (by - ay) * (cx - ax) - (bx - ax) * (cy - ay);
}

function onSegment(ax, ay, bx, by, px, py) {
  return (
    Math.min(ax, bx) - 1e-6 <= px &&
    px <= Math.max(ax, bx) + 1e-6 &&
    Math.min(ay, by) - 1e-6 <= py &&
    py <= Math.max(ay, by) + 1e-6
  );
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
  const o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]);
  const o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  if ((o1 > 0 !== o2 > 0) && (o3 > 0 !== o4 > 0)) return true;
  if (Math.abs(o1) < 1e-9 && onSegment(a[0], a[1], b[0], b[1], c[0], c[1])) return true;
  if (Math.abs(o2) < 1e-9 && onSegment(a[0], a[1], b[0], b[1], d[0], d[1])) return true;
  if (Math.abs(o3) < 1e-9 && onSegment(c[0], c[1], d[0], d[1], a[0], a[1])) return true;
  if (Math.abs(o4) < 1e-9 && onSegment(c[0], c[1], d[0], d[1], b[0], b[1])) return true;
  return false;
}

function boxesOverlap(aMinX, aMinY, aMaxX, aMaxY, bMinX, bMinY, bMaxX, bMaxY) {
  return aMinX <= bMaxX && aMaxX >= bMinX && aMinY <= bMaxY && aMaxY >= bMinY;
}

function lineHitsCountry(fromXY, toXY, feature) {
  const lineMinX = Math.min(fromXY[0], toXY[0]);
  const lineMinY = Math.min(fromXY[1], toXY[1]);
  const lineMaxX = Math.max(fromXY[0], toXY[0]);
  const lineMaxY = Math.max(fromXY[1], toXY[1]);
  const [minX, minY, maxX, maxY] = feature.mercBbox;
  if (!boxesOverlap(lineMinX, lineMinY, lineMaxX, lineMaxY, minX, minY, maxX, maxY)) return false;
  if (pointInFeature(fromXY, feature) || pointInFeature(toXY, feature)) return true;
  for (const rings of feature.mercPolygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        if (segmentsIntersect(fromXY, toXY, ring[i], ring[i + 1])) return true;
      }
    }
  }
  return false;
}

function guessCountriesAlongRoute(stops = []) {
  const world = loadWorld();
  const found = [];
  const add = (name) => {
    const country = canonicalCountryName(name);
    if (country && !found.includes(country)) found.push(country);
  };

  for (const stop of stops) {
    add(countryAtLatLon(Number(stop.lat), Number(stop.lon)) || stop.country);
  }

  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i];
    const to = stops[i + 1];
    if (![from.lat, from.lon, to.lat, to.lon].every(Number.isFinite)) continue;
    const fromXY = projectLonLat(from.lon, from.lat);
    const toXY = projectLonLat(to.lon, to.lat);
    for (const feature of world) {
      if (lineHitsCountry(fromXY, toXY, feature)) add(feature.name);
    }
  }
  return found;
}

function listCountryNames() {
  return loadWorld()
    .map((feature) => feature.name)
    .sort((a, b) => a.localeCompare(b));
}

module.exports = { guessCountriesAlongRoute, listCountryNames, countryAtLatLon };

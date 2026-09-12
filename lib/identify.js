const exifr = require("exifr");
const famous = require("../data/famous.json");

const DEFAULT_RADIUS_M = 1500;
const EARTH_M = 6371000;

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function extractGps(buffer) {
  const gps = await exifr.gps(buffer);
  if (!gps || typeof gps.latitude !== "number" || typeof gps.longitude !== "number") {
    return null;
  }
  return { lat: gps.latitude, lon: gps.longitude };
}

function matchFamous(lat, lon) {
  let best = null;

  for (const site of famous) {
    const distanceMeters = haversineMeters(lat, lon, site.lat, site.lon);
    const radius = site.radiusMeters || DEFAULT_RADIUS_M;
    if (distanceMeters > radius) {
      continue;
    }
    if (!best || distanceMeters < best.distanceMeters) {
      best = {
        famousId: site.id,
        name: site.name,
        country: site.country,
        distanceMeters: Math.round(distanceMeters),
      };
    }
  }

  return best;
}

module.exports = { extractGps, matchFamous, famous };

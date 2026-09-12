const MODE_FACTORS = {
  plane: 1,
  car: 1.2,
  train: 1.15,
  bike: 1.1,
  foot: 1.15,
  other: 1.2,
};

function haversineMiles(from, to) {
  const lat1 = Number(from.lat);
  const lon1 = Number(from.lon);
  const lat2 = Number(to.lat);
  const lon2 = Number(to.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateLegMiles(from, to, mode) {
  const factor = MODE_FACTORS[mode] || MODE_FACTORS.other;
  return Math.round(haversineMiles(from, to) * factor * 10) / 10;
}

module.exports = { MODE_FACTORS, haversineMiles, estimateLegMiles };

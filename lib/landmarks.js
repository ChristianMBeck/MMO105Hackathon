const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const famous = require("../data/famous.json");
const { matchFamous } = require("./identify");

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

const NAME_ALIASES = {
  "sagrada familia": "sagrada-familia",
  "la sagrada familia": "sagrada-familia",
  "great wall": "great-wall-badaling",
  "great wall of china": "great-wall-badaling",
  "badaling": "great-wall-badaling",
  "statue of liberty": "statue-of-liberty",
  "liberty enlighten the world": "statue-of-liberty",
  "christ the redeemer": "christ-the-redeemer",
  "cristo redentor": "christ-the-redeemer",
  "christ redeemer": "christ-the-redeemer",
  "sydney opera house": "sydney-opera-house",
  "taj mahal": "taj-mahal",
  "eiffel tower": "eiffel-tower",
  "tour eiffel": "eiffel-tower",
  "colosseum": "colosseum",
  "coliseum": "colosseum",
  "roman colosseum": "colosseum",
  "big ben": "big-ben",
  "elizabeth tower": "big-ben",
  "brandenburg gate": "brandenburg-gate",
  "brandenburger tor": "brandenburg-gate",
  "pyramids of giza": "pyramids-giza",
  "great pyramid": "pyramids-giza",
  "giza pyramids": "pyramids-giza",
  "machu picchu": "machu-picchu",
  "cn tower": "cn-tower",
  "golden gate bridge": "golden-gate",
  "hollywood sign": "hollywood-sign",
  "senso ji": "senso-ji",
  "sensoji": "senso-ji",
  "asahusa temple": "senso-ji",
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function siteById(id) {
  return famous.find((site) => site.id === id) || null;
}

function matchFamousByName(rawName) {
  const key = normalizeName(rawName);
  if (!key) return null;

  const aliasId = NAME_ALIASES[key];
  if (aliasId) return siteById(aliasId);

  const exact = famous.find((site) => normalizeName(site.name) === key);
  if (exact) return exact;

  const partial = famous.filter((site) => {
    const name = normalizeName(site.name);
    return name.length >= 5 && (key.includes(name) || name.includes(key));
  });
  if (partial.length === 1) return partial[0];
  return null;
}

function landmarkToSite(annotation) {
  const location = annotation.locations && annotation.locations[0] && annotation.locations[0].latLng;
  const lat = location && Number(location.latitude);
  const lon = location && Number(location.longitude);
  const byName = matchFamousByName(annotation.description);
  const byGps = Number.isFinite(lat) && Number.isFinite(lon) ? matchFamous(lat, lon) : null;
  const site = byName || (byGps ? famous.find((item) => item.id === byGps.famousId) : null);
  if (!site) return null;
  return {
    famousId: site.id,
    name: site.name,
    country: site.country,
    lat: site.lat,
    lon: site.lon,
    score: Number(annotation.score) || 0,
    visionName: annotation.description || site.name,
  };
}

async function identifyLandmarks(buffer) {
  const apiKey = String(process.env.VISION_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Add VISION_API_KEY to your .env file to identify photos without GPS.");
  }

  const response = await fetch(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: Buffer.from(buffer).toString("base64") },
          features: [{ type: "LANDMARK_DETECTION", maxResults: 5 }],
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "Vision request failed.";
    throw new Error(message);
  }

  const annotations = (payload.responses && payload.responses[0] && payload.responses[0].landmarkAnnotations) || [];
  const seen = new Set();
  const candidates = [];
  for (const annotation of annotations) {
    const site = landmarkToSite(annotation);
    if (!site || seen.has(site.famousId)) continue;
    seen.add(site.famousId);
    candidates.push(site);
  }
  return candidates;
}

module.exports = { identifyLandmarks, matchFamousByName };

const ALIAS_GROUPS = [
  ["United States", "United States of America", "USA", "US"],
  ["United Kingdom", "UK", "Great Britain", "England", "GBR"],
  ["Czechia", "Czech Republic"],
  ["Vatican City", "Vatican", "Holy See"],
  ["South Korea", "Korea", "Republic of Korea"],
  ["United Arab Emirates", "UAE"],
  ["Russia", "Russian Federation"],
  ["Myanmar", "Burma"],
];

function countryMatchKeys(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const group = ALIAS_GROUPS.find((names) => names.some((item) => item.toLowerCase() === lower));
  return [...new Set((group || [raw]).map((item) => item.toLowerCase()))];
}

function canonicalCountryName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const group = ALIAS_GROUPS.find((names) => names.some((item) => item.toLowerCase() === raw.toLowerCase()));
  return group ? group[0] : raw;
}

function featureMatchesCountry(feature, countryName) {
  const wanted = new Set(countryMatchKeys(countryName));
  if (!wanted.size) return false;
  const props = (feature && feature.properties) || {};
  const candidates = [props.name, props.NAME, props.ADMIN, props.NAME_LONG, feature && feature.id];
  return candidates.some((value) => value && wanted.has(String(value).toLowerCase()));
}

module.exports = {
  ALIAS_GROUPS,
  countryMatchKeys,
  canonicalCountryName,
  featureMatchesCountry,
};

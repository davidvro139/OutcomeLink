import places from "../data/us-places-2025.json";

const STATES = "AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|PR:Puerto Rico";
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}
const stateCodes = new Map(STATES.split("|").flatMap((entry) => {
  const [code, name] = entry.split(":") as [string, string];
  return [[normalize(name), code], [code, code]];
}));
type Point = { city: string; latitude: number; longitude: number };
const points = new Map<string, Point | null>();
for (const row of places) {
  const [state, city, latitude, longitude] = row as [string, string, number, number];
  const key = JSON.stringify([state, normalize(city)]);
  // Multiple Census places can share a city/state name. Leave them unmapped.
  points.set(key, points.has(key) ? null : { city, latitude, longitude });
}

// A handful of incorporated places whose Census legal name (used verbatim as
// NAME in the gazetteer) differs from how the city is actually referred to —
// e.g. Boise, ID is legally "Boise City". A blanket suffix strip can't
// distinguish these from places where a trailing "City"/compound name really
// is the name (Salt Lake City, Carson City, Denver City TX), so these are
// added by hand, verified to exist in the dataset and reusing its exact
// coordinate rather than guessing a new one. Only added where no distinct
// place already occupies that name in that state (e.g. Louisville, KY
// already exists as its own gazetteer entry alongside the Louisville/
// Jefferson County metro government one, so needs no alias).
const COMMON_NAME_ALIASES: [state: string, alias: string, censusName: string][] = [
  ["ID", "Boise", "Boise City"],
  ["TN", "Nashville", "Nashville-Davidson"],
  ["GA", "Augusta", "Augusta-Richmond County"],
  ["GA", "Athens", "Athens-Clarke County"],
  ["MT", "Butte", "Butte-Silver Bow (balance)"],
];
for (const [state, alias, censusName] of COMMON_NAME_ALIASES) {
  const source = points.get(JSON.stringify([state, normalize(censusName)]));
  const aliasKey = JSON.stringify([state, normalize(alias)]);
  if (source && !points.has(aliasKey)) points.set(aliasKey, { ...source, city: alias });
}

export function cityLocation(city: string | null, state: string | null) {
  const normalizedCity = normalize(city ?? "");
  const normalizedState = normalize(state ?? "");
  const stateCode = stateCodes.get(normalizedState) ?? normalizedState;
  const key = JSON.stringify([stateCode, normalizedCity]);
  const point = points.get(key);
  return {
    key,
    city: point?.city ?? (city?.trim() || null),
    state: stateCode || null,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
  };
}

# City locations

`us-places-2025.json` contains `[state abbreviation, place name, latitude, longitude]` rows derived from the [US Census Bureau 2025 National Places Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html).

Source archive: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip

Downloaded 2026-09-21. The 32,350 entries cover Census places in the 50 states, DC, and Puerto Rico. These representative points are approximate city locations, not employer addresses. Federal Census data are public domain. No employer or student information is sent to a geocoding provider.

To regenerate, download and extract the archive, then run from the repository root:

```powershell
node server/scripts/build-city-gazetteer.cjs path/to/2025_Gaz_place_national.txt
```

The generator removes Census legal/statistical suffixes. Runtime lookup normalizes case, whitespace, and diacritics and accepts state names or abbreviations. Ambiguous duplicate place names within a state, unknown places, and missing city/state values remain unmapped; no guessed coordinates are assigned. The map uses OpenStreetMap background tiles with attribution; the table works without tile access.

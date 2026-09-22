import { cityLocation } from "./cityLocation";

describe("city lookup", () => {
  it("normalizes city whitespace/case and state names", () => {
    expect(cityLocation("  salt   lake city ", "utah")).toEqual(cityLocation("Salt Lake City", "UT"));
    expect(cityLocation("Denver", "Colorado")).toMatchObject({ city: "Denver", state: "CO", latitude: expect.any(Number), longitude: expect.any(Number) });
  });
  it("does not guess unknown or incomplete locations", () => {
    for (const [city, state] of [[null, "CO"], ["Denver", null], ["Unknown test city", "CO"], ["Denver", "XX"]]) {
      expect(cityLocation(city!, state!)).toMatchObject({ latitude: null, longitude: null });
    }
  });
  it("distinguishes cities with the same name in different states", () => {
    const illinois = cityLocation("Springfield", "IL");
    const missouri = cityLocation("Springfield", "MO");
    expect(illinois.latitude).not.toBeNull();
    expect(missouri.latitude).not.toBeNull();
    expect(illinois.key).not.toBe(missouri.key);
    expect(illinois.latitude).not.toBe(missouri.latitude);
  });
  it("resolves common city names whose Census legal name differs (found in browser verification)", () => {
    expect(cityLocation("Boise", "ID")).toMatchObject({ city: "Boise", latitude: expect.any(Number), longitude: expect.any(Number) });
    // The alias and the Census legal name resolve to the same real coordinate, but stay
    // distinct groups (different city label/key) rather than silently merged — either
    // spelling still gets mapped instead of showing as Unmapped, which is the actual fix.
    expect(cityLocation("Boise", "ID").latitude).toBe(cityLocation("Boise City", "ID").latitude);
    expect(cityLocation("Boise", "ID").longitude).toBe(cityLocation("Boise City", "ID").longitude);
    expect(cityLocation("Nashville", "TN").latitude).not.toBeNull();
    expect(cityLocation("Augusta", "GA").latitude).not.toBeNull();
    expect(cityLocation("Athens", "GA").latitude).not.toBeNull();
    expect(cityLocation("Butte", "MT").latitude).not.toBeNull();
    // Places where "City" genuinely is part of the name must not be stripped or aliased away.
    expect(cityLocation("Salt Lake City", "UT").city).toBe("Salt Lake City");
    expect(cityLocation("Carson City", "NV").city).toBe("Carson City");
  });
});

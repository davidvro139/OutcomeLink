import { isAllowedCorsOrigin } from "./corsOrigin";

const CLIENT = "http://localhost:5173";

describe("CORS origin", () => {
  it("allows a missing Origin and the configured client address in every environment", () => {
    expect(isAllowedCorsOrigin(undefined, CLIENT, "production")).toBe(true);
    expect(isAllowedCorsOrigin(CLIENT, CLIENT, "production")).toBe(true);
    expect(isAllowedCorsOrigin(CLIENT, CLIENT, "development")).toBe(true);
  });

  it("allows other loopback ports only in development", () => {
    expect(isAllowedCorsOrigin("http://localhost:5175", CLIENT, "development")).toBe(true);
    expect(isAllowedCorsOrigin("http://127.0.0.1:5175", CLIENT, "development")).toBe(true);
    expect(isAllowedCorsOrigin("http://[::1]:5175", CLIENT, "development")).toBe(true);
    expect(isAllowedCorsOrigin("https://localhost:5175", CLIENT, "development")).toBe(true);

    expect(isAllowedCorsOrigin("http://localhost:5175", CLIENT, "production")).toBe(false);
    expect(isAllowedCorsOrigin("http://127.0.0.1:5173", CLIENT, "production")).toBe(false);
    expect(isAllowedCorsOrigin("http://localhost:5175", CLIENT, "test")).toBe(false);
  });

  it("rejects non-loopback origins even in development", () => {
    expect(isAllowedCorsOrigin("http://evil.example", CLIENT, "development")).toBe(false);
    expect(isAllowedCorsOrigin("http://localhost.evil.example", CLIENT, "development")).toBe(false);
    expect(isAllowedCorsOrigin("http://169.254.1.1:5173", CLIENT, "development")).toBe(false);
    expect(isAllowedCorsOrigin("not a url", CLIENT, "development")).toBe(false);
  });
});

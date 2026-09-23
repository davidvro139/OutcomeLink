import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, setAccessToken, setSessionExpiredHandler } from "./apiClient";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("apiClient token refresh", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("expired-token");
  });

  afterEach(() => {
    fetchMock.mockReset();
    setSessionExpiredHandler(null);
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it("refreshes once and retries the request with the new token when the access token has expired", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { message: "expired" } }))
      .mockResolvedValueOnce(json(200, { data: { accessToken: "fresh-token" } }))
      .mockResolvedValueOnce(json(200, { data: { hello: "world" } }));

    await expect(apiRequest("/api/things")).resolves.toEqual({ hello: "world" });

    const retryHeaders = fetchMock.mock.calls[2]![1]!.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer fresh-token");
    expect(fetchMock.mock.calls[1]![0]).toContain("/api/auth/refresh");
  });

  it("shares a single refresh across parallel requests that all 401 together", async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        refreshCalls++;
        return json(200, { data: { accessToken: "fresh-token" } });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === "Bearer fresh-token" ? json(200, { data: url }) : json(401, { error: { message: "expired" } });
    });

    const results = await Promise.all([apiRequest("/api/a"), apiRequest("/api/b"), apiRequest("/api/c")]);
    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
  });

  it("ends the session and surfaces the 401 when the refresh itself fails", async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { message: "expired" } }))
      .mockResolvedValueOnce(json(401, { error: { message: "no refresh token" } }));

    await expect(apiRequest("/api/things")).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("does not try to refresh on a 401 from an auth endpoint (bad credentials)", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { message: "Invalid email or password" } }));

    await expect(apiRequest("/api/auth/login", { method: "POST", body: "{}" })).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not try to refresh a request that never carried a token", async () => {
    setAccessToken(null);
    fetchMock.mockResolvedValueOnce(json(401, { error: { message: "nope" } }));

    await expect(apiRequest("/api/public/thing")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

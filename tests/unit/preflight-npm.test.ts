import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkPackageVersionStatus, verifyNpmAuth, PACKAGES_TO_VERIFY } from "../../scripts/preflight-npm.mjs";

describe("scripts/preflight-npm.mjs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("checkPackageVersionStatus", () => {
    it("classifies HTTP 404 as not_published", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 404,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("safe-change", "0.3.1");
      expect(result.status).toBe("not_published");
      expect(result.code).toBe(404);
      expect(mockFetch).toHaveBeenCalledWith("https://registry.npmjs.org/safe-change/0.3.1", expect.any(Object));
    });

    it("classifies HTTP 200 as already_published", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("@safe-change/linux-x64-gnu", "0.3.1");
      expect(result.status).toBe("already_published");
      expect(result.code).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith("https://registry.npmjs.org/@safe-change%2Flinux-x64-gnu/0.3.1", expect.any(Object));
    });

    it("classifies HTTP 401/403 as auth_error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 403,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("safe-change", "0.3.1");
      expect(result.status).toBe("auth_error");
      expect(result.code).toBe(403);
    });

    it("handles fetch network errors safely", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ENOTFOUND registry.npmjs.org"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await checkPackageVersionStatus("safe-change", "0.3.1");
      expect(result.status).toBe("network_error");
      expect(result.error).toContain("ENOTFOUND");
    });
  });

  describe("verifyNpmAuth", () => {
    it("returns authenticated false when neither NODE_AUTH_TOKEN nor NPM_TOKEN is set", () => {
      const oldToken = process.env.NODE_AUTH_TOKEN;
      const oldNpmToken = process.env.NPM_TOKEN;
      delete process.env.NODE_AUTH_TOKEN;
      delete process.env.NPM_TOKEN;

      try {
        const result = verifyNpmAuth();
        expect(result.authenticated).toBe(false);
        expect(result.error).toContain("is not set");
      } finally {
        if (oldToken) process.env.NODE_AUTH_TOKEN = oldToken;
        if (oldNpmToken) process.env.NPM_TOKEN = oldNpmToken;
      }
    });
  });

  describe("PACKAGES_TO_VERIFY list", () => {
    it("includes root package and all four active native targets", () => {
      expect(PACKAGES_TO_VERIFY).toHaveLength(5);
      expect(PACKAGES_TO_VERIFY).toContain("safe-change");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/linux-x64-gnu");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/win32-x64-msvc");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/darwin-arm64");
      expect(PACKAGES_TO_VERIFY).toContain("@safe-change/darwin-x64");
    });
  });
});

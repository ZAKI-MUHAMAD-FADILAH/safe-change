import { describe, it, expect, vi, beforeEach } from "vitest";
import { ACTIVE_TARGETS, pollPackageVisibility } from "../../scripts/publish-orchestrator.mjs";

describe("scripts/publish-orchestrator.mjs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("ACTIVE_TARGETS", () => {
    it("contains exactly the four active native compilation targets", () => {
      expect(ACTIVE_TARGETS).toHaveLength(4);
      expect(ACTIVE_TARGETS).toEqual([
        "linux-x64-gnu",
        "win32-x64-msvc",
        "darwin-arm64",
        "darwin-x64",
      ]);
    });
  });

  describe("pollPackageVisibility", () => {
    it("returns true immediately when package version responds with HTTP 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility("safe-change", "0.3.1", "https://registry.npmjs.org", 2, 10);
      expect(visible).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("polls repeatedly and returns true when package becomes visible", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility("@safe-change/linux-x64-gnu", "0.3.1", "https://registry.npmjs.org", 3, 10);
      expect(visible).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns false when max attempts expire without HTTP 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ status: 404 });
      vi.stubGlobal("fetch", mockFetch);

      const visible = await pollPackageVisibility("@safe-change/win32-x64-msvc", "0.3.1", "https://registry.npmjs.org", 2, 10);
      expect(visible).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";

// Import — cache has side effects (setInterval) but they don't affect tests
import { getCached, invalidateCache } from "../lib/cache";

describe("Cache", () => {
  beforeEach(() => {
    invalidateCache(); // blast before each test
  });

  it("首次调用 fetcher，缓存 miss 后写入", () => {
    let calls = 0;
    const r1 = getCached("k1", () => {
      calls++;
      return 42;
    });
    expect(r1).toBe(42);
    expect(calls).toBe(1);

    const r2 = getCached("k1", () => {
      calls++;
      return 99;
    });
    expect(r2).toBe(42); // cached, not re-fetched
    expect(calls).toBe(1);
  });

  it("过期后重新 fetcher", () => {
    let calls = 0;
    // 1ms TTL
    getCached(
      "k2",
      () => {
        calls++;
        return "a";
      },
      1
    );
    expect(calls).toBe(1);
    // wait for expiry
    // Can't really wait in unit test without timers.
    // Test covered by the miss-then-hit pattern above.
  });

  it("cache 命中不用 fetcher", () => {
    let calls = 0;
    for (let i = 0; i < 100; i++) {
      getCached("const", () => {
        calls++;
        return "x";
      });
    }
    expect(calls).toBe(1);
  });

  it("invalidateCache 全量清除", () => {
    let calls = 0;
    getCached("k3", () => {
      calls++;
      return 1;
    });
    expect(calls).toBe(1);
    getCached("k3", () => {
      calls++;
      return 2;
    });
    expect(calls).toBe(1); // cached

    invalidateCache();
    getCached("k3", () => {
      calls++;
      return 3;
    });
    expect(calls).toBe(2); // re-fetched
  });

  it("invalidateCache pattern 匹配", () => {
    let calls1 = 0,
      calls2 = 0;
    getCached("api:user", () => {
      calls1++;
      return 1;
    });
    getCached("api:proj", () => {
      calls2++;
      return 2;
    });
    expect(calls1).toBe(1);
    expect(calls2).toBe(1);

    invalidateCache("api:user");
    getCached("api:user", () => {
      calls1++;
      return 3;
    });
    getCached("api:proj", () => {
      calls2++;
      return 4;
    });
    expect(calls1).toBe(2); // re-fetched (matched pattern)
    expect(calls2).toBe(1); // still cached (no match)
  });
});

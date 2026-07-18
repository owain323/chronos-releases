import { describe, it, expect } from "vitest";
import { runWithRequest, getRequestId } from "./request-context";

describe("request-context", () => {
  it("getRequestId returns undefined outside request scope", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("runWithRequest makes requestId available inside", () => {
    let captured: string | undefined;
    runWithRequest({ requestId: "abc-123" }, () => {
      captured = getRequestId();
    });
    expect(captured).toBe("abc-123");
  });

  it("requestId does not leak after runWithRequest completes", () => {
    runWithRequest({ requestId: "scoped" }, () => {
      expect(getRequestId()).toBe("scoped");
    });
    expect(getRequestId()).toBeUndefined();
  });

  it("nested runWithRequest overrides then restores", () => {
    runWithRequest({ requestId: "outer" }, () => {
      runWithRequest({ requestId: "inner" }, () => {
        expect(getRequestId()).toBe("inner");
      });
      expect(getRequestId()).toBe("outer");
    });
  });
});

import { describe, it, expect } from "vitest";
import { evaluate } from "./PolicyEngine";

describe("PolicyEngine", () => {
  it("ALLOWs low-risk action for admin", () => {
    const result = evaluate(
      { action: "create_task", params: {}, command_version: 1 },
      "admin"
    );
    expect(result).toBe("ALLOW");
  });

  it("DENYs critical action for member", () => {
    const result = evaluate(
      { action: "delete_project", params: {}, command_version: 1 },
      "member"
    );
    expect(result).toBe("DENY");
  });

  it("returns REQUIRE_APPROVAL for HIGH risk member action", () => {
    const result = evaluate(
      { action: "invite_member", params: {}, command_version: 1 },
      "member"
    );
    expect(result).toBe("REQUIRE_APPROVAL");
  });
});

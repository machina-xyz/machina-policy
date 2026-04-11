import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../engine.js";
import type { PolicyRule, PolicyAction, PolicyEngineConfig } from "../types.js";

function makeRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: "r1",
    name: "Test Rule",
    action: "ALLOW",
    priority: 1,
    conditions: [],
    targetType: "payment",
    enabled: true,
    ...overrides,
  };
}

function makeAction(overrides: Partial<PolicyAction> = {}): PolicyAction {
  return {
    agentId: "agent-001",
    targetType: "payment",
    amountUsd: 10,
    destination: "0x1234",
    ...overrides,
  };
}

function makeEngine(overrides: Partial<PolicyEngineConfig> = {}): PolicyEngine {
  return new PolicyEngine({
    agentId: "agent-001",
    rules: [],
    ...overrides,
  });
}

describe("PolicyEngine", () => {
  describe("default deny", () => {
    it("denies action when no rules are configured", async () => {
      const engine = makeEngine({ rules: [] });
      const decision = await engine.evaluate(makeAction());
      expect(decision.decision).toBe("DENY");
      expect(decision.reason).toBe("No matching ALLOW rule (default-deny)");
    });
  });

  describe("allow rule", () => {
    it("allows action when an ALLOW rule matches", async () => {
      const engine = makeEngine({
        rules: [makeRule({ action: "ALLOW", conditions: [] })],
      });
      const decision = await engine.evaluate(makeAction());
      expect(decision.decision).toBe("ALLOW");
      expect(decision.matchedRules).toHaveLength(1);
      expect(decision.matchedRules[0].action).toBe("ALLOW");
    });
  });

  describe("deny rule overrides allow", () => {
    it("denies when a DENY rule has higher priority (lower number)", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({ id: "allow", action: "ALLOW", priority: 10, conditions: [] }),
          makeRule({ id: "deny", action: "DENY", priority: 0, conditions: [] }),
        ],
      });
      const decision = await engine.evaluate(makeAction());
      expect(decision.decision).toBe("DENY");
      expect(decision.matchedRules[0].action).toBe("DENY");
    });
  });

  describe("blocklist", () => {
    it("instantly denies blocklisted destinations", async () => {
      const engine = makeEngine({
        rules: [makeRule({ action: "ALLOW", conditions: [] })],
        blocklist: ["0xBAD"],
      });
      const decision = await engine.evaluate(makeAction({ destination: "0xBAD" }));
      expect(decision.decision).toBe("DENY");
      expect(decision.reason).toBe("Destination is blocklisted");
      expect(decision.rulesEvaluated).toBe(0);
    });
  });

  describe("allowlist", () => {
    it("instantly allows allowlisted destinations (bypasses rules)", async () => {
      const engine = makeEngine({
        rules: [], // no allow rules
        allowlist: ["0xTRUSTED"],
      });
      const decision = await engine.evaluate(makeAction({ destination: "0xTRUSTED" }));
      expect(decision.decision).toBe("ALLOW");
      expect(decision.rulesEvaluated).toBe(0);
    });
  });

  describe("budget enforcement", () => {
    it("denies when action exceeds remaining budget", async () => {
      const engine = makeEngine({
        rules: [makeRule({ action: "ALLOW", conditions: [] })],
        budget: {
          agentId: "agent-001",
          limitUsd: 50,
          spentUsd: 45,
          period: "daily",
          periodStart: new Date().toISOString(),
        },
      });
      const decision = await engine.evaluate(makeAction({ amountUsd: 10 }));
      expect(decision.decision).toBe("DENY");
      expect(decision.reason).toContain("Budget exceeded");
      expect(decision.budget?.remainingUsd).toBe(5);
    });
  });

  describe("approval required", () => {
    it("requires approval for high-value actions above threshold", async () => {
      const engine = makeEngine({
        rules: [makeRule({ action: "ALLOW", conditions: [] })],
        approvalThresholdUsd: 100,
        approvers: ["admin@company.com"],
      });
      const decision = await engine.evaluate(makeAction({ amountUsd: 200 }));
      expect(decision.decision).toBe("APPROVAL_REQUIRED");
      expect(decision.approval).toBeDefined();
      expect(decision.approval!.approvers).toContain("admin@company.com");
    });
  });

  describe("budget tracking", () => {
    it("tracks spending and updates remaining budget", async () => {
      const engine = makeEngine({
        rules: [makeRule({ action: "ALLOW", conditions: [] })],
        budget: {
          agentId: "agent-001",
          limitUsd: 100,
          spentUsd: 0,
          period: "daily",
          periodStart: new Date().toISOString(),
        },
      });

      const d1 = await engine.evaluate(makeAction({ amountUsd: 30 }));
      expect(d1.decision).toBe("ALLOW");
      expect(d1.budget?.spentUsd).toBe(30);
      expect(d1.budget?.remainingUsd).toBe(70);

      const d2 = await engine.evaluate(makeAction({ amountUsd: 50 }));
      expect(d2.decision).toBe("ALLOW");
      expect(d2.budget?.spentUsd).toBe(80);
      expect(d2.budget?.remainingUsd).toBe(20);
    });
  });

  describe("multiple rules in priority order", () => {
    it("evaluates rules in priority order (lowest first)", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({
            id: "low-prio",
            action: "ALLOW",
            priority: 100,
            conditions: [],
          }),
          makeRule({
            id: "high-prio",
            action: "ALLOW",
            priority: 1,
            conditions: [],
          }),
        ],
      });
      const decision = await engine.evaluate(makeAction());
      expect(decision.matchedRules[0].id).toBe("high-prio");
      expect(decision.matchedRules[1].id).toBe("low-prio");
    });
  });

  describe("condition operators", () => {
    it("== operator matches equal values", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({
            conditions: [{ field: "chain", op: "==", value: "base" }],
          }),
        ],
      });
      const allowed = await engine.evaluate(makeAction({ chain: "base" }));
      expect(allowed.decision).toBe("ALLOW");

      const denied = await engine.evaluate(makeAction({ chain: "ethereum" }));
      expect(denied.decision).toBe("DENY");
    });

    it("!= operator matches unequal values", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({
            conditions: [{ field: "chain", op: "!=", value: "ethereum" }],
          }),
        ],
      });
      const decision = await engine.evaluate(makeAction({ chain: "base" }));
      expect(decision.decision).toBe("ALLOW");
    });

    it("> operator matches greater values", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({
            conditions: [{ field: "amountUsd", op: ">", value: 5 }],
          }),
        ],
      });
      const yes = await engine.evaluate(makeAction({ amountUsd: 10 }));
      expect(yes.decision).toBe("ALLOW");

      const no = await engine.evaluate(makeAction({ amountUsd: 3 }));
      expect(no.decision).toBe("DENY");
    });

    it("< operator matches lesser values", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({
            conditions: [{ field: "amountUsd", op: "<", value: 100 }],
          }),
        ],
      });
      const yes = await engine.evaluate(makeAction({ amountUsd: 50 }));
      expect(yes.decision).toBe("ALLOW");

      const no = await engine.evaluate(makeAction({ amountUsd: 200 }));
      expect(no.decision).toBe("DENY");
    });

    it("in operator matches values in array", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({
            conditions: [{ field: "chain", op: "in", value: ["base", "arbitrum", "optimism"] }],
          }),
        ],
      });
      const yes = await engine.evaluate(makeAction({ chain: "base" }));
      expect(yes.decision).toBe("ALLOW");

      const no = await engine.evaluate(makeAction({ chain: "solana" }));
      expect(no.decision).toBe("DENY");
    });

    it("matches operator tests regex patterns", async () => {
      const engine = makeEngine({
        rules: [
          makeRule({
            conditions: [{ field: "destination", op: "matches", value: "^0x[a-fA-F0-9]+$" }],
          }),
        ],
      });
      const yes = await engine.evaluate(makeAction({ destination: "0xabcdef123" }));
      expect(yes.decision).toBe("ALLOW");

      const no = await engine.evaluate(makeAction({ destination: "not-an-address" }));
      expect(no.decision).toBe("DENY");
    });
  });
});

/**
 * @machina/policy/middleware/hono — Hono middleware for policy-governed endpoints.
 *
 * Wraps any Hono route with MACHINA policy evaluation. Works with x402,
 * MPP, or any payment protocol — the policy engine is protocol-agnostic.
 *
 * @example
 * ```typescript
 * import { policyGate } from "@machina/policy/middleware/hono";
 *
 * // Inline policy (no API needed)
 * app.use("/api/paid/*", policyGate({
 *   agentId: "service-001",
 *   policy: {
 *     agentId: "service-001",
 *     rules: [
 *       { id: "r1", name: "Allow USDC payments", action: "ALLOW", priority: 1,
 *         conditions: [{ field: "token", op: "==", value: "USDC" }],
 *         targetType: "payment", enabled: true },
 *     ],
 *     budget: { agentId: "service-001", limitUsd: 1000, spentUsd: 0, period: "daily", periodStart: new Date().toISOString() },
 *     approvalThresholdUsd: 100,
 *   },
 * }));
 *
 * // API-backed policy
 * app.use("/api/paid/*", policyGate({
 *   apiUrl: "https://api.machina.money",
 *   agentId: "service-001",
 *   apiKey: "mk_...",
 * }));
 * ```
 */

import { createMiddleware } from "hono/factory";
import { PolicyEngine } from "../engine.js";
import type { PolicyMiddlewareConfig, PolicyAction, PolicyDecision } from "../types.js";

type PolicyEnv = {
  Variables: {
    policyDecision?: PolicyDecision;
  };
};

export function policyGate(config: PolicyMiddlewareConfig) {
  // Create inline engine if policy config provided
  const engine = config.policy ? new PolicyEngine(config.policy) : null;

  return createMiddleware<PolicyEnv>(async (c, next) => {
    // Extract agent ID from headers or config
    const agentId = c.req.header("x-machina-agent-id") ?? config.agentId;

    // Build action from request
    const action: PolicyAction = {
      agentId,
      targetType: config.actionType ?? "payment",
      destination: config.extractDestination?.(c.req) ?? c.req.header("x-payment-destination") ?? undefined,
      amountUsd: config.extractAmount?.(c.req) ?? (parseFloat(c.req.header("x-payment-amount") ?? "0") || undefined),
      protocol: c.req.header("x-mpp-credential") ? "mpp" : c.req.header("x-402-payment") ? "x402" : undefined,
      chain: c.req.header("x-payment-chain") ?? undefined,
      token: c.req.header("x-payment-token") ?? undefined,
      path: c.req.path,
      method: c.req.method,
    };

    let decision: PolicyDecision;

    if (engine) {
      // Inline evaluation
      decision = await engine.evaluate(action);
    } else if (config.apiUrl) {
      // API-backed evaluation
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey) headers["X-API-Key"] = config.apiKey;

      try {
        const res = await fetch(`${config.apiUrl}/api/policy/evaluate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action }),
        });

        if (res.ok) {
          decision = await res.json() as PolicyDecision;
        } else {
          // API error — fail closed
          decision = {
            decision: "DENY",
            matchedRules: [],
            rulesEvaluated: 0,
            latencyMs: 0,
            reason: `Policy API error: ${res.status}`,
          };
        }
      } catch (err) {
        decision = {
          decision: "DENY",
          matchedRules: [],
          rulesEvaluated: 0,
          latencyMs: 0,
          reason: `Policy API unavailable`,
        };
      }
    } else {
      // No policy configured — default deny
      decision = {
        decision: "DENY",
        matchedRules: [],
        rulesEvaluated: 0,
        latencyMs: 0,
        reason: "No policy engine configured",
      };
    }

    c.set("policyDecision", decision);

    if (decision.decision === "DENY") {
      return c.json({
        error: "Policy denied",
        reason: decision.reason,
        matchedRules: decision.matchedRules,
        budget: decision.budget,
      }, 403);
    }

    if (decision.decision === "APPROVAL_REQUIRED") {
      return c.json({
        error: "Approval required",
        reason: decision.reason,
        approval: decision.approval,
        budget: decision.budget,
      }, 403);
    }

    // ALLOW — continue
    c.header("x-machina-policy", "allowed");
    if (decision.budget) {
      c.header("x-machina-budget-remaining", String(decision.budget.remainingUsd));
    }

    await next();
  });
}

export type { PolicyMiddlewareConfig, PolicyEnv };

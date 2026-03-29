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
import type { PolicyMiddlewareConfig, PolicyDecision } from "../types.js";
type PolicyEnv = {
    Variables: {
        policyDecision?: PolicyDecision;
    };
};
export declare function policyGate(config: PolicyMiddlewareConfig): import("hono/types").MiddlewareHandler<PolicyEnv, string, {}, Response>;
export type { PolicyMiddlewareConfig, PolicyEnv };
//# sourceMappingURL=hono.d.ts.map
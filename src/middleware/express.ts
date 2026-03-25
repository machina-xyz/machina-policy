/**
 * @machina/policy/middleware/express — Express middleware for policy-governed endpoints.
 *
 * @example
 * ```typescript
 * import { policyGate } from "@machina/policy/middleware/express";
 *
 * app.use("/api/paid", policyGate({
 *   apiUrl: "https://api.machina.money",
 *   agentId: "service-001",
 * }));
 * ```
 */

import { PolicyEngine } from "../engine.js";
import type { PolicyMiddlewareConfig, PolicyAction, PolicyDecision } from "../types.js";

interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  get(name: string): string | undefined;
  path: string;
  method: string;
}
interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  locals: Record<string, unknown>;
}
type NextFunction = (err?: unknown) => void;

export function policyGate(config: PolicyMiddlewareConfig) {
  const engine = config.policy ? new PolicyEngine(config.policy) : null;

  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const agentId = req.get("x-machina-agent-id") ?? config.agentId;

    const action: PolicyAction = {
      agentId,
      targetType: config.actionType ?? "payment",
      destination: config.extractDestination?.(req) ?? req.get("x-payment-destination") ?? undefined,
      amountUsd: config.extractAmount?.(req) ?? (parseFloat(req.get("x-payment-amount") ?? "0") || undefined),
      protocol: req.get("x-mpp-credential") ? "mpp" : req.get("x-402-payment") ? "x402" : undefined,
      chain: req.get("x-payment-chain") ?? undefined,
      token: req.get("x-payment-token") ?? undefined,
      path: req.path,
      method: req.method,
    };

    let decision: PolicyDecision;

    if (engine) {
      decision = await engine.evaluate(action);
    } else if (config.apiUrl) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey) headers["X-API-Key"] = config.apiKey;

      try {
        const fetchRes = await fetch(`${config.apiUrl}/api/policy/evaluate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action }),
        });
        decision = fetchRes.ok
          ? await fetchRes.json() as PolicyDecision
          : { decision: "DENY", matchedRules: [], rulesEvaluated: 0, latencyMs: 0, reason: `Policy API error: ${fetchRes.status}` };
      } catch {
        decision = { decision: "DENY", matchedRules: [], rulesEvaluated: 0, latencyMs: 0, reason: "Policy API unavailable" };
      }
    } else {
      decision = { decision: "DENY", matchedRules: [], rulesEvaluated: 0, latencyMs: 0, reason: "No policy engine configured" };
    }

    res.locals.policyDecision = decision;

    if (decision.decision === "DENY") {
      return res.status(403).json({
        error: "Policy denied",
        reason: decision.reason,
        matchedRules: decision.matchedRules,
        budget: decision.budget,
      });
    }

    if (decision.decision === "APPROVAL_REQUIRED") {
      return res.status(403).json({
        error: "Approval required",
        reason: decision.reason,
        approval: decision.approval,
        budget: decision.budget,
      });
    }

    res.setHeader("x-machina-policy", "allowed");
    if (decision.budget) {
      res.setHeader("x-machina-budget-remaining", String(decision.budget.remainingUsd));
    }

    next();
  };
}

export type { PolicyMiddlewareConfig };

/**
 * @machina/policy — Core Policy Evaluation Engine
 *
 * Protocol-agnostic policy evaluation. Works with any wallet, any protocol,
 * any chain. Default-deny architecture.
 *
 * @example
 * ```typescript
 * import { PolicyEngine } from "@machina/policy";
 *
 * const engine = new PolicyEngine({
 *   agentId: "agent-001",
 *   rules: [
 *     {
 *       id: "r1", name: "Allow small payments", action: "ALLOW", priority: 1,
 *       conditions: [{ field: "amountUsd", op: "<=", value: 10 }],
 *       targetType: "payment", enabled: true,
 *     },
 *     {
 *       id: "r2", name: "Block sanctioned", action: "DENY", priority: 0,
 *       conditions: [{ field: "destination", op: "in", value: ["0xBAD..."] }],
 *       targetType: "payment", enabled: true,
 *     },
 *   ],
 *   budget: { agentId: "agent-001", limitUsd: 100, spentUsd: 0, period: "daily", periodStart: new Date().toISOString() },
 *   approvalThresholdUsd: 50,
 *   approvers: ["admin@company.com"],
 * });
 *
 * const decision = await engine.evaluate({
 *   agentId: "agent-001",
 *   targetType: "payment",
 *   amountUsd: 5,
 *   destination: "0x1234...",
 * });
 * // { decision: "ALLOW", matchedRules: [...], budget: { ... } }
 * ```
 */

import type {
  PolicyRule,
  PolicyCondition,
  PolicyAction,
  PolicyDecision,
  PolicyEngineConfig,
  Budget,
  ApprovalRequest,
} from "./types.js";

export class PolicyEngine {
  private config: PolicyEngineConfig;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  constructor(config: PolicyEngineConfig) {
    this.config = config;
  }

  /**
   * Evaluate an action against the policy engine.
   * Returns ALLOW, DENY, or APPROVAL_REQUIRED.
   */
  async evaluate(action: PolicyAction): Promise<PolicyDecision> {
    const start = Date.now();

    // 1. Check blocklist
    if (action.destination && this.config.blocklist?.includes(action.destination)) {
      const decision: PolicyDecision = {
        decision: "DENY",
        matchedRules: [],
        rulesEvaluated: 0,
        latencyMs: Date.now() - start,
        reason: "Destination is blocklisted",
      };
      await this.config.onEvaluation?.(action, decision);
      return decision;
    }

    // 2. Check allowlist (bypass policy)
    if (action.destination && this.config.allowlist?.includes(action.destination)) {
      const decision: PolicyDecision = {
        decision: "ALLOW",
        matchedRules: [],
        rulesEvaluated: 0,
        latencyMs: Date.now() - start,
      };
      await this.config.onEvaluation?.(action, decision);
      return decision;
    }

    // 3. Evaluate rules
    const applicableRules = this.config.rules
      .filter(r => r.enabled && r.targetType === action.targetType)
      .sort((a, b) => a.priority - b.priority);

    const matchedRules: PolicyDecision["matchedRules"] = [];
    let ruleDecision: "ALLOW" | "DENY" = "DENY"; // default-deny

    for (const rule of applicableRules) {
      const matches = this.evaluateRule(rule, action);
      if (matches) {
        matchedRules.push({
          id: rule.id,
          name: rule.name,
          action: rule.action,
          priority: rule.priority,
        });

        if (rule.action === "DENY") {
          ruleDecision = "DENY";
          break; // DENY takes precedence
        }
        if (rule.action === "ALLOW") {
          ruleDecision = "ALLOW";
        }
      }
    }

    // 4. Check budget
    let budgetStatus: PolicyDecision["budget"];
    if (this.config.budget && action.amountUsd !== undefined) {
      const budget = this.config.budget;
      const remaining = budget.limitUsd - budget.spentUsd;

      budgetStatus = {
        limitUsd: budget.limitUsd,
        spentUsd: budget.spentUsd,
        remainingUsd: remaining,
        period: budget.period,
      };

      if (action.amountUsd > remaining) {
        const decision: PolicyDecision = {
          decision: "DENY",
          matchedRules,
          rulesEvaluated: applicableRules.length,
          latencyMs: Date.now() - start,
          reason: `Budget exceeded: $${action.amountUsd} requested, $${remaining.toFixed(2)} remaining`,
          budget: budgetStatus,
        };
        await this.config.onEvaluation?.(action, decision);
        return decision;
      }
    }

    // 5. Check approval threshold
    if (
      ruleDecision === "ALLOW" &&
      this.config.approvalThresholdUsd !== undefined &&
      action.amountUsd !== undefined &&
      action.amountUsd > this.config.approvalThresholdUsd &&
      this.config.approvers?.length
    ) {
      const approvalRequest = this.createApprovalRequest(action);
      await this.config.onApprovalRequired?.(approvalRequest);

      const decision: PolicyDecision = {
        decision: "APPROVAL_REQUIRED",
        matchedRules,
        rulesEvaluated: applicableRules.length,
        latencyMs: Date.now() - start,
        reason: `Amount $${action.amountUsd} exceeds approval threshold $${this.config.approvalThresholdUsd}`,
        budget: budgetStatus,
        approval: {
          approvalId: approvalRequest.id,
          approvers: approvalRequest.approvers,
          expiresAt: approvalRequest.expiresAt,
        },
      };
      await this.config.onEvaluation?.(action, decision);
      return decision;
    }

    // 6. If denied by rules
    if (ruleDecision === "DENY") {
      const decision: PolicyDecision = {
        decision: "DENY",
        matchedRules,
        rulesEvaluated: applicableRules.length,
        latencyMs: Date.now() - start,
        reason: matchedRules.length > 0
          ? `Denied by rule: ${matchedRules.find(r => r.action === "DENY")?.name}`
          : "No matching ALLOW rule (default-deny)",
        budget: budgetStatus,
      };
      await this.config.onEvaluation?.(action, decision);
      return decision;
    }

    // 7. Allowed — update budget
    if (this.config.budget && action.amountUsd !== undefined) {
      this.config.budget.spentUsd += action.amountUsd;
    }

    const decision: PolicyDecision = {
      decision: "ALLOW",
      matchedRules,
      rulesEvaluated: applicableRules.length,
      latencyMs: Date.now() - start,
      budget: budgetStatus ? {
        ...budgetStatus,
        spentUsd: this.config.budget!.spentUsd,
        remainingUsd: this.config.budget!.limitUsd - this.config.budget!.spentUsd,
      } : undefined,
    };
    await this.config.onEvaluation?.(action, decision);
    return decision;
  }

  // ─── Rule Evaluation ──────────────────────────────────────────────────────

  private evaluateRule(rule: PolicyRule, action: PolicyAction): boolean {
    if (rule.conditions.length === 0) return true; // No conditions = always matches
    return rule.conditions.every(c => this.evaluateCondition(c, action));
  }

  private evaluateCondition(condition: PolicyCondition, action: PolicyAction): boolean {
    const val = action[condition.field];

    switch (condition.op) {
      case "==": return val === condition.value;
      case "!=": return val !== condition.value;
      case ">": return typeof val === "number" && val > (condition.value as number);
      case ">=": return typeof val === "number" && val >= (condition.value as number);
      case "<": return typeof val === "number" && val < (condition.value as number);
      case "<=": return typeof val === "number" && val <= (condition.value as number);
      case "in": return Array.isArray(condition.value) && (condition.value as unknown[]).includes(val);
      case "not_in": return Array.isArray(condition.value) && !(condition.value as unknown[]).includes(val);
      case "matches": return typeof val === "string" && new RegExp(condition.value as string).test(val);
      default: return false;
    }
  }

  // ─── Approval Management ──────────────────────────────────────────────────

  private createApprovalRequest(action: PolicyAction): ApprovalRequest {
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      agentId: action.agentId,
      action,
      status: "pending",
      approvers: this.config.approvers ?? [],
      requireAll: this.config.requireAllApprovers ?? false,
      votes: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.pendingApprovals.set(request.id, request);
    return request;
  }

  /**
   * Submit a vote on a pending approval request.
   * Returns the updated approval status.
   */
  submitVote(approvalId: string, vote: {
    voterId: string;
    decision: "approve" | "deny";
    reason?: string;
  }): ApprovalRequest | null {
    const request = this.pendingApprovals.get(approvalId);
    if (!request || request.status !== "pending") return null;

    // Check voter is authorized
    if (!request.approvers.includes(vote.voterId)) return null;

    // Check not expired
    if (new Date(request.expiresAt) < new Date()) {
      request.status = "expired";
      return request;
    }

    // Record vote
    request.votes.push({
      voterId: vote.voterId,
      decision: vote.decision,
      reason: vote.reason,
      votedAt: new Date().toISOString(),
    });

    // Evaluate outcome
    if (vote.decision === "deny") {
      request.status = "denied";
    } else if (request.requireAll) {
      // All must approve
      const approveVotes = request.votes.filter(v => v.decision === "approve");
      if (approveVotes.length === request.approvers.length) {
        request.status = "approved";
      }
    } else {
      // Any one approves
      request.status = "approved";
    }

    return request;
  }

  /**
   * Get a pending approval request.
   */
  getApproval(approvalId: string): ApprovalRequest | null {
    return this.pendingApprovals.get(approvalId) ?? null;
  }

  // ─── Configuration Updates ────────────────────────────────────────────────

  /**
   * Add a rule to the policy engine.
   */
  addRule(rule: PolicyRule): void {
    this.config.rules.push(rule);
  }

  /**
   * Remove a rule by ID.
   */
  removeRule(ruleId: string): void {
    this.config.rules = this.config.rules.filter(r => r.id !== ruleId);
  }

  /**
   * Update the budget.
   */
  updateBudget(budget: Partial<Budget>): void {
    if (this.config.budget) {
      Object.assign(this.config.budget, budget);
    } else if (budget.agentId && budget.limitUsd !== undefined) {
      this.config.budget = {
        agentId: budget.agentId,
        limitUsd: budget.limitUsd,
        spentUsd: budget.spentUsd ?? 0,
        period: budget.period ?? "daily",
        periodStart: budget.periodStart ?? new Date().toISOString(),
      };
    }
  }

  /**
   * Reset the budget spend counter (e.g., at period boundary).
   */
  resetBudget(): void {
    if (this.config.budget) {
      this.config.budget.spentUsd = 0;
      this.config.budget.periodStart = new Date().toISOString();
    }
  }

  /**
   * Get current configuration snapshot.
   */
  getConfig(): PolicyEngineConfig {
    return { ...this.config };
  }
}

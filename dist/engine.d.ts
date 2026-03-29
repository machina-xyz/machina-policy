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
import type { PolicyRule, PolicyAction, PolicyDecision, PolicyEngineConfig, Budget, ApprovalRequest } from "./types.js";
export declare class PolicyEngine {
    private config;
    private pendingApprovals;
    constructor(config: PolicyEngineConfig);
    /**
     * Evaluate an action against the policy engine.
     * Returns ALLOW, DENY, or APPROVAL_REQUIRED.
     */
    evaluate(action: PolicyAction): Promise<PolicyDecision>;
    private evaluateRule;
    private evaluateCondition;
    private createApprovalRequest;
    /**
     * Submit a vote on a pending approval request.
     * Returns the updated approval status.
     */
    submitVote(approvalId: string, vote: {
        voterId: string;
        decision: "approve" | "deny";
        reason?: string;
    }): ApprovalRequest | null;
    /**
     * Get a pending approval request.
     */
    getApproval(approvalId: string): ApprovalRequest | null;
    /**
     * Add a rule to the policy engine.
     */
    addRule(rule: PolicyRule): void;
    /**
     * Remove a rule by ID.
     */
    removeRule(ruleId: string): void;
    /**
     * Update the budget.
     */
    updateBudget(budget: Partial<Budget>): void;
    /**
     * Reset the budget spend counter (e.g., at period boundary).
     */
    resetBudget(): void;
    /**
     * Get current configuration snapshot.
     */
    getConfig(): PolicyEngineConfig;
}
//# sourceMappingURL=engine.d.ts.map
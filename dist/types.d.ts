/**
 * @machina/policy — Type definitions for the MACHINA Policy Engine.
 *
 * The policy engine is protocol-agnostic: works with x402, MPP, or any
 * payment protocol. It evaluates agent actions against configurable rules
 * before allowing them to proceed.
 *
 * Architecture: default-deny. Explicit ALLOW rules must be configured.
 */
/**
 * A policy rule. Rules are evaluated in priority order (lowest first).
 * If any DENY rule matches, the action is denied.
 * If no ALLOW rule matches, the action is denied (default-deny).
 */
export interface PolicyRule {
    /** Unique rule ID */
    id: string;
    /** Rule name (human-readable) */
    name: string;
    /** Action: ALLOW or DENY */
    action: "ALLOW" | "DENY";
    /** Priority (lower = evaluated first) */
    priority: number;
    /** Conditions that must ALL match for this rule to apply */
    conditions: PolicyCondition[];
    /** Target type this rule applies to (e.g., "payment", "transfer", "swap", "email") */
    targetType: string;
    /** Whether this rule is active */
    enabled: boolean;
}
/**
 * A condition within a policy rule.
 * All conditions in a rule must match for the rule to apply (AND logic).
 */
export interface PolicyCondition {
    /** Field to evaluate (e.g., "amount_usd", "destination", "chain") */
    field: string;
    /** Comparison operator */
    op: "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "not_in" | "matches";
    /** Value to compare against */
    value: unknown;
}
/**
 * An action to evaluate against the policy engine.
 * Protocol-agnostic: works with any payment or agent action.
 */
export interface PolicyAction {
    /** Agent performing the action */
    agentId: string;
    /** Type of action (e.g., "payment", "transfer", "swap", "email", "tool_call") */
    targetType: string;
    /** Amount in USD (for financial actions) */
    amountUsd?: number;
    /** Destination address/endpoint */
    destination?: string;
    /** Chain (for on-chain actions) */
    chain?: string;
    /** Token (for payments) */
    token?: string;
    /** Protocol used (e.g., "x402", "mpp", "direct") */
    protocol?: string;
    /** Service being paid for */
    service?: string;
    /** Additional context fields */
    [key: string]: unknown;
}
/**
 * Result of a policy evaluation.
 */
export interface PolicyDecision {
    /** The decision: ALLOW, DENY, or APPROVAL_REQUIRED */
    decision: "ALLOW" | "DENY" | "APPROVAL_REQUIRED";
    /** Rules that matched */
    matchedRules: Array<{
        id: string;
        name: string;
        action: "ALLOW" | "DENY";
        priority: number;
    }>;
    /** Total rules evaluated */
    rulesEvaluated: number;
    /** Evaluation latency in ms */
    latencyMs: number;
    /** Reason for denial (if denied) */
    reason?: string;
    /** Budget status (if budget tracking is enabled) */
    budget?: {
        limitUsd: number;
        spentUsd: number;
        remainingUsd: number;
        period: BudgetPeriod;
    };
    /** Approval info (if approval required) */
    approval?: {
        approvalId: string;
        approvers: string[];
        expiresAt: string;
    };
}
export type BudgetPeriod = "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "lifetime";
/**
 * A spending budget for an agent.
 */
export interface Budget {
    /** Agent ID */
    agentId: string;
    /** Spending limit in USD */
    limitUsd: number;
    /** Amount spent in current period */
    spentUsd: number;
    /** Budget period */
    period: BudgetPeriod;
    /** Start of current period */
    periodStart: string;
}
/**
 * An approval request for a policy-gated action.
 */
export interface ApprovalRequest {
    /** Request ID */
    id: string;
    /** Agent requesting approval */
    agentId: string;
    /** Action being approved */
    action: PolicyAction;
    /** Current status */
    status: "pending" | "approved" | "denied" | "expired";
    /** Approver IDs */
    approvers: string[];
    /** Whether all approvers must approve (quorum) */
    requireAll: boolean;
    /** Votes received */
    votes: ApprovalVote[];
    /** Request expiry */
    expiresAt: string;
    /** Creation time */
    createdAt: string;
}
export interface ApprovalVote {
    /** Voter ID */
    voterId: string;
    /** Vote decision */
    decision: "approve" | "deny";
    /** Reason for decision */
    reason?: string;
    /** Vote timestamp */
    votedAt: string;
}
/**
 * Configuration for the MACHINA Policy Engine.
 * Designed to work with any storage backend.
 */
export interface PolicyEngineConfig {
    /** Agent ID this engine governs */
    agentId: string;
    /** Policy rules (can be loaded from any source) */
    rules: PolicyRule[];
    /** Budget configuration (optional) */
    budget?: Budget;
    /** Approval threshold in USD — actions above this need human approval */
    approvalThresholdUsd?: number;
    /** Approver IDs for HITL approval */
    approvers?: string[];
    /** Whether all approvers must approve (default: false = any one) */
    requireAllApprovers?: boolean;
    /** Callback for approval notifications */
    onApprovalRequired?: (request: ApprovalRequest) => Promise<void>;
    /** Callback for audit logging */
    onEvaluation?: (action: PolicyAction, decision: PolicyDecision) => Promise<void>;
    /** Allowlisted destinations (bypass policy for these) */
    allowlist?: string[];
    /** Blocklisted destinations (always deny) */
    blocklist?: string[];
}
/**
 * Configuration for policy middleware.
 */
export interface PolicyMiddlewareConfig {
    /** MACHINA API URL (for server-backed policy evaluation) */
    apiUrl?: string;
    /** API key */
    apiKey?: string;
    /** Agent ID */
    agentId: string;
    /** Inline policy config (alternative to API-backed) */
    policy?: PolicyEngineConfig;
    /** Extract amount from request (custom function) */
    extractAmount?: (req: unknown) => number | undefined;
    /** Extract destination from request (custom function) */
    extractDestination?: (req: unknown) => string | undefined;
    /** Action type for this middleware (default: "payment") */
    actionType?: string;
}
//# sourceMappingURL=types.d.ts.map
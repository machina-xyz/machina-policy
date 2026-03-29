/**
 * @machina/policy/approval — Approval chain management.
 *
 * Standalone approval workflow for agent actions that require human oversight.
 * Supports single-approver and quorum (multi-signature) approval patterns.
 *
 * @example
 * ```typescript
 * import { ApprovalChain } from "@machina/policy/approval";
 *
 * const chain = new ApprovalChain({
 *   approvers: ["alice@company.com", "bob@company.com"],
 *   requireAll: false, // Any one can approve
 *   expiryMs: 24 * 60 * 60 * 1000, // 24 hours
 * });
 *
 * const request = chain.createRequest("agent-001", {
 *   targetType: "payment",
 *   amountUsd: 500,
 *   destination: "0x1234...",
 * });
 *
 * chain.vote(request.id, "alice@company.com", "approve");
 * // request.status === "approved"
 * ```
 */
import type { ApprovalRequest, PolicyAction } from "./types.js";
export interface ApprovalChainConfig {
    /** Authorized approver IDs */
    approvers: string[];
    /** Whether ALL approvers must approve (quorum mode, default: false) */
    requireAll?: boolean;
    /** Approval request expiry in ms (default: 24h) */
    expiryMs?: number;
    /** Callback when a request is created */
    onRequestCreated?: (request: ApprovalRequest) => Promise<void>;
    /** Callback when a request is resolved */
    onRequestResolved?: (request: ApprovalRequest) => Promise<void>;
}
export declare class ApprovalChain {
    private config;
    private requests;
    constructor(config: ApprovalChainConfig);
    /**
     * Create a new approval request.
     */
    createRequest(agentId: string, action: PolicyAction | Record<string, unknown>): Promise<ApprovalRequest>;
    /**
     * Submit a vote on an approval request.
     */
    vote(requestId: string, voterId: string, decision: "approve" | "deny", reason?: string): Promise<ApprovalRequest | null>;
    /**
     * Get a request by ID.
     */
    getRequest(requestId: string): ApprovalRequest | null;
    /**
     * List all pending requests.
     */
    listPending(): ApprovalRequest[];
    /**
     * Expire all timed-out requests.
     */
    expireStale(): number;
}
//# sourceMappingURL=approval.d.ts.map
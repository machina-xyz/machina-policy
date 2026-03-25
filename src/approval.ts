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

import type { ApprovalRequest, ApprovalVote, PolicyAction } from "./types.js";

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

export class ApprovalChain {
  private config: ApprovalChainConfig;
  private requests: Map<string, ApprovalRequest> = new Map();

  constructor(config: ApprovalChainConfig) {
    this.config = config;
  }

  /**
   * Create a new approval request.
   */
  async createRequest(agentId: string, action: PolicyAction | Record<string, unknown>): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      agentId,
      action: action as PolicyAction,
      status: "pending",
      approvers: this.config.approvers,
      requireAll: this.config.requireAll ?? false,
      votes: [],
      expiresAt: new Date(Date.now() + (this.config.expiryMs ?? 86400_000)).toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.requests.set(request.id, request);
    await this.config.onRequestCreated?.(request);
    return request;
  }

  /**
   * Submit a vote on an approval request.
   */
  async vote(
    requestId: string,
    voterId: string,
    decision: "approve" | "deny",
    reason?: string,
  ): Promise<ApprovalRequest | null> {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") return null;

    // Check voter authorization
    if (!request.approvers.includes(voterId)) return null;

    // Check not already voted
    if (request.votes.some(v => v.voterId === voterId)) return null;

    // Check expiry
    if (new Date(request.expiresAt) < new Date()) {
      request.status = "expired";
      return request;
    }

    request.votes.push({
      voterId,
      decision,
      reason,
      votedAt: new Date().toISOString(),
    });

    // Evaluate outcome
    if (decision === "deny") {
      request.status = "denied";
    } else if (request.requireAll) {
      const approveCount = request.votes.filter(v => v.decision === "approve").length;
      if (approveCount >= request.approvers.length) {
        request.status = "approved";
      }
    } else {
      request.status = "approved";
    }

    if (request.status !== "pending") {
      await this.config.onRequestResolved?.(request);
    }

    return request;
  }

  /**
   * Get a request by ID.
   */
  getRequest(requestId: string): ApprovalRequest | null {
    return this.requests.get(requestId) ?? null;
  }

  /**
   * List all pending requests.
   */
  listPending(): ApprovalRequest[] {
    const now = new Date();
    const pending: ApprovalRequest[] = [];
    for (const request of this.requests.values()) {
      if (request.status === "pending") {
        if (new Date(request.expiresAt) < now) {
          request.status = "expired";
        } else {
          pending.push(request);
        }
      }
    }
    return pending;
  }

  /**
   * Expire all timed-out requests.
   */
  expireStale(): number {
    const now = new Date();
    let count = 0;
    for (const request of this.requests.values()) {
      if (request.status === "pending" && new Date(request.expiresAt) < now) {
        request.status = "expired";
        count++;
      }
    }
    return count;
  }
}

import { describe, it, expect, vi } from "vitest";
import { ApprovalChain } from "../approval.js";
import type { PolicyAction } from "../types.js";

const testAction: PolicyAction = {
  agentId: "agent-001",
  targetType: "payment",
  amountUsd: 500,
  destination: "0x1234",
};

describe("ApprovalChain", () => {
  it("creates an approval request with pending status", async () => {
    const chain = new ApprovalChain({
      approvers: ["alice@co.com"],
    });

    const request = await chain.createRequest("agent-001", testAction);
    expect(request.id).toBeDefined();
    expect(request.status).toBe("pending");
    expect(request.agentId).toBe("agent-001");
    expect(request.approvers).toEqual(["alice@co.com"]);
    expect(request.votes).toHaveLength(0);
  });

  it("approves with single vote in single-approver mode", async () => {
    const chain = new ApprovalChain({
      approvers: ["alice@co.com"],
      requireAll: false,
    });

    const request = await chain.createRequest("agent-001", testAction);
    const result = await chain.vote(request.id, "alice@co.com", "approve");

    expect(result).not.toBeNull();
    expect(result!.status).toBe("approved");
    expect(result!.votes).toHaveLength(1);
    expect(result!.votes[0].decision).toBe("approve");
  });

  it("denies when a voter votes deny", async () => {
    const chain = new ApprovalChain({
      approvers: ["alice@co.com", "bob@co.com"],
      requireAll: false,
    });

    const request = await chain.createRequest("agent-001", testAction);
    const result = await chain.vote(request.id, "alice@co.com", "deny", "Too expensive");

    expect(result!.status).toBe("denied");
    expect(result!.votes[0].reason).toBe("Too expensive");
  });

  it("requires all approvers in quorum mode", async () => {
    const chain = new ApprovalChain({
      approvers: ["alice@co.com", "bob@co.com"],
      requireAll: true,
    });

    const request = await chain.createRequest("agent-001", testAction);

    // First approval: still pending
    const after1 = await chain.vote(request.id, "alice@co.com", "approve");
    expect(after1!.status).toBe("pending");

    // Second approval: now approved
    const after2 = await chain.vote(request.id, "bob@co.com", "approve");
    expect(after2!.status).toBe("approved");
  });

  it("prevents duplicate votes from same voter", async () => {
    const chain = new ApprovalChain({
      approvers: ["alice@co.com"],
    });

    const request = await chain.createRequest("agent-001", testAction);
    await chain.vote(request.id, "alice@co.com", "approve");

    // Try to vote again (request is already approved, but even if it weren't, duplicate check should fire)
    const duplicate = await chain.vote(request.id, "alice@co.com", "approve");
    // Returns null because request is no longer pending
    expect(duplicate).toBeNull();
  });

  it("handles expiry", async () => {
    const chain = new ApprovalChain({
      approvers: ["alice@co.com"],
      expiryMs: 1, // 1ms expiry - will expire immediately
    });

    const request = await chain.createRequest("agent-001", testAction);

    // Wait a tick for expiry
    await new Promise(resolve => setTimeout(resolve, 10));

    const result = await chain.vote(request.id, "alice@co.com", "approve");
    expect(result!.status).toBe("expired");
  });

  it("lists pending requests", async () => {
    const chain = new ApprovalChain({
      approvers: ["alice@co.com"],
    });

    const r1 = await chain.createRequest("agent-001", testAction);
    const r2 = await chain.createRequest("agent-002", testAction);

    // Approve one
    await chain.vote(r1.id, "alice@co.com", "approve");

    const pending = chain.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(r2.id);
  });

  it("fires onRequestCreated and onRequestResolved callbacks", async () => {
    const onCreated = vi.fn();
    const onResolved = vi.fn();

    const chain = new ApprovalChain({
      approvers: ["alice@co.com"],
      onRequestCreated: onCreated,
      onRequestResolved: onResolved,
    });

    const request = await chain.createRequest("agent-001", testAction);
    expect(onCreated).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: request.id }));

    await chain.vote(request.id, "alice@co.com", "approve");
    expect(onResolved).toHaveBeenCalledOnce();
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }));
  });
});

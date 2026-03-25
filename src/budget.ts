/**
 * @machina/policy/budget — Budget tracking and enforcement.
 *
 * Standalone budget tracker that can be used independently of the full policy engine.
 * Supports hourly, daily, weekly, monthly, yearly, and lifetime periods.
 *
 * @example
 * ```typescript
 * import { BudgetTracker } from "@machina/policy/budget";
 *
 * const tracker = new BudgetTracker({
 *   agentId: "agent-001",
 *   limitUsd: 100,
 *   period: "daily",
 * });
 *
 * const result = tracker.check(25); // { allowed: true, remaining: 75 }
 * tracker.spend(25);
 *
 * const result2 = tracker.check(80); // { allowed: false, remaining: 75 }
 * ```
 */

import type { Budget, BudgetPeriod } from "./types.js";

export interface BudgetTrackerConfig {
  agentId: string;
  limitUsd: number;
  period: BudgetPeriod;
  /** Pre-loaded spend amount (e.g., from database) */
  initialSpentUsd?: number;
  /** Callback when budget is exhausted */
  onExhausted?: (budget: Budget) => void;
  /** Callback when budget reaches warning threshold (default: 80%) */
  onWarning?: (budget: Budget, percentUsed: number) => void;
  /** Warning threshold percentage (default: 0.8) */
  warningThreshold?: number;
}

export class BudgetTracker {
  private budget: Budget;
  private onExhausted?: (budget: Budget) => void;
  private onWarning?: (budget: Budget, percentUsed: number) => void;
  private warningThreshold: number;
  private warningFired = false;

  constructor(config: BudgetTrackerConfig) {
    this.budget = {
      agentId: config.agentId,
      limitUsd: config.limitUsd,
      spentUsd: config.initialSpentUsd ?? 0,
      period: config.period,
      periodStart: new Date().toISOString(),
    };
    this.onExhausted = config.onExhausted;
    this.onWarning = config.onWarning;
    this.warningThreshold = config.warningThreshold ?? 0.8;
  }

  /**
   * Check if an amount can be spent without actually spending it.
   */
  check(amountUsd: number): { allowed: boolean; remainingUsd: number; percentUsed: number } {
    this.maybeResetPeriod();
    const remaining = this.budget.limitUsd - this.budget.spentUsd;
    const percentUsed = this.budget.limitUsd > 0 ? this.budget.spentUsd / this.budget.limitUsd : 0;
    return {
      allowed: amountUsd <= remaining,
      remainingUsd: remaining,
      percentUsed,
    };
  }

  /**
   * Record a spend. Returns false if budget would be exceeded.
   */
  spend(amountUsd: number): boolean {
    this.maybeResetPeriod();
    const remaining = this.budget.limitUsd - this.budget.spentUsd;
    if (amountUsd > remaining) {
      this.onExhausted?.(this.budget);
      return false;
    }

    this.budget.spentUsd += amountUsd;

    // Check warning threshold
    const percentUsed = this.budget.spentUsd / this.budget.limitUsd;
    if (percentUsed >= this.warningThreshold && !this.warningFired) {
      this.warningFired = true;
      this.onWarning?.(this.budget, percentUsed);
    }

    return true;
  }

  /**
   * Get current budget status.
   */
  getStatus(): Budget & { remainingUsd: number; percentUsed: number } {
    this.maybeResetPeriod();
    return {
      ...this.budget,
      remainingUsd: this.budget.limitUsd - this.budget.spentUsd,
      percentUsed: this.budget.limitUsd > 0 ? this.budget.spentUsd / this.budget.limitUsd : 0,
    };
  }

  /**
   * Manually reset the budget.
   */
  reset(): void {
    this.budget.spentUsd = 0;
    this.budget.periodStart = new Date().toISOString();
    this.warningFired = false;
  }

  /**
   * Update the budget limit.
   */
  setLimit(limitUsd: number): void {
    this.budget.limitUsd = limitUsd;
  }

  // ─── Period Management ──────────────────────────────────────────────────

  private maybeResetPeriod(): void {
    const now = new Date();
    const start = new Date(this.budget.periodStart);

    let shouldReset = false;
    switch (this.budget.period) {
      case "hourly":
        shouldReset = now.getTime() - start.getTime() >= 3600_000;
        break;
      case "daily":
        shouldReset = now.getTime() - start.getTime() >= 86400_000;
        break;
      case "weekly":
        shouldReset = now.getTime() - start.getTime() >= 604800_000;
        break;
      case "monthly":
        shouldReset = now.getMonth() !== start.getMonth() || now.getFullYear() !== start.getFullYear();
        break;
      case "yearly":
        shouldReset = now.getFullYear() !== start.getFullYear();
        break;
      case "lifetime":
        // Never resets
        break;
    }

    if (shouldReset) {
      this.budget.spentUsd = 0;
      this.budget.periodStart = now.toISOString();
      this.warningFired = false;
    }
  }
}

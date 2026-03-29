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
export declare class BudgetTracker {
    private budget;
    private onExhausted?;
    private onWarning?;
    private warningThreshold;
    private warningFired;
    constructor(config: BudgetTrackerConfig);
    /**
     * Check if an amount can be spent without actually spending it.
     */
    check(amountUsd: number): {
        allowed: boolean;
        remainingUsd: number;
        percentUsed: number;
    };
    /**
     * Record a spend. Returns false if budget would be exceeded.
     */
    spend(amountUsd: number): boolean;
    /**
     * Get current budget status.
     */
    getStatus(): Budget & {
        remainingUsd: number;
        percentUsed: number;
    };
    /**
     * Manually reset the budget.
     */
    reset(): void;
    /**
     * Update the budget limit.
     */
    setLimit(limitUsd: number): void;
    private maybeResetPeriod;
}
//# sourceMappingURL=budget.d.ts.map
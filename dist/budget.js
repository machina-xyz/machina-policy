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
export class BudgetTracker {
    budget;
    onExhausted;
    onWarning;
    warningThreshold;
    warningFired = false;
    constructor(config) {
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
    check(amountUsd) {
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
    spend(amountUsd) {
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
    getStatus() {
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
    reset() {
        this.budget.spentUsd = 0;
        this.budget.periodStart = new Date().toISOString();
        this.warningFired = false;
    }
    /**
     * Update the budget limit.
     */
    setLimit(limitUsd) {
        this.budget.limitUsd = limitUsd;
    }
    // ─── Period Management ──────────────────────────────────────────────────
    maybeResetPeriod() {
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
//# sourceMappingURL=budget.js.map
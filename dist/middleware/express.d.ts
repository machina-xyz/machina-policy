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
import type { PolicyMiddlewareConfig } from "../types.js";
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
export declare function policyGate(config: PolicyMiddlewareConfig): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => Promise<void>;
export type { PolicyMiddlewareConfig };
//# sourceMappingURL=express.d.ts.map
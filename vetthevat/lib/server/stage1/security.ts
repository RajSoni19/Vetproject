import { createHash, createHmac, randomUUID } from "node:crypto";
import { ApiError, uuid } from "@/lib/server/api-v1";
import { requireCsrf, resolvePrincipal, type Capability, type ScopedPrincipalResolver } from "@/lib/server/auth-preparation";
import { enforceRequestLimits, type AtomicRateLimitStore } from "@/lib/server/request-limits";

export type SecurityEvent = { requestId: string; event: "access.allowed" | "access.denied"; companyId: string; actorUserId?: string; capability: Capability; status: number };
export interface SecurityAudit { append(event: SecurityEvent): Promise<void> }
export type SecurityDependencies = {
  origin: string; csrfSecret: string;
  sessions: { verifySession(cookie: string): Promise<{ userId: string; sessionId: string; expiresAt: number; revoked: boolean }> };
  // Durable web-only revocation registry; never revokes published mobile tokens.
  registry: { active(cookieSha256: string): Promise<{ csrfBinding: string; expiresAt: number } | null> };
  memberships: ScopedPrincipalResolver; limiter: AtomicRateLimitStore; audit: SecurityAudit;
};
export type Access = Awaited<ReturnType<typeof authorizeRequest>>;
export async function authorizeRequest(request: Request, companyInput: string, capability: Capability, deps: SecurityDependencies | undefined) {
  const companyId = uuid(companyInput), requestId = randomUUID();
  if (!deps || deps.csrfSecret.length < 32 || new URL(deps.origin).origin !== deps.origin || !deps.origin.startsWith("https://")) throw new ApiError(503, "UNAVAILABLE", "Reviewed authentication is not configured.");
  try {
    const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith("__Host-vetthevat-session="));
    if (cookies.length !== 1) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
    const cookie = cookies[0].slice("__Host-vetthevat-session=".length);
    if (!cookie || cookie.length > 16384 || !/^[A-Za-z0-9._-]+$/.test(cookie)) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
    const hash = createHash("sha256").update(cookie).digest("hex");
    await enforceRequestLimits(deps.limiter, [{ key: `session:${hash}`, limit: 120, windowMs: 60000 }]);
    let identity;
    try { identity = await deps.sessions.verifySession(cookie); } catch { throw new ApiError(401, "UNAUTHENTICATED", "Sign in required."); }
    const registered = await deps.registry.active(hash), now = Date.now();
    if (!identity.userId || !identity.sessionId || identity.revoked !== false || !Number.isFinite(identity.expiresAt) || identity.expiresAt <= now || !registered || !Number.isFinite(registered.expiresAt) || registered.expiresAt <= now || registered.csrfBinding.length < 32) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (!["GET", "HEAD"].includes(request.method)) requireCsrf(request, deps.origin, registered.csrfBinding, deps.csrfSecret);
    const principal = await resolvePrincipal(identity, companyId, capability, deps.memberships);
    await enforceRequestLimits(deps.limiter, [{ key: `company:${companyId}:${capability}`, limit: 300, windowMs: 60000 }]);
    await deps.audit.append({ requestId, event: "access.allowed", companyId, actorUserId: principal.userId, capability, status: 200 });
    return { ...principal, sessionCookie: cookie, requestId, capability };
  } catch (error) {
    await deps.audit.append({ requestId, event: "access.denied", companyId, capability, status: error instanceof ApiError ? error.status : 503 });
    throw error;
  }
}

// Redis-compatible EVAL interface. One script, all buckets, shared Redis TIME;
// callers must use a single cluster hash tag so the atomic operation stays local.
export const rateLimitScript = `
local time=redis.call('TIME'); local now=time[1]*1000+math.floor(time[2]/1000)
local retry=0
for i,key in ipairs(KEYS) do
 local count=tonumber(redis.call('HGET',key,'count') or '0')
 local untilAt=tonumber(redis.call('HGET',key,'until') or '0')
 if untilAt>now and count>=tonumber(ARGV[i*2-1]) then retry=math.max(retry,math.ceil((untilAt-now)/1000)) end
end
if retry>0 then return {0,retry} end
for i,key in ipairs(KEYS) do
 local untilAt=tonumber(redis.call('HGET',key,'until') or '0')
 if untilAt<=now then redis.call('HSET',key,'count',0,'until',now+tonumber(ARGV[i*2])) end
 redis.call('HINCRBY',key,'count',1); redis.call('PEXPIRE',key,tonumber(ARGV[i*2]))
end
return {1,0}`;
export function redisRateLimiter(redis: { eval(script: string, keys: string[], args: string[]): Promise<unknown> }, secret: string): AtomicRateLimitStore {
  if (secret.length < 32) throw new Error("Rate limit secret is required.");
  return { async consume(buckets) {
    const keys = buckets.map(bucket => `{vet-stage1}:rate:${createHmac("sha256", secret).update(bucket.key).digest("hex")}`);
    const result = await redis.eval(rateLimitScript, keys, buckets.flatMap(bucket => [String(bucket.limit), String(bucket.windowMs)]));
    if (!Array.isArray(result) || result.length !== 2 || ![0, 1].includes(result[0]) || !Number.isSafeInteger(result[1])) throw new ApiError(503, "UNAVAILABLE", "Request protection unavailable.");
    return { allowed: result[0] === 1, retryAfterSeconds: result[1] };
  } };
}

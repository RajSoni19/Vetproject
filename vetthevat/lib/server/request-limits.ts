import { ApiError } from "@/lib/server/api-v1";

export type RateBucket={key:string;limit:number;windowMs:number};
export interface AtomicRateLimitStore {
  // Must consume all buckets atomically using shared server time/storage. A
  // process-local Map is deliberately NOT provided as production enforcement.
  consume(buckets:readonly RateBucket[]):Promise<{allowed:boolean;retryAfterSeconds:number}>;
}
export async function enforceRequestLimits(store:AtomicRateLimitStore|undefined,buckets:readonly RateBucket[]) {
  if(!store)throw new ApiError(503,"UNAVAILABLE","Request protection is not configured.");
  if(!buckets.length||buckets.length>8||new Set(buckets.map(bucket=>bucket.key)).size!==buckets.length||buckets.some(bucket=>!bucket.key.trim()||bucket.key.length>256||/[\u0000-\u001f\u007f]/.test(bucket.key)||!Number.isSafeInteger(bucket.limit)||bucket.limit<1||bucket.limit>10000||!Number.isSafeInteger(bucket.windowMs)||bucket.windowMs<1000||bucket.windowMs>86400000))throw new ApiError(503,"UNAVAILABLE","Invalid request protection policy.");
  const result=await store.consume(buckets);
  if(typeof result.allowed!=="boolean"||!Number.isSafeInteger(result.retryAfterSeconds)||result.retryAfterSeconds<0||result.retryAfterSeconds>86400)throw new ApiError(503,"UNAVAILABLE","Request protection is unavailable.");
  if(!result.allowed)throw new ApiError(429,"RATE_LIMITED","Too many requests. Try again later.",Math.max(1,result.retryAfterSeconds));
}

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/server/api-v1";
import { extractOriginal, parseExtraction, type ExtractionReaders, type extractionJobs } from "@/lib/server/stage1/extraction";
import type { Original, OriginalStore } from "@/lib/server/stage1/documents";
import type { Access } from "@/lib/server/stage1/security";

// Explicit one-job runner. A future queue must obtain Original from a scoped
// repository and pass a fresh verified service context. No background loop starts
// on module import, and no request/client text is accepted as extraction evidence.
export async function processExtraction(input: {
  access: Access; original: Original; storage: OriginalStore;
  readers: ExtractionReaders; jobs: ReturnType<typeof extractionJobs>;
  suppliers: readonly { id: string; name: string; vatNumber: string }[];
}) {
  if (input.original.companyId !== input.access.companyId) throw new ApiError(403, "FORBIDDEN", "Original unavailable in this company.");
  const job = await input.jobs.claim(input.access, input.original.id);
  if (!job) throw new ApiError(409, "CONFLICT", "Extraction is already claimed or cannot be retried.");
  let result;
  try {
    const bytes = await input.storage.read(input.original);
    if (bytes.byteLength !== input.original.byteSize || createHash("sha256").update(bytes).digest("hex") !== input.original.sha256) throw new Error("Integrity failure.");
    const signal = AbortSignal.timeout(90000);
    // Adapters MUST terminate their work on abort. This promise also prevents
    // a noncompliant/hung adapter from publishing after the job's lease window.
    const text = await Promise.race([
      extractOriginal(bytes, input.original.mimeType, input.readers, signal),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Extraction deadline exceeded.")), { once: true }))
    ]);
    result = parseExtraction(text, input.suppliers);
  } catch { return input.jobs.finish(input.access, input.original.id, job.lease, null); }
  // Finish errors (including uncertain commit outcomes) must propagate, never
  // overwrite a potentially committed success with a failure or automatic retry.
  return input.jobs.finish(input.access, input.original.id, job.lease, result);
}

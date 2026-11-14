import { createHash, randomUUID } from "node:crypto";
import { ApiError, uuid } from "@/lib/server/api-v1";
import { validateDocumentSignature, maxDocumentBytes } from "@/lib/document-validation";
import { audit, idempotent, type Mutation, type createRepositories } from "@/lib/server/stage1/repositories";
import type { Access } from "@/lib/server/stage1/security";

export const invoiceMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type InvoiceMime = typeof invoiceMimes[number];
export type Original = { id: string; companyId: string; mimeType: InvoiceMime; byteSize: number; sha256: string; objectId: string; objectVersion: string };
export interface OriginalStore {
  put(input: { companyId: string; id: string; bytes: Uint8Array; sha256: string }): Promise<{ objectId: string; objectVersion: string }>;
  read(original: Original): Promise<Uint8Array>;
  // Cleanup is an operator reconciliation task on unknown DB commit outcomes;
  // never delete an original merely because COMMIT returned a transport error.
}
export interface ContentInspector {
  // Must decode actual content, bound pages/pixels/decompression/time and scan
  // malware in a sandbox; header checks alone are never a clean-file verdict.
  inspect(bytes: Uint8Array, mimeType: InvoiceMime): Promise<{ clean: boolean; pages: number; maxPagePixels: number }>;
}
export async function boundedUpload(request: Request) {
  const mime = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!invoiceMimes.includes(mime as InvoiceMime) || !request.body) throw new ApiError(415, "INVALID_REQUEST", "Upload PDF, JPEG, PNG or WEBP bytes.");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxDocumentBytes)) throw new ApiError(413, "INVALID_REQUEST", "Upload limit is 10 MB.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maxDocumentBytes) { await reader.cancel(); throw new ApiError(413, "INVALID_REQUEST", "Upload limit is 10 MB."); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (length !== null && Number(length) !== size) throw new ApiError(400, "INVALID_REQUEST", "Upload length mismatch.");
  try { validateDocumentSignature(mime!, size, bytes); } catch { throw new ApiError(400, "INVALID_REQUEST", "Invalid document contents."); }
  // Tighten server PDF validation without changing the existing browser reader.
  if (mime === "application/pdf" && (!bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-") || !bytes.subarray(-2048).toString("ascii").includes("%%EOF"))) throw new ApiError(400, "INVALID_REQUEST", "Incomplete PDF.");
  let name = request.headers.get("x-file-name") ?? "invoice";
  if(request.headers.get("x-file-name-encoding")==="percent-utf8")try{name=decodeURIComponent(name);}catch{throw new ApiError(400,"INVALID_REQUEST","Invalid file name encoding.");}
  else if(request.headers.has("x-file-name-encoding"))throw new ApiError(400,"INVALID_REQUEST","Invalid file name encoding.");
  if (!name.trim() || name.length > 200 || /[\\/\x00-\x1f\x7f]/.test(name)) throw new ApiError(400, "INVALID_REQUEST", "Invalid file name.");
  return { bytes, byteSize: size, mimeType: mime as InvoiceMime, originalName: name, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export function documentService(repositories: ReturnType<typeof createRepositories>, storage: OriginalStore, inspector: ContentInspector) {
  return {
    async intake(access: Access, input: Awaited<ReturnType<typeof boundedUpload>>, key: string) {
      const verdict = await inspector.inspect(input.bytes, input.mimeType);
      if (verdict.clean !== true || !Number.isInteger(verdict.pages) || verdict.pages < 1 || verdict.pages > 20 || !Number.isSafeInteger(verdict.maxPagePixels) || verdict.maxPagePixels < 1 || verdict.maxPagePixels > 7500000) throw new ApiError(400, "INVALID_REQUEST", "Document failed content safety checks.");
      return repositories.scoped(access, "documents:write", tx => idempotent(tx, access, "document.upload", key, { sha256: input.sha256, name: input.originalName, mime: input.mimeType }, async () => {
        // Serializes same company+fingerprint even under different request keys.
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`document:${access.companyId}:${input.sha256}`]);
        const existing = (await tx.query("SELECT id FROM vat.documents WHERE company_id=$1 AND sha256=$2 AND storage_state='available' ORDER BY uploaded_at LIMIT 1", [access.companyId, input.sha256])).rows[0];
        if (existing) return { id: String(existing.id), duplicate: true, status: "existing" };
        const id = randomUUID(), object = await storage.put({ companyId: access.companyId, id, bytes: input.bytes, sha256: input.sha256 });
        await tx.query("INSERT INTO vat.documents(id,company_id,original_name,mime_type,storage_state,storage_key,object_version,byte_size,sha256,review_status,uploaded_by) VALUES($1,$2,$3,$4,'available',$5,$6,$7,$8,'Needs Review',$9)", [id, access.companyId, input.originalName, input.mimeType, object.objectId, object.objectVersion, input.byteSize, input.sha256, access.userId]);
        await tx.query("INSERT INTO vat.extraction_jobs(company_id,document_id,status) VALUES($1,$2,'queued')", [access.companyId, id]);
        await audit(tx, access, "document.uploaded", "document", id, "1");
        return { id, duplicate: false, status: "queued" };
      }));
    },
    list(access: Access, limit: number, cursor: string | null) { return repositories.scoped(access, "documents:read", async tx => {
      const rows = (await tx.query("SELECT id,original_name,mime_type,byte_size::text,sha256,storage_state,review_status,uploaded_at FROM vat.documents WHERE company_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3", [access.companyId, cursor ? uuid(cursor) : null, limit + 1])).rows;
      return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
    }); },
    status(access: Access, documentId: string) { return repositories.scoped(access, "documents:read", async tx => (await tx.query("SELECT document_id,status,attempts,failure_code,version::text,result FROM vat.extraction_jobs WHERE company_id=$1 AND document_id=$2", [access.companyId, uuid(documentId)])).rows[0] ?? null); },
    retry(access: Access, documentId: string, mutation: Mutation) { return repositories.scoped(access, "documents:write", tx => idempotent(tx, access, "extraction.retry", mutation.key, { documentId, version: mutation.version }, async () => {
      const row = (await tx.query("UPDATE vat.extraction_jobs SET status='queued',failure_code=NULL,lease_token=NULL,lease_until=NULL,version=version+1 WHERE company_id=$1 AND document_id=$2 AND version=$3 AND attempts<3 AND (status='failed' OR (status='processing' AND lease_until<now())) RETURNING document_id,status,version::text", [access.companyId, uuid(documentId), mutation.version])).rows[0];
      if (!row) throw new ApiError(409, "CONFLICT", "Job cannot be retried in its current state.");
      await audit(tx, access, "extraction.retried", "document", documentId, String(row.version)); return row;
    })); },
    async download(access: Access, documentId: string) {
      const original = await repositories.scoped(access, "documents:read", async tx => {
        const row = (await tx.query("SELECT id,mime_type,byte_size::text,sha256,storage_key,object_version FROM vat.documents WHERE company_id=$1 AND id=$2 AND storage_state='available'", [access.companyId, uuid(documentId)])).rows[0];
        if (!row) throw new ApiError(404, "INVALID_REQUEST", "Original unavailable.");
        await audit(tx, access, "document.downloaded", "document", documentId, "1");
        return { id: String(row.id), companyId: access.companyId, mimeType: row.mime_type as InvoiceMime, byteSize: Number(row.byte_size), sha256: String(row.sha256), objectId: String(row.storage_key), objectVersion: String(row.object_version) };
      });
      const bytes = await storage.read(original);
      if (bytes.byteLength !== original.byteSize || createHash("sha256").update(bytes).digest("hex") !== original.sha256) throw new ApiError(503, "UNAVAILABLE", "Original integrity check failed.");
      return { bytes, mimeType: original.mimeType };
    }
  };
}

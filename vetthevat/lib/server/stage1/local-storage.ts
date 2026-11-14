import { mkdir, open, readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { uuid } from "@/lib/server/api-v1";
import type { OriginalStore } from "@/lib/server/stage1/documents";

// Explicit development adapter, never used by a route automatically. Outside
// public/, write-once files, no signed/public URL. Not a cloud durability claim.
export async function localOriginalStore(workspace: string, environment: "test" | "development"): Promise<OriginalStore> {
  if (process.env.NODE_ENV === "production" || !["test", "development"].includes(environment)) throw new Error("Local storage is development-only.");
  const base = await realpath(workspace), root = join(base, ".stage1-private");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const resolved = await realpath(root), distance = relative(base, resolved);
  if (!distance || distance.startsWith("..") || isAbsolute(distance)) throw new Error("Unsafe storage root.");
  const objectPath = (company: string, id: string) => resolve(resolved, `${uuid(company)}_${uuid(id)}.original`);
  return {
    async put(input) {
      if (createHash("sha256").update(input.bytes).digest("hex") !== input.sha256) throw new Error("Integrity failure.");
      const file = await open(objectPath(input.companyId, input.id), "wx", 0o600);
      try { await file.writeFile(input.bytes); await file.sync(); } finally { await file.close(); }
      return { objectId: `${input.companyId}/${input.id}`, objectVersion: input.sha256 };
    },
    async read(original) {
      if (original.objectId !== `${original.companyId}/${original.id}` || original.objectVersion !== original.sha256) throw new Error("Invalid object identity.");
      const file = objectPath(original.companyId, original.id), actual = await realpath(file);
      if (actual !== file) throw new Error("Unsafe original path.");
      const bytes = await readFile(file);
      if (bytes.length !== original.byteSize || createHash("sha256").update(bytes).digest("hex") !== original.sha256) throw new Error("Original integrity failure.");
      return bytes;
    }
  };
}

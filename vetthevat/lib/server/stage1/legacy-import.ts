import { createHash } from "node:crypto";
import { ApiError, objectBody } from "@/lib/server/api-v1";
import { contactCommand, invoiceCommand } from "@/lib/server/business-contracts";

// Explicit preview only. No browser access, file scanning, uploads or writes.
// Client roles/plans/company IDs/history can never become trusted server state.
export function previewLegacyImport(value: unknown) {
  const input = objectBody(value, ["customers", "suppliers", "invoices"]);
  const problems: { collection: string; index: number; reason: string }[] = [];
  const collections = ["customers", "suppliers", "invoices"] as const;
  const result = { customers: [] as ReturnType<typeof contactCommand>[], suppliers: [] as ReturnType<typeof contactCommand>[], invoices: [] as ReturnType<typeof invoiceCommand>[] };
  for (const key of collections) {
    const rows = input[key] ?? [];
    if (!Array.isArray(rows) || rows.length > 1000) throw new ApiError(400, "INVALID_REQUEST", "Import supports at most 1,000 rows per collection.");
    rows.forEach((row, index) => {
      try {
        if (key === "invoices") {
          const command = invoiceCommand(row);
          if (command.action !== "save-draft") throw new Error();
          result.invoices.push(command);
        } else result[key].push(contactCommand(row));
      } catch { problems.push({ collection: key, index, reason: "Requires explicit mapping to the server contract; financial records must be drafts." }); }
    });
  }
  return { previewOnly: true, sourceSha256: createHash("sha256").update(JSON.stringify(input)).digest("hex"), valid: result, problems, requiresReview: true, originalsTransferred: false };
}

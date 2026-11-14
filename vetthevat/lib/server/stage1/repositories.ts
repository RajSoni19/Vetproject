import { createHash, randomUUID } from "node:crypto";
import { ApiError, uuid } from "@/lib/server/api-v1";
import { contactCommand, companyCommand, invoiceCommand, scopedFilters } from "@/lib/server/business-contracts";
import { bindTransactionContext, type ContextBroker } from "@/lib/server/command-protocol";
import type { Transaction } from "@/lib/server/database-core";
import type { Access } from "@/lib/server/stage1/security";

export interface DatabasePort { transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> }
export type Contact = ReturnType<typeof contactCommand>;
export type InvoiceCommand = ReturnType<typeof invoiceCommand>;
export type Filters = ReturnType<typeof scopedFilters>;
export type Mutation = { key: string; version: number };
export function conflict(message = "The record changed or conflicts with an existing record."): never { throw new ApiError(409, "CONFLICT", message); }
export async function audit(tx: Transaction, access: Access, event: string, entity: string, id: string, version: string) {
  await tx.query("INSERT INTO vat.audit_events(company_id,actor_user_id,event_type,entity_type,entity_id,request_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)", [access.companyId, access.userId, event, entity, id, access.requestId, JSON.stringify({ version })]);
}
export async function idempotent<T>(tx: Transaction, access: Access, operation: string, key: string, payload: unknown, work: () => Promise<T>): Promise<T> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new ApiError(400, "INVALID_REQUEST", "Idempotency-Key required.");
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  // Conflicting inserts wait for the first transaction; rollback frees the key.
  await tx.query("INSERT INTO vat.idempotency_keys(company_id,user_id,operation,key,payload_sha256,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '90 days') ON CONFLICT DO NOTHING", [access.companyId, access.userId, operation, key, digest]);
  const row = (await tx.query("SELECT payload_sha256,response FROM vat.idempotency_keys WHERE company_id=$1 AND user_id=$2 AND operation=$3 AND key=$4 FOR UPDATE", [access.companyId, access.userId, operation, key])).rows[0];
  if (!row || row.payload_sha256 !== digest) conflict("Idempotency key was used for different content.");
  if (row.response !== null) return row.response as T;
  const result = await work();
  await tx.query("UPDATE vat.idempotency_keys SET response=$5::jsonb WHERE company_id=$1 AND user_id=$2 AND operation=$3 AND key=$4", [access.companyId, access.userId, operation, key, JSON.stringify(result)]);
  return result;
}

// Called only for NEW invoice creation, inside the invoice/audit transaction.
// Account row serializes all its companies. Never expires pending usage on reads.
export async function consumeInvoiceQuota(tx: Transaction, access: Access, invoiceId: string) {
  const account = (await tx.query("SELECT id FROM vat.billing_accounts WHERE id=$1 AND status='active' FOR UPDATE", [access.billingAccountId])).rows[0];
  if (!account) throw new ApiError(403, "FORBIDDEN", "Active billing account required.");
  const periods = (await tx.query(`SELECT p.id,p.allowance,p.plan_snapshot FROM vat.usage_periods p
    JOIN vat.subscriptions s ON s.account_id=p.account_id AND s.plan=p.plan_snapshot AND s.state='active' AND s.verified_at IS NOT NULL
    WHERE p.account_id=$1 AND p.starts_at<=now() AND p.ends_at>now() FOR UPDATE OF p`, [access.billingAccountId])).rows;
  if (periods.length !== 1) throw new ApiError(503, "UNAVAILABLE", "Verified billing period required.");
  const period = periods[0], limits: Record<string, number> = { Basic: 30, Starter: 100, Growth: 300 };
  if (limits[String(period.plan_snapshot)] !== period.allowance) throw new ApiError(503, "UNAVAILABLE", "Verified invoice allowance required.");
  const existing = (await tx.query("SELECT state FROM vat.invoice_usage WHERE company_id=$1 AND invoice_id=$2", [access.companyId, invoiceId])).rows[0];
  if (existing) conflict("Invoice usage already exists.");
  // Narrow reviewed helper counts ALL account companies after independently
  // verifying ticket+company+account. Ordinary company RLS could undercount.
  const count = (await tx.query("SELECT vat.account_invoice_usage($1,$2,$3)::text AS used", [access.companyId, access.billingAccountId, period.id])).rows[0];
  if (!count || typeof count.used !== "string" || !/^\d+$/.test(count.used)) throw new ApiError(503, "UNAVAILABLE", "Usage unavailable.");
  if (BigInt(count.used) >= BigInt(Number(period.allowance))) conflict("The shared account invoice allowance has been reached.");
  await tx.query("INSERT INTO vat.invoice_usage(account_id,period_id,company_id,invoice_id,state,committed_at) VALUES($1,$2,$3,$4,'committed',now())", [access.billingAccountId, period.id, access.companyId, invoiceId]);
}

export function createRepositories(database: DatabasePort, broker: ContextBroker) {
  const scoped = <T>(access: Access, capability: Access["capability"], work: (tx: Transaction) => Promise<T>) => {
    if (access.capability !== capability || !access.capabilities.includes(capability)) throw new ApiError(403, "FORBIDDEN", "Company permission required.");
    return database.transaction(async tx => {
      await bindTransactionContext(tx, { sessionCookie: access.sessionCookie, companyId: access.companyId, capability }, broker);
      // The broker independently checks identity+membership. Also assert the
      // binding succeeded before any repository work, even with faulty adapters.
      const bound = (await tx.query("SELECT vat.authorized_company($1,$2) AS allowed", [access.companyId, capability])).rows[0];
      if (bound?.allowed !== true) throw new ApiError(403, "FORBIDDEN", "Company permission required.");
      return work(tx);
    });
  };
  return {
    scoped,
    getContact(access: Access, kind: "customers" | "suppliers", id: string) {
      if (!["customers", "suppliers"].includes(kind)) throw new ApiError(400, "INVALID_REQUEST", "Invalid contact type.");
      return scoped(access, "contacts:read", async tx => {
        const row = (await tx.query(`SELECT id,name,email,phone,vat_number,address,status,version::text FROM vat.${kind} WHERE company_id=$1 AND id=$2`, [access.companyId, uuid(id)])).rows[0];
        if (!row) throw new ApiError(404, "INVALID_REQUEST", "Contact unavailable.");
        return row;
      });
    },
    listContacts(access: Access, kind: "customers" | "suppliers", filters: Filters) {
      // Table identifier comes exclusively from this closed union AND runtime check.
      if (!["customers", "suppliers"].includes(kind)) throw new ApiError(400, "INVALID_REQUEST", "Invalid contact type.");
      return scoped(access, "contacts:read", async tx => {
        const rows = (await tx.query(`SELECT id,name,email,phone,vat_number,address,status,version::text FROM vat.${kind} WHERE company_id=$1 AND ($2='' OR name ILIKE '%'||$2||'%') AND ($3::uuid IS NULL OR id>$3::uuid) ORDER BY id LIMIT $4`, [access.companyId, filters.query, filters.cursor ? uuid(filters.cursor) : null, filters.limit + 1])).rows;
        return { items: rows.slice(0, filters.limit), nextCursor: rows.length > filters.limit ? rows[filters.limit - 1].id : null };
      });
    },
    saveContact(access: Access, kind: "customers" | "suppliers", id: string | null, command: Contact, mutation: Mutation) {
      if (!["customers", "suppliers"].includes(kind)) throw new ApiError(400, "INVALID_REQUEST", "Invalid contact type.");
      return scoped(access, "contacts:write", tx => idempotent(tx, access, `${kind}.save`, mutation.key, { id, command, version: mutation.version }, async () => {
        const target = id ? uuid(id) : randomUUID();
        const values = [access.companyId, target, command.name, command.email, command.phone, command.vatNumber, command.address, command.status];
        const result = id ? await tx.query(`UPDATE vat.${kind} SET name=$3,email=$4,phone=$5,vat_number=$6,address=$7,status=$8,version=version+1 WHERE company_id=$1 AND id=$2 AND version=$9 RETURNING id,version::text`, [...values, mutation.version])
          : await tx.query(`INSERT INTO vat.${kind}(company_id,id,name,email,phone,vat_number,address,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,version::text`, values);
        if (!result.rows[0]) conflict();
        await audit(tx, access, `${kind}.saved`, kind, target, String(result.rows[0].version));
        return result.rows[0];
      }));
    },
    listInvoices(access: Access, filters: Filters) {
      return scoped(access, "invoices:read", async tx => {
        const rows = (await tx.query(`SELECT id,invoice_number,invoice_date,currency,transaction_type,status,net::text,vat::text,gross::text,version::text,document_id FROM vat.invoices WHERE company_id=$1
          AND ($2='' OR invoice_number ILIKE '%'||$2||'%' OR supplier_name ILIKE '%'||$2||'%')
          AND ($3::uuid IS NULL OR id>$3::uuid) AND ($4::date IS NULL OR invoice_date>=$4) AND ($5::date IS NULL OR invoice_date<=$5)
          AND ($6::text IS NULL OR currency=$6) AND ($7::text IS NULL OR coalesce(transaction_type,'Unclassified')=$7)
          AND ($8::text IS NULL OR status=$8) AND ($9::uuid IS NULL OR supplier_id=$9) AND ($10::uuid IS NULL OR customer_id=$10)
          ORDER BY id LIMIT $11`, [access.companyId, filters.query, filters.cursor ? uuid(filters.cursor) : null, filters.dateFrom, filters.dateTo, filters.currency, filters.direction, filters.status, filters.supplierId, filters.customerId, filters.limit + 1])).rows;
        return { items: rows.slice(0, filters.limit), nextCursor: rows.length > filters.limit ? rows[filters.limit - 1].id : null };
      });
    },
    getInvoice(access: Access, id: string) {
      return scoped(access, "invoices:read", async tx => {
        const invoice = (await tx.query("SELECT id,invoice_number,invoice_date,due_date,currency,supplier_id,customer_id,document_id,supplier_name,supplier_vat_number,customer_name,customer_vat_number,transaction_type,status,net::text,vat::text,gross::text,version::text,notes FROM vat.invoices WHERE company_id=$1 AND id=$2", [access.companyId, uuid(id)])).rows[0];
        if (!invoice) throw new ApiError(404, "INVALID_REQUEST", "Invoice unavailable.");
        const lines = (await tx.query("SELECT id,position,description,quantity::text,unit_price::text,discount::text,vat_rate::text,tax_classification,net::text,vat::text,gross::text FROM vat.invoice_lines WHERE company_id=$1 AND invoice_id=$2 ORDER BY position", [access.companyId, id])).rows;
        return { ...invoice, lines };
      });
    },
    saveInvoice(access: Access, command: InvoiceCommand, mutation: Mutation) {
      return scoped(access, "invoices:write", tx => idempotent(tx, access, "invoice.save", mutation.key, { command, version: mutation.version }, async () => {
        // Serialize account first, then invoices: same order as quota commands.
        await tx.query("SELECT id FROM vat.billing_accounts WHERE id=$1 FOR UPDATE", [access.billingAccountId]);
        const old = (await tx.query("SELECT version::text FROM vat.invoices WHERE company_id=$1 AND id=$2 FOR UPDATE", [access.companyId, command.id])).rows[0];
        if (old && old.version !== String(mutation.version) || !old && mutation.version !== 1) conflict();
        for (const [table, id] of [["suppliers", command.supplierId], ["customers", command.customerId], ["documents", command.documentId]] as const) {
          if (id && !(await tx.query(`SELECT id FROM vat.${table} WHERE company_id=$1 AND id=$2${table === "documents" ? " AND storage_state='available'" : " AND status='Active'"}`, [access.companyId, id])).rows.length) throw new ApiError(403, "FORBIDDEN", "Linked record unavailable in this company.");
        }
        // Review is an explicit action; never confirm extraction automatically.
        const confirmed = command.action === "confirm", version = old ? Number(mutation.version) + 1 : 1;
        const normalizedNumber = command.invoiceNumber.replace(/[^a-z0-9]/gi, "").toLowerCase();
        if (confirmed) {
          // Names are not canonical supplier identities. Missing supplier ID on
          // a purchase must be resolved by the reviewer before confirmation.
          if (command.transactionType !== "Sale" && !command.supplierId) throw new ApiError(400, "INVALID_REQUEST", "Select a supplier before confirming a purchase.");
          await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`invoice:${access.companyId}:${command.transactionType}:${command.supplierId ?? command.customerId ?? "sale"}:${normalizedNumber}`]);
          if ((await tx.query("SELECT id FROM vat.invoices WHERE company_id=$1 AND id<>$2 AND status='Reviewed' AND supplier_id IS NOT DISTINCT FROM $3::uuid AND customer_id IS NOT DISTINCT FROM $4::uuid AND transaction_type IS NOT DISTINCT FROM $5 AND normalized_number=$6 LIMIT 1", [access.companyId, command.id, command.supplierId, command.customerId, command.transactionType, normalizedNumber])).rows.length) conflict("A confirmed invoice with this identity already exists.");
        }
        if (!old) await consumeInvoiceQuota(tx, access, command.id);
        const values = [access.companyId, command.id, command.supplierId, command.customerId, command.documentId, command.invoiceNumber, command.invoiceDate, command.dueDate, command.currency, command.supplierName, command.supplierVatNumber, command.customerName, command.customerVatNumber, command.transactionType, confirmed ? "Reviewed" : "Draft", confirmed ? "Confirmed" : "Ready for Review", confirmed ? "Reviewed" : "Needs Review", command.net, command.vat, command.gross, command.notes, version];
        if (old) await tx.query(`UPDATE vat.invoices SET supplier_id=$3,customer_id=$4,document_id=$5,invoice_number=$6,invoice_date=$7,due_date=$8,currency=$9,supplier_name=$10,supplier_vat_number=$11,customer_name=$12,customer_vat_number=$13,transaction_type=$14,status=$15,processing_status=$16,review_status=$17,net=$18,vat=$19,gross=$20,notes=$21,version=$22,updated_at=now() WHERE company_id=$1 AND id=$2`, values);
        else await tx.query(`INSERT INTO vat.invoices(company_id,id,supplier_id,customer_id,document_id,invoice_number,invoice_date,due_date,currency,supplier_name,supplier_vat_number,customer_name,customer_vat_number,transaction_type,status,processing_status,review_status,net,vat,gross,notes,version) VALUES(${values.map((_, index) => `$${index + 1}`).join(",")})`, values);
        await tx.query("UPDATE vat.invoices SET normalized_number=$3 WHERE company_id=$1 AND id=$2", [access.companyId, command.id, normalizedNumber]);
        await tx.query("DELETE FROM vat.invoice_lines WHERE company_id=$1 AND invoice_id=$2", [access.companyId, command.id]);
        for (const [position, line] of command.lines.entries()) await tx.query("INSERT INTO vat.invoice_lines(company_id,invoice_id,id,position,description,quantity,unit_price,discount,vat_rate,tax_classification,net,vat,gross) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [access.companyId, command.id, line.id, position, line.description, line.quantity, line.unitPrice, line.discount, line.vatRate, line.taxClassification ?? null, line.net, line.vat, line.gross]);
        await tx.query("DELETE FROM vat.invoice_vat_groups WHERE company_id=$1 AND invoice_id=$2", [access.companyId, command.id]);
        await tx.query("INSERT INTO vat.invoice_vat_groups(company_id,invoice_id,rate,net,vat,gross) SELECT company_id,invoice_id,vat_rate,sum(net),sum(vat),sum(gross) FROM vat.invoice_lines WHERE company_id=$1 AND invoice_id=$2 GROUP BY company_id,invoice_id,vat_rate", [access.companyId, command.id]);
        await tx.query("INSERT INTO vat.invoice_revisions(company_id,invoice_id,version,snapshot,actor_user_id) VALUES($1,$2,$3,$4::jsonb,$5)", [access.companyId, command.id, version, JSON.stringify(command), access.userId]);
        await audit(tx, access, "invoice.saved", "invoice", command.id, String(version));
        return { id: command.id, version: String(version), reviewStatus: confirmed ? "Reviewed" : "Needs Review" };
      }));
    },
    company(access: Access) { return scoped(access, "company:read", async tx => (await tx.query("SELECT id,name,registration_number,vat_number,address,country,currency,industry,vat_period_start,vat_period_end,version::text FROM vat.companies WHERE id=$1", [access.companyId])).rows[0] ?? null); },
    saveCompany(access: Access, command: ReturnType<typeof companyCommand>, mutation: Mutation) {
      return scoped(access, "company:manage", tx => idempotent(tx, access, "company.save", mutation.key, { command, version: mutation.version }, async () => {
        const row = (await tx.query("UPDATE vat.companies SET name=$2,registration_number=$3,vat_number=$4,address=$5,country=$6,currency=$7,industry=$8,vat_period_start=$9,vat_period_end=$10,version=version+1 WHERE id=$1 AND version=$11 RETURNING id,version::text", [access.companyId, command.name, command.registrationNumber, command.vatNumber, command.address, command.country, command.currency, command.industry, command.vatPeriodStart, command.vatPeriodEnd, mutation.version])).rows[0];
        if (!row) conflict();
        await audit(tx, access, "company.saved", "company", access.companyId, String(row.version)); return row;
      }));
    },
    activity(access: Access, filters: Filters) { return scoped(access, "audit:read", async tx => {
      const rows = (await tx.query("SELECT id,event_type,entity_type,entity_id,created_at FROM vat.audit_events WHERE company_id=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3='' OR event_type ILIKE '%'||$3||'%') ORDER BY id LIMIT $4", [access.companyId, filters.cursor ? uuid(filters.cursor) : null, filters.query, filters.limit + 1])).rows;
      return { items: rows.slice(0, filters.limit), nextCursor: rows.length > filters.limit ? rows[filters.limit - 1].id : null };
    }); }
  };
}

import { randomUUID } from "node:crypto";
import { LeadError, type LeadStore, type StoredLead } from "@/lib/server/leads/core";
import type { LeadInput } from "@/lib/leads/contracts";

export type LeadSql = { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
export interface LeadDatabase { transaction<T>(work: (sql: LeadSql) => Promise<T>): Promise<T> }
export type NotificationClaim = { id: string; lead: LeadInput; leadId: string; createdAt: string; lease: string; attempt: number; firstAttemptAt: string };
export interface NotificationStore {
  claim(): Promise<NotificationClaim | null>;
  accepted(claim: NotificationClaim, providerId: string): Promise<void>;
  failed(claim: NotificationClaim): Promise<void>;
}
function stored(row: Record<string, unknown>): StoredLead {
  return { ...(row.payload as LeadInput), id: String(row.id), createdAt: String(row.created_at), status: row.status as StoredLead["status"], notes: String(row.notes), version: Number(row.version) };
}
export function postgresLeadStore(database: LeadDatabase): LeadStore & NotificationStore {
  return {
    consume(buckets) {
      if (!buckets.length || buckets.length > 4 || new Set(buckets.map(row => row.key)).size !== buckets.length || buckets.some(row => !/^[a-z0-9:-]{1,100}$/.test(row.key) || !Number.isInteger(row.limit) || row.limit < 1 || row.limit > 1000 || !Number.isInteger(row.seconds) || row.seconds < 60 || row.seconds > 86400)) throw new LeadError(503, "UNAVAILABLE", "Request protection unavailable.");
      return database.transaction(async tx => {
        let retryAfter = 0;
        for (const bucket of [...buckets].sort((a, b) => a.key.localeCompare(b.key))) {
          await tx.query("INSERT INTO lead_intake.rate_buckets(key,count,ends_at) VALUES($1,0,now()+$2*interval '1 second') ON CONFLICT DO NOTHING", [bucket.key, bucket.seconds]);
          const row = (await tx.query("SELECT count,ends_at>now() AS current,greatest(1,ceil(extract(epoch FROM ends_at-now())))::int AS retry FROM lead_intake.rate_buckets WHERE key=$1 FOR UPDATE", [bucket.key])).rows[0];
          if (!row) throw new Error("Rate store unavailable");
          if (row.current === true && Number(row.count) >= bucket.limit) retryAfter = Math.max(retryAfter, Number(row.retry));
        }
        if (retryAfter) return { allowed: false, retryAfter };
        for (const bucket of buckets) await tx.query("UPDATE lead_intake.rate_buckets SET count=CASE WHEN ends_at<=now() THEN 1 ELSE count+1 END,ends_at=CASE WHEN ends_at<=now() THEN now()+$2*interval '1 second' ELSE ends_at END WHERE key=$1", [bucket.key, bucket.seconds]);
        return { allowed: true, retryAfter: 0 };
      });
    },
    save(input) {
      return database.transaction(async tx => {
        for (const key of [`key:${input.keyHash}`, `duplicate:${input.duplicateHash}`].sort()) await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
        const previous = (await tx.query("SELECT k.digest,l.id,l.created_at::text FROM lead_intake.idempotency k JOIN lead_intake.leads l ON l.id=k.lead_id WHERE k.key_hash=$1", [input.keyHash])).rows[0];
        if (previous) {
          if (previous.digest !== input.digest) throw new LeadError(409, "CONFLICT", "This submission reference was already used. Reload the form for a different enquiry.");
          return { id: String(previous.id), createdAt: String(previous.created_at) };
        }
        let row = (await tx.query("SELECT id,created_at::text FROM lead_intake.leads WHERE duplicate_hash=$1 AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1", [input.duplicateHash])).rows[0];
        if (!row) {
          const id = randomUUID();
          row = (await tx.query("INSERT INTO lead_intake.leads(id,payload,duplicate_hash,privacy_version) VALUES($1,$2::jsonb,$3,$4) RETURNING id,created_at::text", [id, JSON.stringify(input.lead), input.duplicateHash, input.privacyVersion])).rows[0];
          if (!row) throw new Error("Lead save unavailable");
          await tx.query("INSERT INTO lead_intake.outbox(id,lead_id) VALUES($1,$2)", [randomUUID(), id]);
        }
        await tx.query("INSERT INTO lead_intake.idempotency(key_hash,digest,lead_id) VALUES($1,$2,$3)", [input.keyHash, input.digest, row.id]);
        return { id: String(row.id), createdAt: String(row.created_at) };
      });
    },
    list(filters) { return database.transaction(async tx => {
      const rows = (await tx.query(`SELECT id,payload,created_at::text,status,notes,version FROM lead_intake.leads
        WHERE ($1='' OR payload->>'fullName' ILIKE '%'||$1||'%' OR payload->>'businessName' ILIKE '%'||$1||'%' OR payload->>'email' ILIKE '%'||$1||'%')
        AND ($2::text IS NULL OR payload->>'service'=$2) AND ($3::text IS NULL OR status=$3)
        AND ($4::uuid IS NULL OR (created_at,id)<(SELECT c.created_at,c.id FROM lead_intake.leads c WHERE c.id=$4)) ORDER BY created_at DESC,id DESC LIMIT $5`, [filters.query, filters.service, filters.status, filters.cursor, filters.limit + 1])).rows;
      return { items: rows.slice(0, filters.limit).map(stored), nextCursor: rows.length > filters.limit ? String(rows[filters.limit - 1].id) : null };
    }); },
    update(input) { return database.transaction(async tx => {
      const row = (await tx.query("UPDATE lead_intake.leads SET status=$2,notes=$3,version=version+1 WHERE id=$1 AND version=$4 RETURNING id,payload,created_at::text,status,notes,version", [input.id, input.status, input.notes, input.version])).rows[0];
      if (!row) throw new LeadError(409, "CONFLICT", "The lead changed. Refresh before saving.");
      await tx.query("INSERT INTO lead_intake.admin_audit(lead_id,actor,event,version) VALUES($1,$2,'lead.updated',$3)", [input.id, input.actor, row.version]);
      return stored(row);
    }); },
    claim() { return database.transaction(async tx => {
      // The provider's deduplication lasts 24h. Stop well before that boundary;
      // never automatically resend an uncertain old notification as a new send.
      await tx.query("UPDATE lead_intake.outbox SET state='manual_review',lease_token=NULL,lease_until=NULL WHERE (state='pending' OR state='sending' AND lease_until<now()) AND (attempts>=8 OR first_attempt_at<now()-interval '22 hours')");
      const lease = randomUUID();
      const row = (await tx.query(`WITH candidate AS (SELECT id FROM lead_intake.outbox WHERE (state='pending' AND next_attempt_at<=now() OR state='sending' AND lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE lead_intake.outbox o SET state='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=$1,lease_until=now()+interval '2 minutes'
        FROM candidate c,lead_intake.leads l WHERE o.id=c.id AND l.id=o.lead_id RETURNING o.id,o.lead_id,o.attempts,o.first_attempt_at::text,l.payload,l.created_at::text`, [lease])).rows[0];
      return row ? { id: String(row.id), leadId: String(row.lead_id), lead: row.payload as LeadInput, createdAt: String(row.created_at), lease, attempt: Number(row.attempts), firstAttemptAt: String(row.first_attempt_at) } : null;
    }); },
    async accepted(claim, providerId) { await database.transaction(async tx => {
      const row = (await tx.query("UPDATE lead_intake.outbox SET state='accepted',provider_id=$3,accepted_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND state='sending' AND lease_until>now() RETURNING id", [claim.id, claim.lease, providerId])).rows[0];
      if (!row) throw new LeadError(409, "CONFLICT", "Notification lease expired.");
    }); },
    async failed(claim) { await database.transaction(async tx => {
      await tx.query("UPDATE lead_intake.outbox SET state=CASE WHEN attempts>=8 OR first_attempt_at<now()-interval '22 hours' THEN 'manual_review' ELSE 'pending' END,next_attempt_at=now()+least(3600,power(2,attempts)*30)*interval '1 second',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND state='sending'", [claim.id, claim.lease]);
    }); }
  };
}

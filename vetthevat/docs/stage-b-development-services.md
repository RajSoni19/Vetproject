# Stage B isolated document services

No new storage/scanner/OCR host has been installed, started or verified. Docker,
MinIO and ClamAV commands were not found on PATH in this session. The existing
S3 adapter is still disabled. A Tesseract thread or a file signature check cannot
serve as the trusted inspection boundary.

The current private storage adapter accepts only:

```text
SAAS_OBJECT_STORAGE_ENABLED=1
SAAS_OBJECT_STORAGE_APPROVED=vtv-saas-dev-private
SAAS_OBJECT_ENDPOINT=http://127.0.0.1:59000
SAAS_OBJECT_BUCKET=vtv-saas-dev-private
SAAS_OBJECT_REGION=<explicit-local-provider-region>
SAAS_OBJECT_ACCESS_KEY=<isolated-service-key>
SAAS_OBJECT_SECRET_KEY=<isolated-service-secret>
```

Keep these server-only values in a restricted local configuration, never public
environment variables, browser code, source inventories or test logs. The local
HTTPS app launcher currently forces storage disabled, so merely exporting these
values will not silently enable uploads. No production AWS credential fallback
is supported. Do not point these adapters at the old auth database or mobile
services.

An actual compatible provider must bind only loopback, provide a durable private
volume outside ephemeral deployment filesystems, enable bucket versioning, deny
anonymous access, and grant only the explicit object operations needed by the
web/worker. The adapter currently requires owner-only ACL and absence of a bucket
policy. Prove conditional create, immutable keys, exact version read, size/hash
verification, private denied reads and restart persistence using the actual
provider before enabling any upload route. Retention/version backup and a tested
restore procedure remain required. No bucket is created automatically.

The isolated worker needs its own `vtv_saas_document_worker` connection to 55440
and an exact installation UUID. Its random development service credential must be
separate from the web runtime credential. It can call only the four reviewed
claim/finish functions and read the non-secret migration stamp. Next.js must not
receive this credential. No worker identity is provisioned by TypeScript import.

Supply `TrustedInspectionPort` from an actual malware scanner plus a bounded
format decoder. Require scan success and decoding/page/pixel/decompression limits
before returning clean. Bind the receipt to the leased original hash/version.
Restrict worker filesystem, egress, CPU, RAM and execution time at the OS/container
boundary. The in-process 90-second deadline stops publication after timeout; it
does not kill hostile native decoding or replace those host controls.

Supply `IsolatedOcrPort` from a resource-limited PDF/image worker. Existing
PDF.js/Tesseract adapters/parsers can be reused inside that host. Bound at 20 pages,
100,000 text characters per page and 1 MB aggregate observations; preserve source
version/digest, confidence, ambiguity and repeated lines. Missing fields stay
unresolved. Results and corrections stay separate; no automatic confirmation.

The database lease contract provides SKIP LOCKED claims, 120-second leases, at
most five attempts, exponential delay and stale-completion denial. Exhausted
expired leases become failed. Inspection error keeps quarantine; infection rejects
the file; successful trusted inspection queues extraction. Completion preserves
originals and never deletes them on uncertain commits. A later operator retry or
reconciliation command must remain bounded, permissioned and audited.

Real verification still needed: scanner EICAR denial, malformed/compressed files,
timeout/crash, stale leases, provider outages, corrupted originals, concurrent
completion, OCR review/save, and cross-company downloads. Injected test adapters
are not evidence that those services work.

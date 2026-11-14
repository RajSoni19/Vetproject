# Temporary Vercel marketing launch

This configuration is for a temporary `*.vercel.app` marketing website only.
It is not a deployment of the VAT workspace, authentication, invoice uploads,
payment collection, database services, Firebase, or the Flutter applications.

## Release boundary

The Vercel upload excludes these paths through [`.vercelignore`](../.vercelignore):

- `app/app` (the workspace)
- `app/api` (if introduced later)
- `app/login`, `app/register`, password/reset/verification and onboarding routes
- `lib/server`, `database`, `tests`, `docs`, local recovery data, logs and all
  environment files

The server-side `proxy.ts` has a second barrier. With
`VETTHEVAT_MARKETING_ONLY=1`, requests to `/app/*`, `/api/*` and all auth/setup
routes return `404` with no-store caching. This is a denial response, not a
client-side navigation rule.

Approved public routes are: `/`, `/about`, `/benefits`, `/contact`, `/faq`,
`/features`, `/how-it-works`, `/mobile-app`, `/plan-information`, `/pricing`,
`/product`, `/security`, and `/support`.

`/privacy` and `/terms` remain content outlines in the local source. They are
not linked, indexed or included in the temporary launch sitemap. Obtain legal
approval before linking or treating them as published documents.

## Environment configuration

Set only this project environment variable in Vercel, for both Preview and
Production environments:

```
VETTHEVAT_MARKETING_ONLY=1
```

Enable Vercel's system environment variable exposure so `VERCEL_URL` is
available at build time. Vercel's stable production hostname is preferred over a
unique deployment hostname when constructing canonical, Open Graph and sitemap
URLs for the temporary `*.vercel.app` deployment. If unavailable, the site still
builds but deliberately omits those absolute URLs; it never publishes an
invented or custom-domain hostname.

Do **not** copy any value from `.env`, `.env.local`, development database
configuration, Firebase settings, payment providers or mail providers into
Vercel. The marketing launch needs no application secret, database connection,
Firebase credential, payment key or `NEXT_PUBLIC_*` configuration.

## Operator procedure after deployment approval

1. Sign in to the intended Vercel team in the Vercel dashboard.
2. Create/import a project with `D:\vetthevat` as the project directory and
   confirm the framework is Next.js. Do not attach a custom domain.
3. Keep [`vercel.json`](../vercel.json) unchanged. Confirm the dashboard
   displays the install command `npm ci --ignore-scripts --no-audit --no-fund`
   and build command `npm run build`.
4. Set `VETTHEVAT_MARKETING_ONLY=1` for Preview and Production, then enable
   the system `VERCEL_URL` build variable. Do not add any secret values.
5. Review the generated `*.vercel.app` hostname. This is the only hostname
   approved for this temporary launch. Do not add `vetthevat.com`,
   `www.vetthevat.com`, Cloudflare DNS records or GoDaddy settings.
6. Before promoting any deployment, run the smoke checks below against that
   exact Vercel hostname. Stop if any private or auth route returns a page
   instead of `404`.

PowerShell smoke checks, replacing the placeholder after Vercel provides the
temporary hostname:

```powershell
$site = 'https://YOUR-PROJECT.vercel.app'
Invoke-WebRequest -UseBasicParsing "$site/" | Select-Object StatusCode
Invoke-WebRequest -UseBasicParsing "$site/pricing" | Select-Object StatusCode
Invoke-WebRequest -UseBasicParsing "$site/mobile-app" | Select-Object StatusCode
foreach ($path in '/app/dashboard', '/api/v1/invoices', '/login', '/register') {
  try { Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 "$site$path" -ErrorAction Stop; throw "Unexpected public route: $path" }
  catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -ne 404) { throw "Unexpected status for $path" } }
}
```

The Android button targets the verified official Google Play listing. No iOS
store link is published because it has not been verified. There are no real
checkout, email, signup, login, document upload or financial API flows.

## Validation completed locally

- `npm run typecheck` passed.
- `npm test` passed: 102 tests, 0 failures.
- `npm run build` passed.
- A second build passed with synthetic Vercel variables and
  `VETTHEVAT_MARKETING_ONLY=1`.
- Local runtime smoke checks returned `200` for `/`, `/pricing` and
  `/mobile-app`; `404` for `/app/dashboard`, `/api/v1/invoices`, `/login`,
  `/register` and `/forgot-password`.
- Homepage markup contained no demo labels or private navigation links.
- `robots.txt` denies indexing and `sitemap.xml` contains only public routes.
- `npm audit --json` and `npm audit --omit=dev --json` both reported zero
  vulnerabilities at the time of this review.

## Remaining launch gates

- Explicit operator approval before any Vercel project creation or deployment.
- Vercel account/team access and a review of its selected deployment target.
- Verify the final generated hostname and repeat the listed smoke checks.
- Legal approval and publication-ready content before linking privacy or terms.
- An exact, verified iOS App Store URL before adding an iOS download link.
- A visual mobile check in a real browser against the Vercel preview; no shared
  browser surface was available for this local review.

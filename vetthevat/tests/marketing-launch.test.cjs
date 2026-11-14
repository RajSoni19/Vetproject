const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Vercel preparation includes protected application and identity sources", () => {
  const rules=read(".vercelignore").split(/\r?\n/).map(line=>line.trim());
  for(const source of ["app/app","app/login","app/register","app/api/*","lib/server/*"]) assert.ok(!rules.includes(source),source);
  for(const secret of ["database",".env*","**/*.key","**/*credentials*.json",".auth-restoration"]) assert.ok(rules.includes(secret));
});

test("marketing gate stays enabled by environment, with reachable login setup", () => {
  assert.match(read("proxy.ts"),/VETTHEVAT_MARKETING_ONLY/);
  const policy=read("lib/server/private-routing.ts");
  assert.ok(policy.indexOf('identitySetupPages.includes')<policy.indexOf('if (marketingOnly)'));
  for(const route of ["/login","/register","/forgot-password","/reset-password","/verify-email","/onboarding"]) assert.ok(policy.includes(route));
});

test("temporary public metadata never points to the custom domain or private routes", () => {
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");
  assert.doesNotMatch(sitemap, /vetthevat\.co\.uk|\/login|\/register|\/app/);
  assert.match(robots, /disallow: "\/"/);
});

test("marketing metadata only uses a generated Vercel hostname when available", () => {
  const origin = read("lib/site-origin.ts");
  assert.match(origin, /return undefined/);
  assert.match(origin, /vercel\\\.app/);
  assert.match(origin, /VERCEL_PROJECT_PRODUCTION_URL/);
});

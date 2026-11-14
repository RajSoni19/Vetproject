const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const s = require("./uat-services.cjs");
const { assert, crypto, loadSource, operator, request } = s;

const origin = s.origin;
const cookieName = "__Host-vetthevat-session";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function londonToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function seedVerifiedCustomer() {
  const authCrypto = loadSource("lib/server/web-auth/crypto");
  const email = `dashboard-empty-${crypto.randomUUID()}@example.test`;
  const hash = await authCrypto.passwordHash(crypto.randomBytes(32).toString("base64url"));
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = authCrypto.tokenHash(token);
  const userId = await operator(async db => {
    const user = (await db.query(
      "INSERT INTO web_auth.users(full_name,email,password_hash,email_verified_at,status) VALUES('Disposable dashboard regression',$1,$2,now(),'active') RETURNING id::text",
      [email, hash]
    )).rows[0].id;
    await db.query(
      "INSERT INTO web_auth.sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
      [user, tokenHash]
    );
    return user;
  });
  return { userId, token, tokenHash, cookie: `${cookieName}=${token}` };
}

async function browserCheck(token, expectedRoute = "onboarding", companyId = "", companyLabel = "") {
  const certificate = new crypto.X509Certificate(fs.readFileSync(path.join(s.common.directory, "localhost.crt")));
  const pin = certificate.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vtv-dashboard-empty-"));
  const chrome = spawn(process.env.VET_VAT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "--ignore-certificate-errors-spki-list=" + pin,
    "--allow-insecure-localhost",
    "--disable-gpu",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "--no-first-run",
    "about:blank"
  ], { windowsHide: true, stdio: "ignore" });
  let socket;
  const failures = [];
  const exceptions = [];
  let session;
  let sequence = 0;
  const pending = new Map();
  try {
    let portFile;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        portFile = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").trim().split(/\r?\n/);
        break;
      } catch {
        await wait(100);
      }
    }
    assert.ok(portFile, "Isolated Chrome starts");
    socket = new WebSocket(`ws://127.0.0.1:${portFile[0]}${portFile[1]}`);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
      if (message.method === "Network.responseReceived" && message.params.response.status >= 500) {
        failures.push({ status: message.params.response.status, url: message.params.response.url });
      }
      if (pending.has(message.id)) {
        const result = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(result.timer);
        message.error ? result.reject(Error(message.error.message)) : result.resolve(message.result);
      }
    });
    const send = (method, params = {}, target = session) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`Browser timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }));
    });
    const target = await send("Target.createTarget", { url: "about:blank" }, null);
    session = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true }, null)).sessionId;
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Network.enable");
    await send("Network.setCookie", {
      name: cookieName,
      value: token,
      url: origin,
      secure: true,
      httpOnly: true,
      sameSite: "Strict"
    });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const navigate = async url => send("Page.navigate", { url });
    const waitFor = async (expression, label) => {
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await evaluate(expression)) return;
        await wait(100);
      }
      const state = await evaluate("JSON.stringify({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,1000)})");
      throw Error(`Timed out waiting for ${label}: ${state}`);
    };
    await navigate(`${origin}/app/dashboard`);
    if (expectedRoute === "onboarding") {
      await waitFor("location.pathname === '/app/companies'", "redirect to company setup");
      await waitFor("Boolean(document.querySelector('input[name=name]:not(:disabled)'))", "enabled company onboarding form");
      assert.equal(await evaluate("location.search"), "?setup=required");
    } else {
      await waitFor("location.pathname === '/app/dashboard'", "existing-company dashboard");
      await waitFor("Boolean(document.querySelector('#server-company'))", "authorized company selector");
      await evaluate(`(()=>{const select=document.querySelector('#server-company');select.value=${JSON.stringify(companyId)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(`document.querySelector('#server-company')?.value===${JSON.stringify(companyId)}`, "company selection persistence");
      await waitFor("Boolean(document.querySelector('[data-metric=\"invoiceCount\"]'))", "automatic dashboard analytics");
      if (companyLabel) {
        assert.equal(await evaluate("document.querySelector('#server-company').selectedOptions[0].textContent"), companyLabel);
      }
      assert.equal(await evaluate("document.querySelector('details')?.open"), false, "Advanced Filters start collapsed");
      assert.equal(await evaluate("document.querySelector('[name=startsOn]')?.closest('details')?.open"), false, "Manual date filters are inside collapsed Advanced Filters");
      const today = londonToday();
      const startOfMonth = `${today.slice(0, 7)}-01`;
      const range = (start, end) => `document.querySelector('[data-analytics-start]')?.dataset.analyticsStart===${JSON.stringify(start)}&&document.querySelector('[data-analytics-end]')?.dataset.analyticsEnd===${JSON.stringify(end)}`;
      await waitFor(range(startOfMonth, today), "automatic This Month analytics");
      const [year, month, day] = today.split("-").map(Number);
      const lastMonthStart = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
      const lastMonthEnd = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
      const last12Month = new Date(Date.UTC(year, month - 1 - 12, 1));
      const last12MaxDay = new Date(Date.UTC(last12Month.getUTCFullYear(), last12Month.getUTCMonth() + 1, 0)).getUTCDate();
      const last12Start = new Date(Date.UTC(last12Month.getUTCFullYear(), last12Month.getUTCMonth(), Math.min(day, last12MaxDay))).toISOString().slice(0, 10);
      for (const [value, start, end] of [
        ["last-month", lastMonthStart, lastMonthEnd],
        ["last-12-months", last12Start, today],
        ["all-time", "2000-01-01", today],
        ["this-month", startOfMonth, today]
      ]) {
        await evaluate(`document.querySelector('[data-period="${value}"]').click()`);
        await waitFor(range(start, end), `${value} analytics`);
      }
      await evaluate("document.querySelector('details summary').click()");
      assert.equal(await evaluate("document.querySelector('details')?.open"), true, "Advanced Filters can be opened");
      assert.equal(await evaluate("document.querySelector('[name=startsOn]')?.closest('details')?.open"), true, "Manual date filters are available when expanded");
    }
    assert.equal(await evaluate("document.body.innerText.includes(\"This page couldn't load\")"), false);
    assert.deepEqual(failures, []);
    assert.deepEqual(exceptions, []);
    await navigate(`${origin}${expectedRoute === "onboarding" ? "/app/companies" : "/app/dashboard"}`);
    await waitFor(
      expectedRoute === "onboarding"
        ? "Boolean(document.querySelector('input[name=name]:not(:disabled)'))"
        : `Boolean(document.querySelector('[data-metric="invoiceCount"]'))&&document.querySelector('#server-company')?.value===${JSON.stringify(companyId)}`,
      "session persistence after refresh"
    );
    assert.deepEqual(failures, []);
    assert.deepEqual(exceptions, []);
  } finally {
    socket?.close();
    if (chrome.pid && chrome.exitCode === null) {
      chrome.kill();
      await Promise.race([
        new Promise(resolve => chrome.once("exit", resolve)),
        wait(5000)
      ]);
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (error.code !== "EBUSY" || attempt === 19) throw error;
        await wait(250);
      }
    }
  }
}

async function main() {
  const identity = await seedVerifiedCustomer();
  let failure;
  try {
    const roles = await operator(async db => (await db.query(
      "SELECT array_agg(r.name) FILTER (WHERE r.name IS NOT NULL) AS roles FROM web_auth.user_roles ur JOIN web_auth.roles r ON r.id=ur.role_id WHERE ur.user_id=$1",
      [identity.userId]
    )).rows[0].roles);
    assert.ok(!roles?.includes("software_administrator"), "Disposable customer is not a platform administrator");
    const account = await request("/api/account/companies", { session: { cookie: identity.cookie } });
    assert.equal(account.status, 200);
    assert.deepEqual(account.body.companies, []);
    assert.equal(account.body.onboardingEnabled, true);

    const dashboard = await request("/app/dashboard", {
      session: { cookie: identity.cookie },
      headers: { accept: "text/html" }
    });
    assert.ok(
      [200, 307, 308].includes(dashboard.status),
      `Unexpected dashboard response: ${dashboard.status}`
    );
    if (dashboard.status !== 200) {
      assert.equal(dashboard.headers.location, "/app/companies?setup=required");
    }

    const onboarding = await request("/app/companies", {
      session: { cookie: identity.cookie },
      headers: { accept: "text/html" }
    });
    assert.equal(onboarding.status, 200);
    await browserCheck(identity.token);

    await s.resetLoginFixture("Customer");
    const existing = await s.login("Customer");
    const existingToken = existing.cookie.slice(`${cookieName}=`.length);
    const memberships = await request("/api/account/companies", { session: existing });
    const membership = memberships.body.companies.find(company => company.id === existing.companyId);
    assert.ok(membership, "Selected company membership is available");
    await browserCheck(existingToken, "dashboard", existing.companyId, `${membership.name} · ${membership.role}`);
    console.log("PASS empty-company customer redirects to onboarding; existing company customer dashboard analytics and selected-company session persist; no HTTP 5xx or browser exceptions");
  } catch (error) {
    failure = error;
  } finally {
    await operator(async db => {
      await db.query("DELETE FROM web_auth.audit_logs WHERE actor_user_id=$1", [identity.userId]);
      await db.query("DELETE FROM web_auth.sessions WHERE user_id=$1", [identity.userId]);
      const deleted = await db.query("DELETE FROM web_auth.users WHERE id=$1", [identity.userId]);
      assert.equal(deleted.rowCount, 1, "Disposable regression identity is removed");
    });
  }
  if (failure) throw failure;
}

main().catch(error => {
  console.error(`Empty-company dashboard regression failed: ${error.message}`);
  process.exitCode = 1;
});

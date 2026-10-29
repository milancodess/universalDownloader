const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const { before, after, test } = require("node:test");
const app = require("../index");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test("importing the app exports a handler and exits without opening a listener", () => {
  execFileSync(process.execPath, ["-e", 'require("node:assert/strict").equal(typeof require("./index"), "function")'], {
    cwd: path.join(__dirname, ".."),
    timeout: 10000,
  });
});

test("root advertises every platform and preserves CORS", async () => {
  const response = await fetch(baseUrl);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(body.success, true);
  assert.equal(body.endpoints.length, 18);
  assert.equal(new Set(body.endpoints).size, 18);
  for (const endpoint of body.endpoints) {
    const missing = await fetch(`${baseUrl}${endpoint}/download`);
    assert.equal(missing.status, 400, endpoint);
    assert.equal((await missing.json()).success, false, endpoint);
  }
});

test("Express query arrays and objects are rejected before downloading", async () => {
  for (const query of ["url=https://example.com&url=https://example.org", "url[value]=https://example.com"]) {
    const response = await fetch(`${baseUrl}/api/youtube/download?${query}`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
});

test("unknown routes return JSON 404", async () => {
  const response = await fetch(`${baseUrl}/does-not-exist`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { success: false, error: "Endpoint not found" });
});

test("malformed route parameter encoding returns a client error", async () => {
  const response = await fetch(`${baseUrl}/api/files/%E0%A4%A`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, error: "Invalid URL encoding" });
});

test("browser interface and its scripts are served with restrictive security headers", async () => {
  const page = await fetch(`${baseUrl}/app`);
  assert.equal(page.status, 200);
  assert.equal(page.url, `${baseUrl}/app/`);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(page.headers.get("content-security-policy"), /img-src 'self' https:/);
  assert.match(page.headers.get("content-security-policy"), /media-src 'self' https:/);
  assert.match(page.headers.get("content-security-policy"), /font-src 'self'/);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(await page.text(), /id="download-form"/);
  for (const asset of ["app.js", "media.js", "theme.js", "styles.css", "fonts/Manrope.ttf", "fonts/Sora.ttf", "assets/nasa-example.jpg", "assets/big-buck-bunny.jpg"]) {
    const response = await fetch(`${baseUrl}/app/${asset}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  const traversal = await fetch(`${baseUrl}/app/%2e%2e%2fpackage.json`);
  assert.equal(traversal.status, 404);
});

test("invalid PORT values fail clearly instead of creating a named pipe", () => {
  for (const port of ["named-pipe", "65536", "-1", "3000junk"]) {
    assert.throws(() => execFileSync(process.execPath, ["index.js"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, PORT: port },
      timeout: 10000,
      stdio: "pipe",
    }), (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), /PORT must be a number/);
      return true;
    });
  }
});

test("malformed JSON is a client error without parser details", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"secret":',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, error: "Invalid JSON body" });
});

test("oversized JSON preserves the payload-too-large status", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(110 * 1024) }),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { success: false, error: "Request body too large" });
});

test("unsupported JSON charsets retain their 415 client error", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=iso-8859-1" },
    body: "{}",
  });
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { success: false, error: "Unsupported request charset" });
});

test("unsupported body encodings retain their 415 client error", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "content-encoding": "unsupported" },
    body: "{}",
  });
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { success: false, error: "Unsupported content encoding" });
});

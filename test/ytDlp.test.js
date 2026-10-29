const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { createExtractor, buildArgs, extractionError } = require("../lib/ytDlp");

const sample = "https://www.youtube.com/watch?v=gHKT4uU8Zng";
function harness(options = {}) {
  const children = [];
  const stopped = [];
  const run = createExtractor({
    getPath: () => "/trusted/yt-dlp", exists: () => true,
    spawnProcess: (file, args, config) => {
      assert.equal(file, "/trusted/yt-dlp");
      assert.equal(config.shell, false);
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      children.push({ child, args });
      return child;
    },
    stop: (child) => { stopped.push(child); queueMicrotask(() => child.emit("close", null)); }, ...options,
  });
  return { run, children, stopped };
}

test("extractor arguments exclude configuration, plugins, playlists, and shell interpolation", () => {
  const url = `${sample}&x=$(echo secret)`;
  const args = buildArgs(url, "youtube");
  assert.deepEqual(args.slice(-2), ["--", url]);
  for (const flag of ["--ignore-config", "--no-plugin-dirs", "--no-playlist", "--no-js-runtimes", "--dump-single-json"]) assert.ok(args.includes(flag));
  assert.ok(args.includes(`node:${process.execPath}`));
  assert.equal(args[args.indexOf("--format") + 1], "bv[protocol=https]+ba[protocol=https]/b[protocol=https]");
  assert.equal(args.includes("--ignore-no-formats-error"), false);
  assert.ok(buildArgs("https://www.instagram.com/p/Example/", "Instagram").includes("--ignore-no-formats-error"));
  for (const extractor of ["soundcloud", "TikTok"]) {
    const providerArgs = buildArgs("https://example.com/public-media", extractor);
    assert.equal(providerArgs[providerArgs.indexOf("--use-extractors") + 1], extractor);
    assert.ok(providerArgs.includes("--ignore-config") && providerArgs.includes("--no-plugin-dirs"));
    assert.ok(!providerArgs.includes("--cookies") && !providerArgs.includes("--cookies-from-browser"));
  }
  assert.throws(() => buildArgs(sample, "generic"), /Unsupported extractor/);
});

test("extractor parses JSON and rejects unavailable runtime before spawning", async () => {
  const { run, children } = harness();
  const result = run(sample, { extractor: "youtube" });
  children[0].child.stdout.end(JSON.stringify({ id: "gHKT4uU8Zng", formats: [] }));
  children[0].child.emit("close", 0);
  assert.deepEqual(await result, { id: "gHKT4uU8Zng", formats: [] });
  const missing = harness({ exists: () => false });
  await assert.rejects(missing.run(sample, { extractor: "youtube" }), { code: "DOWNLOADER_MISSING", statusCode: 503 });
  assert.equal(missing.children.length, 0);
});

test("extractor deadlines and client cancellation stop the subprocess", async () => {
  const timed = harness({ timeout: 15 });
  await assert.rejects(timed.run(sample, { extractor: "youtube" }), { code: "ETIMEDOUT", statusCode: 504 });
  assert.equal(timed.stopped.length, 1);
  const cancelled = harness();
  const controller = new AbortController();
  const result = cancelled.run(sample, { extractor: "youtube", signal: controller.signal });
  controller.abort();
  await assert.rejects(result, { code: "REQUEST_CANCELLED" });
  assert.equal(cancelled.stopped.length, 1);
});

test("extractor bounds metadata and does not disclose stderr secrets", async () => {
  const limited = harness();
  const oversized = limited.run(sample, { extractor: "youtube" });
  limited.children[0].child.stdout.write(Buffer.alloc(8 * 1024 * 1024 + 1));
  await assert.rejects(oversized, { code: "METADATA_TOO_LARGE" });
  const failed = harness();
  const result = failed.run(sample, { extractor: "youtube" });
  failed.children[0].child.stderr.write("Some unexpected error https://provider.example?secret=token");
  failed.children[0].child.emit("close", 1);
  await assert.rejects(result, (error) => error.code === "UPSTREAM_ERROR" && !error.message.includes("secret"));
  assert.equal(extractionError("Sign in to confirm you're not a bot").code, "MEDIA_RESTRICTED");
  assert.equal(extractionError("Video unavailable").code, "MEDIA_UNAVAILABLE");
});

test("extractor limits simultaneous processes and releases slots after completion", async () => {
  const { run, children } = harness();
  const pending = Array.from({ length: 3 }, () => run(sample, { extractor: "youtube" }));
  await assert.rejects(run(sample, { extractor: "youtube" }), { code: "DOWNLOADER_BUSY" });
  for (const { child } of children) { child.stdout.end('{"id":"ok"}'); child.emit("close", 0); }
  await Promise.all(pending);
  const again = run(sample, { extractor: "youtube" });
  children[3].child.stdout.end('{"id":"ok"}');
  children[3].child.emit("close", 0);
  await again;
});

test("cancelled extractors retain their slots until the processes actually close", async () => {
  const { run, children } = harness({ stop: () => {} });
  const controller = new AbortController();
  const pending = Array.from({ length: 3 }, () => run(sample, { extractor: "youtube", signal: controller.signal }));
  const rejected = pending.map((promise) => assert.rejects(promise, { code: "REQUEST_CANCELLED" }));
  controller.abort();
  await assert.rejects(run(sample, { extractor: "youtube" }), { code: "DOWNLOADER_BUSY" });
  assert.equal(children.length, 3);
  for (const { child } of children) child.emit("close", null);
  await Promise.all(rejected);
  const again = run(sample, { extractor: "youtube" });
  children[3].child.stdout.end('{"id":"ok"}');
  children[3].child.emit("close", 0);
  await again;
});

test("extractor startup failure rejects after close and releases its slot", async () => {
  const { run, children } = harness();
  const failed = run(sample, { extractor: "youtube" });
  const rejected = assert.rejects(failed, { code: "DOWNLOADER_START_FAILED", statusCode: 503 });
  children[0].child.emit("error", new Error("ENOENT"));
  await rejected;
  const next = run(sample, { extractor: "youtube" });
  children[1].child.stdout.end('{"id":"ok"}');
  children[1].child.emit("close", 0);
  await next;
});

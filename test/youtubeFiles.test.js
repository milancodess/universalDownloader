const assert = require("node:assert/strict");
const { test } = require("node:test");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { createYouTubeJobManager } = require("../lib/youtubeJobs");
const { createYouTubeFileRouter } = require("../routes/youtubeFiles");

const SOURCE_ID = "aqz-KE-bpKQ";
const bytes = Buffer.alloc(4096, 11);
bytes.write("ftyp", 4);
const spec = { sourceUrl: `https://www.youtube.com/watch?v=${SOURCE_ID}`, videoId: SOURCE_ID,
  videoFormatId: "299", audioFormatId: "140", width: 1920, height: 1080,
  videoCodec: "avc1", audioCodec: "mp4a.40.2", filename: "Movie — 1080p.mp4", estimatedBytes: 4096 };

async function fixture(t, options = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "universal-youtube-routes-"));
  // A hidden ancestor matches the real .runtime cache and must not hide the file.
  const root = path.join(temporary, ".runtime", "youtube-cache");
  const manager = createYouTubeJobManager({ root, checkDisk: false, checkRuntime: async () => {},
    run: async (metadata, { directory }) => {
      const file = path.join(directory, "media.mp4");
      await fs.writeFile(file, bytes);
      return { path: file, width: metadata.width, height: metadata.height, fps: 60,
        videoCodec: "h264", audioCodec: "aac", duration: 5 };
    }, ...options,
  });
  const app = express();
  app.use("/api/files", createYouTubeFileRouter({ manager }));
  app.get("/api/files/:id", (req, res) => req.params.id === "direct-reference"
    ? res.json({ directProviderFallback: true }) : res.status(404).json({ success: false, fallback: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await manager.close();
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith("universal-youtube-routes-"));
    await fs.rm(temporary, { recursive: true, force: true });
  });
  const link = manager.createLink(spec);
  return { manager, base, link, id: link.split("/").at(-1) };
}

test("HD HTTP lifecycle reports idle, requires preparation, and serves a complete attachment", async (t) => {
  const { manager, base, link, id } = await fixture(t);
  const status = await fetch(base + link + "/status");
  assert.equal(status.status, 200);
  assert.equal((await status.json()).data.state, "idle");
  const early = await fetch(base + link);
  assert.equal(early.status, 409);
  assert.match((await early.json()).error, /Prepare.*first/);
  const preparing = await fetch(base + link + "/prepare", { method: "POST", headers: { Origin: base } });
  assert.equal(preparing.status, 200);
  assert.equal((await preparing.json()).success, true);
  await manager.get(id).promise;
  const ready = await fetch(base + link + "/status");
  const payload = await ready.json();
  assert.equal(payload.data.state, "ready");
  assert.equal(payload.data.width, 1920);
  assert.equal(payload.data.height, 1080);
  assert.equal(payload.data.audioCodec, "aac");
  assert.equal("path" in payload.data, false);
  const file = await fetch(base + link);
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition"), /^attachment;/);
  assert.match(file.headers.get("content-type"), /^video\/mp4/);
  assert.equal(file.headers.get("content-length"), String(bytes.length));
  assert.equal(file.headers.get("cache-control"), "no-store");
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
  assert.equal(manager.get(id).readers, 0);
});

test("prepared HD files support byte ranges and reject unsatisfiable ranges", async (t) => {
  const { manager, base, link, id } = await fixture(t);
  await manager.start(id);
  await manager.get(id).promise;
  const range = await fetch(base + link, { headers: { Range: "bytes=32-63" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), `bytes 32-63/${bytes.length}`);
  assert.equal(range.headers.get("content-length"), "32");
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(32, 64));
  const head = await fetch(base + link, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const invalid = await fetch(base + link, { headers: { Range: `bytes=${bytes.length + 1}-` } });
  assert.equal(invalid.status, 416);
  await invalid.arrayBuffer();
});

test("HD prepare and cancellation reject cross-origin browser mutations while allowing same-origin and CLI calls", async (t) => {
  const { manager, base, link, id } = await fixture(t);
  for (const method of ["POST", "DELETE"]) {
    for (const headers of [{ Origin: "https://unrelated.example" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }]) {
      const response = await fetch(base + link + "/prepare", { method, headers });
      assert.equal(response.status, 403);
      assert.match((await response.json()).error, /own page/);
    }
  }
  assert.equal(manager.status(id).state, "idle");
  const cli = await fetch(base + link + "/prepare", { method: "POST" });
  assert.equal(cli.status, 200);
  await cli.arrayBuffer();
  await manager.get(id).promise;
  assert.equal(manager.status(id).state, "ready");
});

test("configured public origin supports TLS proxies without trusting forwarded headers", async (t) => {
  const manager = { start: () => ({ state: "queued" }), cancel: () => ({ state: "cancelled" }) };
  for (const publicOrigin of [undefined, "https://downloads.example.com/"]) {
    const app = express();
    app.use("/api/files", createYouTubeFileRouter({ manager, publicOrigin }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const method of ["POST", "DELETE"]) {
      for (const origin of ["https://downloads.example.com", "https://attacker.example"]) {
        const response = await fetch(base + "/api/files/id/prepare", {
          method, headers: { Origin: origin, "X-Forwarded-Proto": "https", "X-Forwarded-Host": new URL(origin).host },
        });
        assert.equal(response.status, publicOrigin && origin === "https://downloads.example.com" ? 200 : 403);
        await response.arrayBuffer();
      }
      const cli = await fetch(base + "/api/files/id/prepare", { method });
      assert.equal(cli.status, 200);
      await cli.arrayBuffer();
    }
  }
});

test("public origin configuration rejects credentials, non-HTTP schemes and paths", () => {
  for (const publicOrigin of ["not a URL", "ftp://downloads.example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com/?query=1", "https://example.com/#hash"]) {
    assert.throws(() => createYouTubeFileRouter({ publicOrigin }), /APP_ORIGIN must be/);
  }
});

test("HD status and prepare reject unknown IDs while direct media references fall through", async (t) => {
  const { base } = await fixture(t);
  for (const [method, suffix] of [["GET", "/status"], ["POST", "/prepare"], ["DELETE", "/prepare"]]) {
    const response = await fetch(base + "/api/files/unknown" + suffix, { method });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).success, false);
  }
  const direct = await fetch(base + "/api/files/direct-reference");
  assert.deepEqual(await direct.json(), { directProviderFallback: true });
  const missing = await fetch(base + "/api/files/unknown");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).fallback, true);
});

test("HD cancellation stops active preparation and leaves no downloadable partial file", async (t) => {
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const { manager, base, link, id } = await fixture(t, { run: async (metadata, { directory, signal }) => {
    await fs.writeFile(path.join(directory, "partial.video"), "partial");
    started();
    await new Promise((resolve, reject) => {
      if (signal.aborted) reject(new Error("cancelled"));
      else signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    });
  } });
  const prepare = await fetch(base + link + "/prepare", { method: "POST" });
  assert.equal(prepare.status, 200);
  await prepare.arrayBuffer();
  await entered;
  const cancellation = await fetch(base + link + "/prepare", { method: "DELETE", headers: { Origin: base } });
  assert.equal(cancellation.status, 200);
  assert.equal((await cancellation.json()).data.state, "cancelled");
  assert.equal(manager.status(id).state, "cancelled");
  const file = await fetch(base + link);
  assert.equal(file.status, 409);
  assert.match((await file.json()).error, /cancelled/i);
});

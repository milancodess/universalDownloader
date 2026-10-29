const assert = require("node:assert/strict");
const { once } = require("node:events");
const http = require("node:http");
const { gzipSync } = require("node:zlib");
const { test } = require("node:test");
const client = require("../lib/httpClient");

async function serve(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("upstream metadata can be fetched normally", { timeout: 5000 }, async (t) => {
  const url = await serve(t, (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: "https://cdn.example/video.mp4" }));
  });
  const response = await client.get(url, { proxy: false });
  assert.deepEqual(response.data, { url: "https://cdn.example/video.mp4" });
});

test("a stalled provider is aborted with a recognizable timeout", { timeout: 5000 }, async (t) => {
  const url = await serve(t, () => {});
  await assert.rejects(client.get(url, { timeout: 100, proxy: false }), (error) => {
    assert.ok(["ETIMEDOUT", "ECONNABORTED"].includes(error.code));
    return true;
  });
});

test("a slow response cannot extend the absolute request deadline", { timeout: 5000 }, async (t) => {
  const url = await serve(t, (req, res) => {
    res.write("first chunk");
    const timer = setInterval(() => res.write("more"), 10);
    res.on("close", () => clearInterval(timer));
  });
  await assert.rejects(client.get(url, { timeout: 150, proxy: false }), { code: "ETIMEDOUT" });
});

test("caller cancellation is preserved instead of reported as a timeout", { timeout: 5000 }, async (t) => {
  const url = await serve(t, () => {});
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.get(url, { signal: controller.signal, proxy: false }), { code: "ERR_CANCELED" });
});

test("oversized responses are rejected, including compressed data", { timeout: 5000 }, async (t) => {
  const data = "x".repeat(5 * 1024 * 1024 + 1);
  const url = await serve(t, (req, res) => {
    if (req.url === "/gzip") {
      res.setHeader("content-encoding", "gzip");
      res.end(gzipSync(data));
    } else {
      res.end(data);
    }
  });
  for (const pathname of ["/plain", "/gzip"]) {
    await assert.rejects(client.get(url + pathname, { proxy: false }), /maxContentLength/);
  }
});

test("redirect loops are bounded", { timeout: 5000 }, async (t) => {
  let requests = 0;
  const url = await serve(t, (req, res) => {
    requests += 1;
    res.writeHead(302, { location: "/again" });
    res.end();
  });
  await assert.rejects(client.get(url, { proxy: false }), { code: "ERR_FR_TOO_MANY_REDIRECTS" });
  assert.equal(requests, 6);
});

test("oversized request bodies are rejected", { timeout: 5000 }, async (t) => {
  const url = await serve(t, (req, res) => res.end("unexpected"));
  await assert.rejects(client.post(url, "x".repeat(1024 * 1024 + 1), { proxy: false }), /maxBodyLength/);
});

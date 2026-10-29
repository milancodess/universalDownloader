const assert = require("node:assert/strict");
const { test } = require("node:test");
const { runWorker } = require("../lib/runWorker");

function script(code) {
  return new URL(`data:text/javascript,${encodeURIComponent(code)}`);
}

test("worker runner returns data and terminates leftover provider timers", async () => {
  const result = await runWorker(script(`
    import { parentPort, workerData } from 'node:worker_threads';
    setInterval(() => {}, 1000);
    parentPort.postMessage({ url: workerData });
  `), "https://example.com/media", { timeout: 5000 });
  assert.deepEqual(result, { url: "https://example.com/media" });
});

test("worker runner terminates hung work and classifies it as a timeout", async () => {
  await assert.rejects(runWorker(script("while (true) {}"), null, { timeout: 100 }), {
    code: "ETIMEDOUT",
  });
});

test("worker runner propagates worker failures without crashing the server", async () => {
  await assert.rejects(runWorker(script("throw new Error('provider failed')"), null, { timeout: 5000 }),
    /provider failed/);
});

test("worker runner rejects a worker that exits without a result", async () => {
  await assert.rejects(runWorker(script("process.exit(0)"), null, { timeout: 5000 }),
    /exited without a result/);
});

test("worker runner rejects pre-cancelled work without starting a worker", async () => {
  const signal = AbortSignal.abort();
  // This filename would fail worker construction if cancellation were ignored.
  await assert.rejects(runWorker("invalid-relative-worker", null, { signal }), { name: "AbortError" });
});

test("worker runner terminates active work on caller cancellation", { timeout: 5000 }, async () => {
  const controller = new AbortController();
  const state = new Int32Array(new SharedArrayBuffer(4));
  const pending = runWorker(script(`
    import { workerData } from 'node:worker_threads';
    const state = new Int32Array(workerData);
    while (true) Atomics.add(state, 0, 1);
  `), state.buffer, { timeout: 4000, signal: controller.signal });
  while (Atomics.load(state, 0) === 0) await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const stoppedAt = Atomics.load(state, 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(Atomics.load(state, 0), stoppedAt);
});

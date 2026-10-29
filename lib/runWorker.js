const { Worker } = require("node:worker_threads");

// Use a terminable worker for dependencies that do not expose cancellation.
// Termination also closes their sockets and timers before settling the request.
function runWorker(filename, workerData, { timeout = 15000, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new DOMException("The request was cancelled", "AbortError"));
    const worker = new Worker(filename, {
      workerData,
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    let settled = false;
    const timer = setTimeout(() => {
      finish(Object.assign(new Error("Upstream worker timed out"), { code: "ETIMEDOUT" }));
    }, timeout);

    async function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      try {
        await worker.terminate();
      } catch (terminationError) {
        error ||= terminationError;
      }
      if (error) reject(error);
      else resolve(result);
    }

    const onAbort = () => finish(signal.reason || new DOMException("The request was cancelled", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (result) => finish(null, result));
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      finish(new Error(`Upstream worker exited without a result (code ${code})`));
    });
  });
}

module.exports = { runWorker };

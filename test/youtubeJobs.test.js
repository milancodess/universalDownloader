const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createYouTubeJobManager, validateSpec, MAX_FILE_BYTES } = require("../lib/youtubeJobs");

const ID = "aqz-KE-bpKQ";
const specification = (overrides = {}) => ({
  sourceUrl: `https://www.youtube.com/watch?v=${ID}`, videoId: ID,
  videoFormatId: "299", audioFormatId: "140", width: 1920, height: 1080, fps: 60,
  videoCodec: "avc1.64002A", audioCodec: "mp4a.40.2", filename: "example-1080p.mp4",
  estimatedBytes: 2048, ...overrides,
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function completeFile(spec, { directory, onProgress }, overrides = {}) {
  onProgress?.({ state: "merging", progress: null });
  const target = path.join(directory, "media.mp4");
  const bytes = Buffer.alloc(2048, 7);
  bytes.write("ftyp", 4);
  await fs.writeFile(target, bytes);
  return { path: target, width: spec.width, height: spec.height, fps: 60,
    videoCodec: "h264", audioCodec: "aac", duration: 5, ...overrides };
}
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "universal-youtube-jobs-"));
  const manager = createYouTubeJobManager({ root, run: completeFile, checkRuntime: async () => {}, checkDisk: false, ...options });
  t.after(async () => {
    await manager.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("universal-youtube-jobs-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, manager, create: (overrides) => manager.createLink(specification(overrides)).split("/").at(-1) };
}
async function finish(manager, id) {
  await manager.start(id);
  await manager.get(id).promise;
  return manager.status(id);
}

test("HD jobs accept only a canonical YouTube source and bounded exact format identifiers", () => {
  const valid = validateSpec(specification({ filename: "../a:bad?name.mp4" }));
  assert.equal(valid.filename, ".._a_bad_name.mp4");
  assert.equal(Object.isFrozen(valid), true);
  for (const change of [
    { sourceUrl: "https://evil.example/watch?v=" + ID }, { sourceUrl: `https://youtube.com/watch?v=${ID}&extra=1` },
    { videoId: "../unsafe" }, { videoFormatId: "299+140" }, { audioFormatId: "140/../secret" },
    { audioFormatId: "299" }, { videoFormatId: "x".repeat(41) },
    { width: 0 }, { height: 4320 }, { height: 1080.5 }, { width: 9000 },
  ]) assert.throws(() => validateSpec(specification(change)), { code: "INVALID_MERGE_FORMAT" });
  assert.throws(() => validateSpec(specification({ estimatedBytes: MAX_FILE_BYTES + 1 })), { code: "MERGE_TOO_LARGE", statusCode: 413 });
});

test("duplicate HD prepare calls run once and only expose a verified local file after completion", async (t) => {
  const entered = deferred();
  const release = deferred();
  let runs = 0;
  const { manager, create } = await fixture(t, { run: async (spec, context) => {
    runs++;
    context.onProgress({ state: "downloading", progress: 52, downloadedBytes: 1024, totalBytes: 2048 });
    entered.resolve();
    await release.promise;
    return completeFile(spec, context);
  } });
  const id = create();
  assert.equal(manager.lease(id), null);
  await Promise.all([manager.start(id), manager.start(id), manager.start(id)]);
  await entered.promise;
  assert.equal(runs, 1);
  assert.equal(manager.status(id).progress, 52);
  assert.equal(manager.lease(id), null);
  release.resolve();
  await manager.get(id).promise;
  const state = manager.status(id);
  assert.equal(state.state, "ready");
  assert.equal(state.sizeBytes, 2048);
  assert.equal(state.audioCodec, "aac");
  assert.equal(state.height, 1080);
  assert.equal(state.progress, 100);
  assert.equal("path" in state, false);
  assert.equal("sourceUrl" in state, false);
  const lease = manager.lease(id);
  assert.equal(path.basename(lease.path), "media.mp4");
  assert.equal((await fs.stat(lease.path)).size, 2048);
  lease.release();
  lease.release();
  await manager.start(id);
  assert.equal(runs, 1);
  assert.equal(manager.get(id).readers, 0);
});

test("rediscovered formats reuse active and ready preparations without extending their cache lifetime", async (t) => {
  let time = 1000;
  let runs = 0;
  const entered = deferred();
  const release = deferred();
  const { manager, create } = await fixture(t, { now: () => time, ttlMs: 100,
    run: async (spec, context) => {
      runs++;
      entered.resolve();
      await Promise.race([release.promise, new Promise((resolve, reject) => {
        if (context.signal.aborted) return reject(new Error("cancelled"));
        context.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      })]);
      return completeFile(spec, context);
    },
  });
  const id = create();
  assert.notEqual(create(), id, "unused format links are independent");
  await manager.start(id);
  await entered.promise;
  assert.equal(create(), id, "metadata refresh reuses the running preparation");
  release.resolve();
  await manager.get(id).promise;
  const expiresAt = manager.status(id).expiresAt;
  time += 10;
  assert.equal(create(), id, "metadata refresh reuses the verified output");
  assert.equal(manager.status(id).expiresAt, expiresAt);
  assert.notEqual(create({ videoFormatId: "137" }), id);
  assert.notEqual(create({ audioFormatId: "139" }), id);
  assert.notEqual(create({ width: 3840, height: 2160 }), id);
  assert.notEqual(create({ videoId: "BaW_jenozKc", sourceUrl: "https://www.youtube.com/watch?v=BaW_jenozKc" }), id);
  time = expiresAt + 1;
  assert.notEqual(create(), id, "expired output cannot be reused");
  assert.equal(runs, 1);
});

test("HD queue bounds work, cancellation removes partial files, and a cancelled job can be retried", async (t) => {
  const entered = deferred();
  let runs = 0;
  let allowCompletion = false;
  const { root, manager, create } = await fixture(t, { maxActive: 1, maxQueued: 1,
    run: async (spec, context) => {
      runs++;
      if (allowCompletion) return completeFile(spec, context);
      await fs.writeFile(path.join(context.directory, "partial.video"), "partial");
      entered.resolve();
      await new Promise((resolve, reject) => {
        if (context.signal.aborted) return reject(new Error("cancelled"));
        context.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    },
  });
  const activeId = create();
  const queuedId = create();
  const rejectedId = create();
  await manager.start(activeId);
  await entered.promise;
  const repeatedQueueRequests = await Promise.all([manager.start(queuedId), manager.start(queuedId)]);
  assert.deepEqual(repeatedQueueRequests.map((state) => state.state), ["queued", "queued"]);
  await assert.rejects(manager.start(rejectedId), { code: "MERGE_BUSY", statusCode: 503 });
  assert.equal((await manager.cancel(queuedId)).state, "cancelled");
  assert.equal(runs, 1);
  assert.equal((await manager.cancel(activeId)).state, "cancelled");
  await assert.rejects(fs.stat(path.join(root, activeId)), { code: "ENOENT" });
  allowCompletion = true;
  assert.equal((await finish(manager, activeId)).state, "ready");
  assert.equal(runs, 2);
});

test("HD preparation deadlines abort the worker and clean up incomplete files", async (t) => {
  let aborted = false;
  const { root, manager, create } = await fixture(t, { timeoutMs: 200,
    run: async (spec, context) => {
      await fs.writeFile(path.join(context.directory, "partial.audio"), "partial");
      await new Promise((resolve, reject) => {
        const abort = () => { aborted = true; reject(new Error("deadline")); };
        if (context.signal.aborted) abort();
        else context.signal.addEventListener("abort", abort, { once: true });
      });
    },
  });
  const id = create();
  const state = await finish(manager, id);
  assert.equal(state.state, "failed");
  assert.match(state.error, /too long/i);
  assert.equal(aborted, true);
  assert.equal(manager.lease(id), null);
  await assert.rejects(fs.stat(path.join(root, id)), { code: "ENOENT" });
});

test("cancellation during the final file check prevents publication and cleans up the output", async (t) => {
  const { root, manager, create } = await fixture(t);
  const id = create();
  const destination = path.join(root, id, "media.mp4");
  const checking = deferred();
  const release = deferred();
  const originalLstat = fs.lstat;
  t.mock.method(fs, "lstat", async (target, ...args) => {
    const stat = await originalLstat(target, ...args);
    if (target === destination) {
      checking.resolve();
      await release.promise;
    }
    return stat;
  });
  let cancellation;
  try {
    await manager.start(id);
    await checking.promise;
    cancellation = manager.cancel(id);
    assert.equal(manager.get(id).controller.signal.aborted, true);
    assert.equal(manager.lease(id), null);
  } finally {
    release.resolve();
  }
  assert.equal((await cancellation).state, "cancelled");
  assert.equal(manager.status(id).state, "cancelled");
  assert.equal(manager.lease(id), null);
  await assert.rejects(fs.stat(path.join(root, id)), { code: "ENOENT" });
});

test("HD jobs reject wrong dimensions or missing audio/video instead of publishing incomplete media", async (t) => {
  let invalid = {};
  const { root, manager, create } = await fixture(t, { run: (spec, context) => completeFile(spec, context, invalid) });
  for (invalid of [{ height: 360 }, { width: 1280 }, { audioCodec: "" }, { audioCodec: "none" }, { audioCodec: "   " }, { videoCodec: "none" }]) {
    const id = create();
    const state = await finish(manager, id);
    assert.equal(state.state, "failed", JSON.stringify(invalid));
    assert.equal(manager.lease(id), null);
    await assert.rejects(fs.stat(path.join(root, id)), { code: "ENOENT" });
  }
});

test("HD jobs reject a worker path outside its generated directory and leave unrelated files alone", async (t) => {
  let outside;
  const { root, manager, create } = await fixture(t, { run: async (spec, context) => {
    await fs.writeFile(outside, "keep this unrelated file");
    return completeFile(spec, context, { path: outside });
  } });
  outside = path.join(root, "keep.txt");
  const id = create();
  assert.equal((await finish(manager, id)).state, "failed");
  assert.equal(await fs.readFile(outside, "utf8"), "keep this unrelated file");
  assert.equal(manager.get("../keep.txt"), null);
  assert.equal(manager.lease("../keep.txt"), null);
  await assert.rejects(manager.start("../keep.txt"), { code: "JOB_EXPIRED" });
});

test("HD expiry respects active file leases and removes the cache after readers release it", async (t) => {
  let time = 1000;
  const { manager, create } = await fixture(t, { now: () => time, ttlMs: 100 });
  const id = create();
  await finish(manager, id);
  const lease = manager.lease(id);
  time += 101;
  assert.equal(manager.status(id), null);
  await manager.prune();
  assert.equal((await fs.stat(lease.path)).size, 2048);
  lease.release();
  await manager.prune();
  await assert.rejects(fs.stat(lease.path), { code: "ENOENT" });
});

test("HD cache evicts older completed jobs when its byte budget is exceeded", async (t) => {
  let time = 1000;
  const { manager, create } = await fixture(t, { now: () => time, maxCacheBytes: 2048 });
  const first = create();
  await finish(manager, first);
  time += 10;
  const second = create({ videoFormatId: "137" });
  await finish(manager, second);
  await manager.prune();
  assert.equal(manager.status(first), null);
  assert.equal(manager.status(second).state, "ready");
});

test("closing the HD manager while runtime validation is pending cannot enqueue new work", async (t) => {
  const checked = deferred();
  const { manager, create } = await fixture(t, { checkRuntime: () => checked.promise });
  const id = create();
  const starting = manager.start(id);
  const rejected = assert.rejects(starting, { statusCode: 503 });
  await manager.close();
  checked.resolve();
  await rejected;
  assert.notEqual(manager.status(id)?.state, "queued");
  assert.throws(() => create(), { statusCode: 503 });
});

test("cancelling during runtime validation prevents a delayed preparation from starting", async (t) => {
  const checked = deferred();
  let runs = 0;
  const { manager, create } = await fixture(t, {
    checkRuntime: () => checked.promise,
    run: async (spec, context) => { runs++; return completeFile(spec, context); },
  });
  const id = create();
  const starting = manager.start(id);
  assert.equal((await manager.cancel(id)).state, "cancelled");
  checked.resolve();
  assert.equal((await starting).state, "cancelled");
  assert.equal(runs, 0);
  assert.equal((await finish(manager, id)).state, "ready");
  assert.equal(runs, 1);
});

test("a runtime check cannot start an evicted or expired job", async (t) => {
  for (const mode of ["evicted", "expired"]) {
    const checked = deferred();
    let time = 1000;
    let runs = 0;
    const { manager, create } = await fixture(t, {
      maxJobs: 1, now: () => time, ttlMs: 100, checkRuntime: () => checked.promise,
      run: async (spec, context) => { runs++; return completeFile(spec, context); },
    });
    const id = create();
    const starting = manager.start(id);
    const rejected = assert.rejects(starting, { code: "JOB_EXPIRED" });
    if (mode === "evicted") assert.notEqual(create(), id);
    else time += 101;
    checked.resolve();
    await rejected;
    assert.equal(runs, 0);
  }
});

test("cache eviction reserves its file before deletion so new downloads cannot lease it", async (t) => {
  let time = 1000;
  const { manager, create } = await fixture(t, { now: () => time, maxCacheBytes: 4096 });
  const first = create();
  await finish(manager, first);
  time++;
  const second = create({ videoFormatId: "137" });
  await finish(manager, second);
  await manager.prune();
  const deleting = deferred();
  const release = deferred();
  const remove = fs.rm;
  t.mock.method(fs, "rm", async (target, options) => {
    if (path.basename(target) === first) { deleting.resolve(); await release.promise; }
    return remove(target, options);
  });
  try {
    time++;
    const third = create({ videoFormatId: "298" });
    await finish(manager, third);
    await deleting.promise;
    assert.equal(manager.status(first), null);
    assert.equal(manager.lease(first), null);
    assert.notEqual(create(), first, "a file being deleted cannot be reused");
    await assert.rejects(manager.start(first), { code: "JOB_EXPIRED" });
  } finally {
    release.resolve();
    await manager.prune();
  }
});

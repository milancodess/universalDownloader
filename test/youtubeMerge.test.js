const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  buildMergeArgs, createProgressTracker, validateProbe, checkRuntime, runChild, inspectScratch,
} = require("../lib/youtubeMerge");

const spec = {
  sourceUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", videoId: "aqz-KE-bpKQ",
  videoFormatId: "137", audioFormatId: "140", width: 1920, height: 1080, fps: 60,
  videoCodec: "avc1.640028", audioCodec: "mp4a.40.2",
};
const probe = {
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "60000/1001" },
    { codec_type: "audio", codec_name: "aac" },
  ],
  format: { duration: "634.58" },
};

test("HD arguments request exact tracks and preserve media without transcoding or shell input", () => {
  const args = buildMergeArgs(spec, path.resolve("test-merge"), { ffmpeg: path.resolve("tools", "ffmpeg.exe") });
  assert.equal(args[args.indexOf("--format") + 1], "137+140");
  assert.equal(args[args.indexOf("--merge-output-format") + 1], "mp4");
  assert.equal(args[args.indexOf("--postprocessor-args") + 1], "Merger+ffmpeg_o:-movflags +faststart");
  assert.deepEqual(args.slice(-2), ["--", spec.sourceUrl]);
  assert.ok(args.includes("--ignore-config") && args.includes("--no-plugin-dirs") && args.includes("--no-playlist"));
  assert.ok(!args.includes("--recode-video"));
  for (const override of [{ videoFormatId: "137/best" }, { audioFormatId: "--exec" }, { sourceUrl: "https://evil.test/video" }, { videoId: "bad" }]) {
    assert.throws(() => buildMergeArgs({ ...spec, ...override }, path.resolve("test-merge")), { code: "INVALID_MEDIA_REQUEST" });
  }
});

test("merge progress combines tracks without counting repeated samples twice", () => {
  const track = createProgressTracker(["137", "140"]);
  assert.equal(track("unrelated provider output"), null);
  assert.equal(track("__UD_PROGRESS__evil|10|100|NA"), null);
  assert.deepEqual(track("__UD_PROGRESS__137|80|100|NA"), {
    state: "downloading", downloadedBytes: 80, totalBytes: null, progress: null, phaseLabel: "Downloading video",
  });
  assert.equal(track("__UD_PROGRESS__137|80|100|NA").downloadedBytes, 80);
  assert.deepEqual(track("__UD_PROGRESS__140|10|20|NA"), {
    state: "downloading", downloadedBytes: 90, totalBytes: 120, progress: 75, phaseLabel: "Downloading audio",
  });
  assert.equal(track("__UD_PROGRESS__137|100|100|NA").downloadedBytes, 110);
  assert.equal(track("__UD_PROGRESS__140|20|20|NA").progress, 100);
});

test("merged media validation requires actual selected resolution, codec and an audio stream", () => {
  assert.equal(validateProbe(probe, spec).height, 1080);
  const fourK = { ...spec, width: 3840, height: 2160, videoCodec: "vp09.00.51.08" };
  assert.equal(validateProbe({ ...probe, streams: [{ ...probe.streams[0], codec_name: "vp9", width: 3840, height: 2160 }, probe.streams[1]] }, fourK).height, 2160);
  for (const invalid of [
    { ...probe, streams: [probe.streams[0]] },
    { ...probe, streams: [{ ...probe.streams[0], height: 360 }, probe.streams[1]] },
    { ...probe, streams: [{ ...probe.streams[0], width: 1280 }, probe.streams[1]] },
    { ...probe, streams: [{ ...probe.streams[0], codec_name: "av1" }, probe.streams[1]] },
    { ...probe, streams: [{ ...probe.streams[0], avg_frame_rate: "30/1" }, probe.streams[1]] },
    { ...probe, format: { duration: "NaN" } },
    { ...probe, format: { duration: "0" } },
  ]) assert.throws(() => validateProbe(invalid, spec), { code: "INVALID_MERGED_MEDIA" });
});

test("merged media validation rejects truncated output when source duration is known", () => {
  const expected = { ...spec, duration: 635 };
  assert.equal(validateProbe(probe, expected).duration, 634.58);
  assert.throws(() => validateProbe({ ...probe, format: { duration: "10" } }, expected), { code: "INVALID_MERGED_MEDIA" });
  assert.throws(() => validateProbe({ ...probe, format: { duration: "800" } }, expected), { code: "INVALID_MERGED_MEDIA" });
});

test("missing merge tools report an actionable setup error", () => {
  assert.throws(() => checkRuntime({ ytDlp: __filename, ffmpeg: "missing-ffmpeg", ffprobe: "missing-ffprobe" }), { statusCode: 503, code: "FFMPEG_MISSING" });
  assert.throws(() => checkRuntime({ ytDlp: "missing-downloader" }), { code: "DOWNLOADER_MISSING" });
});

test("subprocess runner cancels after start and bounds validator output", async () => {
  const controller = new AbortController();
  const running = runChild(process.execPath, ["-e", "console.log('started'); setInterval(()=>{},1000)"], {
    signal: controller.signal, onLine: () => controller.abort(),
  });
  await assert.rejects(running, { code: "REQUEST_CANCELLED" });
  await assert.rejects(runChild(process.execPath, ["-e", "process.stdout.write('x'.repeat(2000))"], { maxOutputBytes: 100 }), { code: "INVALID_DOWNLOAD_OUTPUT" });
});

test("scratch checks bound the combined tracks before the merge doubles disk use", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "universal-merge-test-"));
  const relative = path.relative(os.tmpdir(), directory);
  assert.match(relative, /^universal-merge-test-[A-Za-z0-9_-]+$/);
  try {
    await writeFile(path.join(directory, "media.f137.mp4"), Buffer.alloc(80));
    await writeFile(path.join(directory, "media.f140.m4a.part"), Buffer.alloc(40));
    await assert.rejects(inspectScratch(directory, 100), { code: "MEDIA_TOO_LARGE" });
    await inspectScratch(directory, 200);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

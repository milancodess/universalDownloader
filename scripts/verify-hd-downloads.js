// Explicit live integration test: full source files, never clips or upscaled samples.
const { mkdir, writeFile } = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const { pipeline } = require("node:stream/promises");
const { Transform, Readable } = require("node:stream");
const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { runtimePaths } = require("../lib/youtubeMerge");
const { EXTRACT_TIMEOUT_MS } = require("../lib/ytDlp");
const exec = promisify(execFile);
const base = process.env.APP_URL || "http://127.0.0.1:3000";
const source = process.env.HD_TEST_URL || "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const directory = path.resolve(__dirname, "..", ".runtime", "verified-hd");

async function json(url, options = {}) {
  const { timeoutMs = 30000, ...requestOptions } = options;
  const response = await fetch(url, { ...requestOptions, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || "HTTP " + response.status);
  return body.data;
}
async function verifyOne(media, item, height) {
  let status = await json(new URL(item.url + "/prepare", base), { method: "POST" });
  const started = Date.now();
  let lastPhase = "";
  let lastLog = 0;
  while (status.state !== "ready") {
    if (["failed", "cancelled"].includes(status.state)) throw new Error(height + "p: " + status.error);
    if (Date.now() - started > 31 * 60000) throw new Error(height + "p exceeded preparation deadline");
    if (status.state !== lastPhase || Date.now() - lastLog > 15000) {
      console.log(JSON.stringify({ height, state: status.state, progress: status.progress, downloadedBytes: status.downloadedBytes, totalBytes: status.totalBytes }));
      lastPhase = status.state;
      lastLog = Date.now();
    }
    await delay(1000);
    status = await json(new URL(item.url + "/status", base));
  }
  console.log(height + "p prepared. Downloading the complete merged MP4 through the app.");
  const response = await fetch(new URL(item.url, base), { signal: AbortSignal.timeout(15 * 60000) });
  if (!response.ok || !response.headers.get("content-disposition")?.startsWith("attachment;")) throw new Error("Prepared download was not an attachment");
  const file = path.join(directory, "youtube-" + height + "p-with-audio.mp4");
  let bytes = 0;
  const hash = createHash("sha256");
  const measure = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; hash.update(chunk); callback(null, chunk); } });
  await pipeline(Readable.fromWeb(response.body), measure, createWriteStream(file));
  if (bytes !== status.sizeBytes) throw new Error("Downloaded file size does not match prepared file");
  const binaries = runtimePaths();
  const { stdout } = await exec(binaries.ffprobe, ["-v", "error", "-count_packets", "-show_entries",
    "stream=codec_type,codec_name,width,height,avg_frame_rate,channels,duration,nb_read_packets:format=duration,size",
    "-of", "json", file], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
  const probe = JSON.parse(stdout);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const seconds = Number(probe.format.duration);
  if (video?.height !== height || video.width !== item.width || !audio?.codec_name || Number(audio.nb_read_packets) < 1 || Number(video.nb_read_packets) < 1 ||
      Math.abs(seconds - media.duration) > 2) throw new Error("File did not contain the complete requested resolution and audio");
  // Decode real video and audio at both ends, in addition to traversing every packet.
  for (const offset of [0, Math.max(0, seconds - 3)]) {
    await exec(binaries.ffmpeg, ["-v", "error", "-xerror", "-ss", String(offset), "-i", file, "-t", "2",
      "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
  }
  const result = { source, path: file, bytes, sha256: hash.digest("hex"), width: video.width, height: video.height,
    frameRate: video.avg_frame_rate, videoCodec: video.codec_name, audioCodec: audio.codec_name, channels: audio.channels,
    duration: seconds, videoPackets: Number(video.nb_read_packets), audioPackets: Number(audio.nb_read_packets),
    fullPacketTraversal: true, beginningAndEndDecoded: true };
  await writeFile(path.join(directory, height + "p-verification.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  return result;
}
async function main() {
  await mkdir(directory, { recursive: true });
  const media = await json(base + "/api/youtube/download?" + new URLSearchParams({ url: source }), {
    timeoutMs: EXTRACT_TIMEOUT_MS + 10000,
  });
  const heights = process.env.HD_HEIGHTS ? process.env.HD_HEIGHTS.split(",").map(Number) : [1080, 2160];
  const chosen = heights.map((height) => {
    const item = media.videos.find((candidate) => candidate.height === height && candidate.preparation);
    if (!item) throw new Error("Source did not expose " + height + "p preparation");
    return { item, height };
  });
  await writeFile(path.join(directory, "active-jobs.json"), JSON.stringify(chosen.map(({ item, height }) => ({ height, url: item.url, estimatedMiB: item.sizeMB })), null, 2));
  const outcomes = await Promise.allSettled(chosen.map(({ item, height }) => verifyOne(media, item, height)));
  const results = outcomes.filter((item) => item.status === "fulfilled").map((item) => item.value);
  await writeFile(path.join(directory, "verification.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2));
  const errors = outcomes.filter((item) => item.status === "rejected");
  if (errors.length) throw new AggregateError(errors.map((item) => item.reason), errors.map((item) => item.reason.message).join("; "));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

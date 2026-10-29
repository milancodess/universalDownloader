// Explicit live checks; not part of offline npm test. Downloads complete public
// examples through the app, traverses every packet and decodes the entire files.
const { mkdir, writeFile } = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { normalizeMedia } = require("../web/media");
const { runtimePaths } = require("../lib/youtubeMerge");
const { EXTRACT_TIMEOUT_MS } = require("../lib/ytDlp");
const { MAX_DIRECT_BYTES } = require("../lib/mediaTickets");

const execute = promisify(execFile);
const base = process.env.APP_URL || "http://127.0.0.1:3000";
const directory = path.resolve(__dirname, "..", ".runtime", "verified-providers");
const samples = [
  { platform: "soundcloud", url: process.env.SOUNDCLOUD_TEST_URL || "https://soundcloud.com/nasa/apollo-11-thats-one-small-step-for-a-man", kinds: ["audio"] },
  { platform: "tiktok", url: process.env.TIKTOK_TEST_URL || "https://www.tiktok.com/@hankgreen1/video/7047596209028074758", kinds: ["video", "audio"] },
];

async function verifyFile(sample, item, sourceDuration) {
  if (!/^\/api\/files\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(item.url) || !/^(?:mp4|m4a|mp3|ogg|opus|aac|webm|wav|flac)$/.test(item.format)) throw new Error("Expected an app-issued media attachment");
  const response = await fetch(new URL(item.url, base), { signal: AbortSignal.timeout(5 * 60000 + 10000) });
  if (!response.ok || !response.headers.get("content-disposition")?.startsWith("attachment;")) throw new Error(`${sample.platform} ${item.kind}: download failed (${response.status})`);
  if (!response.headers.get("content-type")?.startsWith(`${item.kind}/`)) throw new Error(`${sample.platform}: incorrect ${item.kind} Content-Type`);
  const filename = path.join(directory, `${sample.platform}-${item.kind}.${item.format}`);
  let bytes = 0;
  const hash = createHash("sha256");
  const measure = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    if (bytes > MAX_DIRECT_BYTES) return callback(new Error("Verification download exceeds the transfer limit"));
    hash.update(chunk);
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), measure, createWriteStream(filename));
  const binaries = runtimePaths();
  const { stdout } = await execute(binaries.ffprobe, ["-v", "error", "-count_packets", "-show_entries",
    "stream=codec_type,codec_name,width,height,nb_read_packets:format=duration,size", "-of", "json", filename],
  { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
  const probe = JSON.parse(stdout);
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(probe.format?.duration);
  if (!audio?.codec_name || Number(audio.nb_read_packets) < 1 || !Number.isFinite(duration) || duration <= 0 || bytes < 1024
    || item.kind === "video" && (!video?.codec_name || Number(video.nb_read_packets) < 1)
    || sourceDuration && Math.abs(duration - sourceDuration) > Math.max(2, sourceDuration * 0.01)) throw new Error(`${sample.platform}: incomplete or invalid ${item.kind}`);
  await execute(binaries.ffmpeg, ["-v", "error", "-xerror", "-i", filename, "-map", "0:a:0", ...(item.kind === "video" ? ["-map", "0:v:0"] : []), "-f", "null", "-"],
    { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
  return { platform: sample.platform, source: sample.url, kind: item.kind, path: filename, bytes,
    sha256: hash.digest("hex"), contentType: response.headers.get("content-type"), duration,
    audioCodec: audio.codec_name, audioPackets: Number(audio.nb_read_packets),
    ...(video ? { videoCodec: video.codec_name, width: video.width, height: video.height, videoPackets: Number(video.nb_read_packets) } : {}),
    fullPacketTraversal: true, fullDecode: true };
}

async function main() {
  await mkdir(directory, { recursive: true });
  const results = [];
  for (const sample of samples) {
    const response = await fetch(`${base}/api/${sample.platform}/download?${new URLSearchParams({ url: sample.url })}`, { signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS + 10000) });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(`${sample.platform}: ${body.error || response.status}`);
    const media = normalizeMedia(body.data, sample.url);
    for (const kind of sample.kinds) {
      const item = media.items.find((candidate) => candidate.kind === kind);
      if (!item) throw new Error(`${sample.platform}: no ${kind} file offered`);
      const result = await verifyFile(sample, item, media.duration);
      results.push(result);
      console.log(JSON.stringify(result));
      await writeFile(path.join(directory, "verification.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2));
    }
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

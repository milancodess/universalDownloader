// Explicit live smoke check, intentionally separate from the offline npm tests.
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

async function verify() {
  const base = process.env.APP_URL || "http://127.0.0.1:3000";
  const directory = path.join(__dirname, "..", ".runtime", "verified");
  await mkdir(directory, { recursive: true });
  const samples = [
    { platform: "youtube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", filename: "youtube-big-buck-bunny.mp4" },
    { platform: "meta", url: "https://www.instagram.com/p/aye83DjauH/", filename: "instagram-video.mp4" },
    { platform: "meta", url: "https://www.instagram.com/p/DfCo97ZlL5F/", filename: "instagram-photo.jpg", type: "photo" },
  ];
  const results = [];
  for (const sample of samples) {
    const response = await fetch(`${base}/api/${sample.platform}/download?${new URLSearchParams({ url: sample.url })}`, { signal: AbortSignal.timeout(70000) });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(`${sample.platform}: ${body.error || response.status}`);
    const media = sample.platform === "youtube" ? body.data.videos.find((item) => !item.preparation) : body.data.data.find((item) => item.type === (sample.type || "video"));
    if (!media || !/^\/api\/files\/[a-f0-9-]{36}$/i.test(media.url)) throw new Error("No app download link returned");
    const download = await fetch(new URL(media.url, base), { signal: AbortSignal.timeout(300000) });
    if (!download.ok || !download.headers.get("content-disposition")?.startsWith("attachment;")) throw new Error(`${sample.platform}: attachment download failed (${download.status})`);
    const file = Buffer.from(await download.arrayBuffer());
    if (sample.type === "photo") {
      if (file.length < 1024 || !file.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) || !file.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) throw new Error(`${sample.platform}: response is not a complete JPEG`);
    } else if (file.length < 1024 || file.subarray(4, 8).toString() !== "ftyp" || !file.includes(Buffer.from("moov")) || !file.includes(Buffer.from("mdat"))) throw new Error(`${sample.platform}: response is not a complete MP4`);
    if (sample.platform === "youtube" && (!file.includes(Buffer.from("vide")) || !file.includes(Buffer.from("soun")))) throw new Error("YouTube file is missing video or audio tracks");
    const destination = path.join(directory, sample.filename);
    await writeFile(destination, file);
    const result = {
      platform: sample.platform, source: sample.url, path: destination,
      bytes: file.length, sha256: createHash("sha256").update(file).digest("hex"),
      contentType: download.headers.get("content-type"), quality: media.quality,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  await writeFile(path.join(directory, "verification.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2));
}

verify().catch((error) => { console.error(error.message); process.exitCode = 1; });

// Installs a pinned official yt-dlp release into this project, never globally.
const { mkdir, writeFile, rename, chmod, rm } = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const VERSION = "2026.10.26";
const ASSETS = {
  "win32-x64": "yt-dlp.exe", "win32-arm64": "yt-dlp_arm64.exe", "win32-ia32": "yt-dlp_x86.exe",
  "linux-x64": "yt-dlp_linux", "linux-arm64": "yt-dlp_linux_aarch64",
  "darwin-x64": "yt-dlp_macos", "darwin-arm64": "yt-dlp_macos",
};

async function install() {
  const asset = ASSETS[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error("Install yt-dlp for this OS manually and set YTDLP_PATH to its executable.");
  const directory = path.join(__dirname, "..", ".runtime");
  const destination = path.join(directory, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${VERSION}`;
  const checksumResponse = await fetch(`${base}/SHA2-256SUMS`, { signal: AbortSignal.timeout(30000) });
  if (!checksumResponse.ok) throw new Error(`Could not fetch official checksums (${checksumResponse.status})`);
  const checksums = await checksumResponse.text();
  const expected = checksums.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((fields) => fields[1] === asset)?.[0];
  if (!/^[a-f0-9]{64}$/.test(expected || "")) throw new Error("Release checksum is missing");
  console.log(`Downloading official yt-dlp ${VERSION} (${asset})…`);
  const response = await fetch(`${base}/${asset}`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Could not fetch downloader (${response.status})`);
  const parts = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) throw new Error("Downloader release exceeds expected size");
    parts.push(chunk);
  }
  const file = Buffer.concat(parts);
  if (createHash("sha256").update(file).digest("hex") !== expected) throw new Error("Official release checksum did not match; nothing was installed");
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, file);
    if (process.platform !== "win32") await chmod(temporary, 0o755);
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  console.log(`Installed and SHA256 verified: ${destination}`);
}

install().catch((error) => { console.error(error.message); process.exitCode = 1; });

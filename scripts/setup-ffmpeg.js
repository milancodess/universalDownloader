// Installs a pinned, checksum-verified yt-dlp FFmpeg build locally, never globally.
const { mkdir, mkdtemp, open, writeFile, rename, rm, copyFile } = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");

const RELEASE = "autobuild-2026-10-29-00-02";
const ASSET = "ffmpeg-N-128170-g0ea6606418-win64-gpl.zip";
const SHA256 = "068dacc12c2c0e3c13ae74654a4bb8f996b564b91c46ba0a9ea69166deeee960";
const BASE = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/" + RELEASE;
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
const ROOT = path.resolve(__dirname, "..", ".runtime");

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options });
    let output = "";
    let errors = "";
    const deadline = setTimeout(() => { child.kill(); reject(new Error("FFmpeg setup command timed out")); }, 120000);
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-65536); });
    child.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-65536); });
    child.on("error", (error) => { clearTimeout(deadline); reject(error); });
    child.on("close", (code) => {
      clearTimeout(deadline);
      if (code !== 0) reject(new Error("FFmpeg setup failed: " + errors.trim()));
      else resolve(output);
    });
  });
}
async function sha256(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error("Could not fetch FFmpeg release (" + response.status + ")");
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_ARCHIVE_BYTES) throw new Error("FFmpeg archive exceeds its size limit");
  const file = await open(destination, "wx");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) throw new Error("FFmpeg archive exceeds its size limit");
      await file.writeFile(chunk);
    }
  } finally { await file.close(); }
  return bytes;
}

async function install() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("This installer supports Windows x64. Install FFmpeg and ffprobe from https://ffmpeg.org/download.html, then set FFMPEG_PATH and FFPROBE_PATH to their absolute executable paths.");
  }
  await mkdir(ROOT, { recursive: true });
  const stage = await mkdtemp(path.join(ROOT, "ffmpeg-setup-"));
  // Only this unique, freshly created directory may be removed by cleanup.
  const relative = path.relative(ROOT, stage);
  if (relative.includes(path.sep) || !/^ffmpeg-setup-[A-Za-z0-9_-]+$/.test(relative)) throw new Error("Unsafe setup directory");
  try {
    const checksumResponse = await fetch(BASE + "/checksums.sha256", { signal: AbortSignal.timeout(30000) });
    if (!checksumResponse.ok) throw new Error("Could not fetch official FFmpeg checksums");
    const checksums = await checksumResponse.text();
    const expected = checksums.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((fields) => fields[1] === ASSET)?.[0];
    if (expected !== SHA256) throw new Error("The published checksum differs from the pinned FFmpeg build");
    const archive = path.join(stage, ASSET);
    console.log("Downloading yt-dlp FFmpeg " + RELEASE + " (Windows x64)…");
    const bytes = await download(BASE + "/" + ASSET, archive);
    if (await sha256(archive) !== SHA256) throw new Error("FFmpeg checksum mismatch; nothing was installed");
    const extraction = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = [IO.Path]::GetFullPath($env:FFMPEG_SETUP_ARCHIVE)
$stagePath = [IO.Path]::GetFullPath($env:FFMPEG_SETUP_STAGE)
$bundleRoot = $env:FFMPEG_SETUP_BUNDLE
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($tool in @('ffmpeg.exe', 'ffprobe.exe')) {
    $entry = $zip.GetEntry($bundleRoot + '/bin/' + $tool)
    if (-not $entry -or $entry.Length -gt 300MB -or $entry.Length -lt 1MB) { throw 'Missing or oversized executable in verified release' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, [IO.Path]::Combine($stagePath, $tool), $false)
  }
  $licenses = @($zip.Entries | Where-Object { $_.FullName -match '/(LICENSE|COPYING|COPYRIGHT)[^/]*$' })
  if ($licenses.Count -eq 0) { throw 'The verified build has no license file' }
  $licenseDirectory = [IO.Path]::Combine($stagePath, 'licenses')
  [IO.Directory]::CreateDirectory($licenseDirectory) | Out-Null
  $index = 0
  foreach ($entry in $licenses) {
    if ($entry.Length -gt 1MB) { throw 'Oversized license file' }
    $name = [IO.Path]::GetFileName($entry.FullName)
    if ($name -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Invalid license filename' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, [IO.Path]::Combine($licenseDirectory, [string]$index + '-' + $name), $false)
    $index++
  }
} finally { $zip.Dispose() }
`;
    const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    await run(powershell, ["-NoProfile", "-NonInteractive", "-Command", extraction], {
      env: { ...process.env, FFMPEG_SETUP_ARCHIVE: archive, FFMPEG_SETUP_STAGE: stage, FFMPEG_SETUP_BUNDLE: ASSET.slice(0, -4) },
    });
    // Check both staged executables before replacing the working runtime.
    const ffmpegVersion = (await run(path.join(stage, "ffmpeg.exe"), ["-version"])).split(/\r?\n/)[0];
    const ffprobeVersion = (await run(path.join(stage, "ffprobe.exe"), ["-version"])).split(/\r?\n/)[0];
    const destination = path.join(ROOT, "ffmpeg");
    const binaryDirectory = path.join(destination, "bin");
    await mkdir(binaryDirectory, { recursive: true });
    for (const tool of ["ffmpeg.exe", "ffprobe.exe"]) {
      await copyFile(path.join(stage, tool), path.join(binaryDirectory, tool + ".new"));
      await rename(path.join(binaryDirectory, tool + ".new"), path.join(binaryDirectory, tool));
    }
    const { readdir } = require("node:fs/promises");
    const licenseDirectory = path.join(destination, "licenses");
    await mkdir(licenseDirectory, { recursive: true });
    for (const filename of await readdir(path.join(stage, "licenses"))) {
      await copyFile(path.join(stage, "licenses", filename), path.join(licenseDirectory, filename));
    }
    await writeFile(path.join(destination, "release.json"), JSON.stringify({
      release: RELEASE, asset: ASSET, source: BASE + "/" + ASSET, sha256: SHA256,
      archiveBytes: bytes, ffmpegVersion, ffprobeVersion,
    }, null, 2));
    await writeFile(path.join(destination, "checksums.sha256"), checksums);
    console.log(ffmpegVersion);
    console.log(ffprobeVersion);
    console.log("Installed and SHA256 verified: " + binaryDirectory);
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (require.main === module) install().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { RELEASE, ASSET, SHA256, install };

// services/spotifyService.js
const axios = require("axios");
const qs = require("qs");

let nonceCache = { nonce: null, ts: 0 };

// Helper to fetch new nonce from Downloaderize
async function getNonce() {
  try {
    const res = await axios.get("https://spotify.downloaderize.com/");
    const html = res.data;
    const match = html.match(/"nonce":"([a-f0-9]+)"/);
    if (match) return match[1];
    throw new Error("Nonce not found");
  } catch (err) {
    throw new Error("Failed to get nonce: " + err.message);
  }
}

// Helper to manage nonce caching
async function getValidNonce() {
  const now = Date.now();
  if (!nonceCache.nonce || now - nonceCache.ts > 3600000) {
    const nonce = await getNonce();
    nonceCache = { nonce, ts: now };
  }
  return nonceCache.nonce;
}

// Validate Spotify URL
function isSpotifyUrl(url) {
  const regex = /^https?:\/\/open\.spotify\.com\/(track|album|playlist|artist)\/[a-zA-Z0-9]+/;
  return regex.test(url);
}

// Main fetch function
async function fetchSpotify(url) {
  try {
    if (!isSpotifyUrl(url)) throw new Error("Invalid Spotify URL");

    const nonce = await getValidNonce();

    const data = qs.stringify({
      action: "spotify_downloader_get_info",
      url: url,
      nonce: nonce,
    });

    const config = {
      headers: {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };

    const res = await axios.post(
      "https://spotify.downloaderize.com/wp-admin/admin-ajax.php",
      data,
      config
    );

    if (!res.data?.success || !res.data.data) {
      throw new Error("Failed to fetch song info");
    }

    const song = res.data.data;

    const downloadLinks = (song.medias || []).map((m) => ({
      url: m.url,
      quality: m.quality || "unknown",
      extension: m.extension || "mp3",
      type: m.type || "audio",
    }));

    return {
      title: song.title,
      author: song.author,
      duration: song.duration,
      thumbnail: song.thumbnail || null,
      downloadLinks,
    };
  } catch (err) {
    throw new Error(`Spotify fetch failed: ${err.message}`);
  }
}

module.exports = { fetchSpotify };

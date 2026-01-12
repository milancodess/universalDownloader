const axios = require("axios");

/**
 * Fetch Spotify track data
 *
 * @param {string} url - Spotify track URL
 * @returns {Promise<Object>}
 */
async function fetchSpotify(url) {
  if (!url || typeof url !== "string") {
    throw new Error("A valid Spotify URL must be provided");
  }

  try {
    const res = await axios.post(
      "https://songsnatch-2.emergent.host/api/download",
      { url },
      {
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          origin: "https://spotihelper.com",
          referer: "https://spotihelper.com/",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
        timeout: 10000,
      }
    );

    // IMPORTANT: return response as-is
    return res.data;
  } catch (err) {
    if (err.response) {
      throw new Error(
        `Spotify downloader API error: ${err.response.status} ${err.response.statusText}`
      );
    }

    if (err.request) {
      throw new Error("No response received from Spotify downloader API");
    }

    throw new Error(`Spotify downloader request failed: ${err.message}`);
  }
}

module.exports = { fetchSpotify };
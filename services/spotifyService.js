const axios = require("axios");

async function fetchSpotify(url) {
  if (!url || typeof url !== "string") {
    throw new Error("A valid Spotify URL must be provided");
  }

  try {
    const res = await axios.post(
      "https://musicfab.io/api/spotify",
      { url },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 10000,
      },
    );

    return res.data;
  } catch (err) {
    if (err.response) {
      throw new Error(
        `MusicFab API error: ${err.response.status} ${err.response.statusText}`,
      );
    }

    if (err.request) {
      throw new Error("No response received from MusicFab API");
    }

    throw new Error(`Request failed: ${err.message}`);
  }
}

module.exports = { fetchSpotify };

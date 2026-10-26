const axios = require("../lib/httpClient");

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
          Referer: "https://musicfab.io/",
          Origin: "https://musicfab.io",
        },
        timeout: 15000,
        validateStatus: (status) => status < 500,
      },
    );

    if (res.status >= 400) {
      throw new Error(`MusicFab API error: ${res.status}`);
    }

    return res.data;
  } catch (err) {
    if (err.code === "ECONNABORTED") {
      throw new Error("Request timeout from MusicFab API", { cause: err });
    }

    if (err.response) {
      throw new Error(
        `MusicFab API error: ${err.response.status} ${err.response.statusText}`,
        { cause: err },
      );
    }

    if (err.request) {
      throw new Error("No response received from MusicFab API", { cause: err });
    }

    throw new Error("MusicFab request failed", { cause: err });
  }
}

module.exports = { fetchSpotify };

const axios = require("axios");

async function fetchYouTubeData(url) {
  try {
    const res = await axios.get(
      "https://api.vidfly.ai/api/media/youtube/download",
      {
        params: { url },
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          "x-app-name": "vidfly-web",
          "x-app-version": "1.0.0",
          Referer: "https://vidfly.ai/",
        },
      }
    );

    const data = res.data?.data;
    if (!data || !data.items || !data.title) {
      throw new Error("Invalid or empty response from YouTube downloader API");
    }

    return {
      title: data.title,
      thumbnail: data.cover,
      duration: data.duration,
      formats: data.items.map((item) => ({
        type: item.type,
        quality: item.label || "unknown",
        extension: item.ext || item.extension || "unknown",
        url: item.url,
      })),
    };
  } catch (err) {
    throw new Error(`YouTube downloader request failed: ${err.message}`);
  }
}

module.exports = { fetchYouTubeData };

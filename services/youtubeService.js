const axios = require("axios");

async function fetchYouTubeData(url) {
  if (!url || typeof url !== "string") {
    throw new Error("A valid YouTube URL must be provided");
  }

  try {
    const body = new URLSearchParams({
      auth: "20250901majwlqo",
      domain: "api-ak.vidssave.com",
      origin: "cache",
      link: url,
    });

    const { data } = await axios.post(
      "https://api.vidssave.com/api/contentsite_api/media/parse",
      body.toString(),
      {
        headers: {
          accept: "*/*",
          "content-type": "application/x-www-form-urlencoded",
          referer: "https://vidssave.com/",
          origin: "https://vidssave.com",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          "accept-language": "en-US,en;q=0.9",
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        timeout: 15000,
      },
    );

    if (!data || data.status !== 1 || !data.data) {
      throw new Error("Invalid response from vidssave");
    }

    const video = data.data;

    const videos = [];
    const audios = [];

    (video.resources || []).forEach((r) => {
      const item = {
        format: r.format,
        quality: r.quality || null,
        url: r.download_url,
        sizeMB: +(r.size / 1024 / 1024).toFixed(2),
      };

      if (r.type === "video") videos.push(item);
      if (r.type === "audio") audios.push(item);
    });

    return {
      type: "video",
      url,
      thumbnail: video.thumbnail || null,
      title: video.title || null,
      duration: video.duration || null,
      videos,
      audios,
    };
  } catch (err) {
    console.error("Vidssave scrape failed:", err.message);
    throw err;
  }
}

module.exports = { fetchYouTubeData };

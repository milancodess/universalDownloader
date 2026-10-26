const axios = require("../lib/httpClient");

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
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json, text/plain, */*",
          origin: "https://vidssave.com",
          referer: "https://vidssave.com/",
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "sec-ch-ua":
            '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br",
          connection: "keep-alive",
          "x-requested-with": "XMLHttpRequest",
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

    if (!Array.isArray(video.resources)) {
      throw new Error("Invalid media resources from vidssave");
    }

    video.resources.forEach((r) => {
      if (!r || !["video", "audio"].includes(r.type)) return;
      if (typeof r.download_url !== "string") return;

      try {
        const downloadUrl = new URL(r.download_url);
        if (!["http:", "https:"].includes(downloadUrl.protocol)) return;
      } catch {
        return;
      }

      const size = r.size == null || r.size === "" ? NaN : Number(r.size);
      const item = {
        format: r.format,
        quality: r.quality || null,
        url: r.download_url,
        sizeMB: Number.isFinite(size) && size >= 0
          ? +(size / 1024 / 1024).toFixed(2)
          : null,
      };

      if (r.type === "video") videos.push(item);
      if (r.type === "audio") audios.push(item);
    });

    if (!videos.length && !audios.length) {
      throw new Error("No media found in vidssave response");
    }

    return {
      type: "video",
      url,
      thumbnail: video.thumbnail || null,
      title: video.title || null,
      duration: video.duration ?? null,
      videos,
      audios,
    };
  } catch (err) {
    throw err;
  }
}

module.exports = { fetchYouTubeData };

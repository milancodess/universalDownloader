const axios = require("axios");

const FORMATS = ["1080p", "720p", "480p", "240p", "144p", "audio"];

/**
 * Fetch YouTube video data in all available formats
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Structured video info with all available formats
 */
async function fetchYouTubeData(url) {
  if (!url || typeof url !== "string") {
    throw new Error("A valid YouTube URL must be provided");
  }

  const headers = {
    accept: "*/*",
    "content-type": "application/json",
    referer: "https://thesocialcat.com/tools/youtube-video-downloader",
    origin: "https://thesocialcat.com",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  };

  const formatResults = {};

  // Fetch all formats in parallel
  await Promise.all(
    FORMATS.map(async (format) => {
      try {
        const res = await axios.post(
          "https://thesocialcat.com/api/youtube-download",
          { url, format },
          { headers }
        );

        const data = res.data;

        // Only store if mediaUrl exists and avoid duplicating 720p fallback
        if (data?.mediaUrl) {
          if (!(format === "720p" && formatResults["720p"])) {
            formatResults[format] = data.mediaUrl;
          }
        }
      } catch (err) {
        // ignore if a format is not available
        console.warn(`Format ${format} not available: ${err.message}`);
      }
    })
  );

  if (!Object.keys(formatResults).length) {
    throw new Error("No available formats found for this video");
  }

  // Use one of the successful results as base for metadata
  const fallbackData = await axios
    .post(
      "https://thesocialcat.com/api/youtube-download",
      { url, format: "720p" },
      { headers }
    )
    .then((r) => r.data)
    .catch(() => null);

  if (!fallbackData) {
    throw new Error("Unable to fetch video metadata");
  }

  // Construct final response and sort medias from highest to lowest
  const medias = FORMATS.filter((f) => formatResults[f]).map((format) => ({
    format,
    mediaUrl: formatResults[format],
  }));

  return {
    type: fallbackData.type || "video",
    id: fallbackData.id,
    url: fallbackData.url,
    thumbnail: fallbackData.thumbnail,
    username: fallbackData.username || "YouTube",
    caption: fallbackData.caption,
    duration: fallbackData.videoMeta?.duration || null,
    medias,
  };
}

module.exports = { fetchYouTubeData };

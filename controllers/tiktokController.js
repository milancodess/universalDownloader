const {
  extractTikTokId,
  fetchTikTokData,
} = require("../services/tiktokService");

async function handleTikTokDownload(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "Missing 'url' query parameter." });
    }

    const videoId = extractTikTokId(url);
    if (!videoId) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Invalid TikTok URL or unable to extract video ID.",
        });
    }

    const data = await fetchTikTokData(videoId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { handleTikTokDownload };

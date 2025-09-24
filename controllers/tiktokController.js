const { fetchTikTokData } = require("../services/tiktokService");

async function handleTikTokDownload(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "Missing 'url' query parameter." });
    }

    const data = await fetchTikTokData(url);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = { handleTikTokDownload };

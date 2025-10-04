const { fetchKuaishouMedia } = require("../services/kuaishouService");

async function handleKuaishouDownload(req, res) {
  const { url } = req.body;
  if (!url) {
    return res
      .status(400)
      .json({ success: false, error: "Missing 'url' in request body." });
  }

  try {
    const data = await fetchKuaishouMedia(url);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { handleKuaishouDownload };

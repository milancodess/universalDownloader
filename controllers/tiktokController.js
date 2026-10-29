const { fetchTikTokData } = require("../services/tiktokService");
const { createDownloadController } = require("../lib/downloadController");

const handleTikTokDownload = createDownloadController(fetchTikTokData);

module.exports = { handleTikTokDownload };

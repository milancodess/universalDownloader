const { fetchDailymotionData } = require("../services/dailymotionService");
const { createDownloadController } = require("../lib/downloadController");

const handleDailymotionDownload = createDownloadController(fetchDailymotionData);

module.exports = { handleDailymotionDownload };

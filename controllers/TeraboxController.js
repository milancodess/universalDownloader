const { fetchTerabox } = require("../services/teraboxService");
const { createDownloadController } = require("../lib/downloadController");

const handleTeraboxDownload = createDownloadController(fetchTerabox);

module.exports = { handleTeraboxDownload };

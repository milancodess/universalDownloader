const { fetchCapcutData } = require("../services/capcutService");
const { createDownloadController } = require("../lib/downloadController");

const handleCapcutDownload = createDownloadController(fetchCapcutData);

module.exports = { handleCapcutDownload };

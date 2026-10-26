const { fetchDouyinVideoInfo } = require("../services/douyinService");
const { createDownloadController } = require("../lib/downloadController");

const handleDouyinDownload = createDownloadController(fetchDouyinVideoInfo);

module.exports = { handleDouyinDownload };

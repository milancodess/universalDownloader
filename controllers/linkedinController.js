const { fetchLinkedinData } = require("../services/linkedinService");
const { createDownloadController } = require("../lib/downloadController");

const handleLinkedinDownload = createDownloadController(fetchLinkedinData);

module.exports = { handleLinkedinDownload };

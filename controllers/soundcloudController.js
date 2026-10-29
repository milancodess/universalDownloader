const { fetchSoundcloudData } = require("../services/soundcloudService");
const { createDownloadController } = require("../lib/downloadController");

const handleSoundcloudDownload = createDownloadController(fetchSoundcloudData);

module.exports = { handleSoundcloudDownload };

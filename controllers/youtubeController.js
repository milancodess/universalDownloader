const { fetchYouTubeData } = require("../services/youtubeService");
const { createDownloadController } = require("../lib/downloadController");

const handleYouTubeDownload = createDownloadController(fetchYouTubeData);

module.exports = { handleYouTubeDownload };

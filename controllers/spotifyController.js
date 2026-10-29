const { fetchSpotify } = require("../services/spotifyService");
const { createDownloadController } = require("../lib/downloadController");

const handleSpotifyDownload = createDownloadController(fetchSpotify);

module.exports = { handleSpotifyDownload };

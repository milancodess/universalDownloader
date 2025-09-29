const express = require("express");
const router = express.Router();
const { handleSpotifyDownload } = require("../controllers/spotifyController");

router.get("/download", handleSpotifyDownload);

module.exports = router;

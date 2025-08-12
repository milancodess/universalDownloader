const express = require("express");
const router = express.Router();
const { handleYouTubeDownload } = require("../controllers/youtubeController");

router.get("/download", handleYouTubeDownload);

module.exports = router;

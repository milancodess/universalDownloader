const express = require("express");
const router = express.Router();
const { handleRedditDownload } = require("../controllers/redditController");

router.get("/download", handleRedditDownload);

module.exports = router;

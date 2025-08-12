const express = require("express");
const router = express.Router();
const { handleThreadsDownload } = require("../controllers/threadsController");

router.get("/download", handleThreadsDownload);

module.exports = router;

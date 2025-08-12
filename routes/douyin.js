const express = require("express");
const router = express.Router();
const { handleDouyinDownload } = require("../controllers/douyinController");

router.get("/download", handleDouyinDownload);

module.exports = router;

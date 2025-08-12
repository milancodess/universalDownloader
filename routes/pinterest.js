const express = require("express");
const router = express.Router();
const {
  handlePinterestDownload,
} = require("../controllers/pinterestController");

router.get("/download", handlePinterestDownload);

module.exports = router;

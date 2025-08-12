const express = require("express");
const router = express.Router();
const {
  handleFacebookInstaDownload,
} = require("../controllers/facebookInstaController");

router.get("/download", handleFacebookInstaDownload);

module.exports = router;

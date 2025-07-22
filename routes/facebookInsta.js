const express = require("express");
const router = express.Router();
const {
  handleFacebookInstaDownload,
} = require("../controllers/facebookInstaController");

/**
 * @swagger
 * /api/meta/download:
 *   get:
 *     summary: Download Facebook or Instagram media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The Facebook or Instagram post URL to download
 *         schema:
 *           type: string
 *           example: https://www.instagram.com/p/DLHQfPiyucu/
 *     responses:
 *       200:
 *         description: Media download info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing URL parameter
 *       500:
 *         description: Server error
 */
router.get("/download", handleFacebookInstaDownload);

module.exports = router;

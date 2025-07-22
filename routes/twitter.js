const express = require("express");
const router = express.Router();
const { handleTwitterDownload } = require("../controllers/twitterController");

/**
 * @swagger
 * /api/twitter/download:
 *   get:
 *     summary: Download Twitter( X ) media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The Twitter( X ) post URL to download
 *         schema:
 *           type: string
 *           example: https://x.com/tena0x/status/1947602177054412868
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
router.get("/download", handleTwitterDownload);

module.exports = router;

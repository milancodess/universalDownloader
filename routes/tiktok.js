const express = require("express");
const router = express.Router();
const { handleTikTokDownload } = require("../controllers/tiktokController");

/**
 * @swagger
 * /api/tiktok/download:
 *   get:
 *     summary: Download TikTok media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The TikTok post URL to download
 *         schema:
 *           type: string
 *           example: https://www.tiktok.com/@stefaniageorgiadii/video/7496952898295844102
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
router.get("/download", handleTikTokDownload);

module.exports = router;

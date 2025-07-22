const express = require("express");
const router = express.Router();
const { handleYouTubeDownload } = require("../controllers/youtubeController");

/**
 * @swagger
 * /api/youtube/download:
 *   get:
 *     summary: Download YouTube media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The YouTube post URL to download
 *         schema:
 *           type: string
 *           example: https://youtu.be/3AtDnEC4zak?si=UaaYeXlh67SGtO0c
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
router.get("/download", handleYouTubeDownload);

module.exports = router;

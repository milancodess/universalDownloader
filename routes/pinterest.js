const express = require("express");
const router = express.Router();
const {
  handlePinterestDownload,
} = require("../controllers/pinterestController");

/**
 * @swagger
 * /api/pinterest/download:
 *   get:
 *     summary: Download Pinterest media by URL
 *     tags: [Downloader]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         description: The Pinterest post URL to download
 *         schema:
 *           type: string
 *           example: https://pin.it/57m1wwI8m
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
router.get("/download", handlePinterestDownload);

module.exports = router;

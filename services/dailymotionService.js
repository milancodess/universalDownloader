const axios = require("axios");
const qs = require("qs");
const cheerio = require("cheerio");

/**
 * Fetch Dailymotion download info
 * @param {string} videoUrl - The Dailymotion video URL
 * @returns {Promise<Object>} JSON object with title, thumbnail, and download links
 */
async function fetchDailymotionData(videoUrl) {
  try {
    const apiUrl = "https://dailymotiondownloader.com/api/v1/aio/search";
    const data = qs.stringify({
      prefix: "dtGslxrcdcG9raW8uY29t",
      ex: "",
      vid: videoUrl,
      format: "",
    });

    const response = await axios.post(apiUrl, data, {
      maxBodyLength: Infinity,
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.7",
        "content-type": "application/x-www-form-urlencoded",
        dnt: "1",
        "hx-current-url": "https://dailymotiondownloader.com/",
        "hx-request": "true",
        "hx-target": "aio-parse-result",
        "hx-trigger": "search-btn",
        origin: "https://dailymotiondownloader.com",
        priority: "u=1, i",
        referer: "https://dailymotiondownloader.com/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      },
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract title, thumbnail, and download links
    const title = $("p strong").first().text().replace("Title：", "").trim();

    const thumbnail = $("img").attr("src");

    const downloadLinks = [];
    $("a.button.primary").each((_, el) => {
      const quality = $(el)
        .find("span")
        .text()
        .replace("Download (", "")
        .replace(")", "");
      const link = $(el).attr("href");
      if (link && link.startsWith("https://")) {
        downloadLinks.push({ quality, url: link });
      }
    });

    return {
      success: true,
      title,
      thumbnail,
      downloads: downloadLinks,
    };
  } catch (error) {
    throw new Error(`Dailymotion API request failed: ${error.message}`);
  }
}

module.exports = { fetchDailymotionData };

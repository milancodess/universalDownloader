const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Scrape TikDownloader.io for TikTok video/audio data.
 * @param {string} videoUrl - TikTok video URL
 * @returns {Promise<Object>}
 */
async function fetchTikTokData(videoUrl) {
  const endpoint = "https://tikdownloader.io/api/ajaxSearch";

  try {
    const res = await axios.post(
      endpoint,
      new URLSearchParams({
        q: videoUrl,
        lang: "en",
      }),
      {
        headers: {
          accept: "*/*",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          Referer: "https://tikdownloader.io/en",
        },
      }
    );

    const html = res.data.data;
    const $ = cheerio.load(html);

    const thumbnail = $(".thumbnail img").attr("src") || null;
    const title = $(".thumbnail h3").text().trim() || null;

    const downloads = [];
    $(".dl-action a").each((i, el) => {
      downloads.push({
        text: $(el).text().trim(),
        url: $(el).attr("href"),
      });
    });

    return {
      status: res.data.status,
      title,
      thumbnail,
      downloads,
    };
  } catch (error) {
    throw new Error(`TikDownloader request failed: ${error.message}`);
  }
}

module.exports = {
  fetchTikTokData,
};

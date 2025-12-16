const axios = require("axios");
const cheerio = require("cheerio");

async function fetchTikTokData(videoUrl) {
  const endpoint = "https://tikdownloader.io/api/ajaxSearch";

  try {
    const res = await axios.post(
      endpoint,
      new URLSearchParams({ q: videoUrl, lang: "en" }),
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

    const title = $(".thumbnail h3").text().trim() || null;
    const thumbnail = $(".thumbnail img").attr("src") || null;

    const downloads = [];

    // ===========================
    // VIDEO / AUDIO DOWNLOADS
    // ===========================
    $(".dl-action a").each((i, el) => {
      const text = $(el).text().trim();
      const url = $(el).attr("href");

      // ❗ DO NOT push empty or "#" URLs
      if (!url || url === "#") return;

      downloads.push({ text, url });
    });

    // ===========================
    // PHOTO MODE DOWNLOADS
    // ===========================
    const photos = $(".photo-list .download-box li");

    if (photos.length > 0) {
      photos.each((i, el) => {
        const text = $(el).find("a").text().trim();
        const url = $(el).find("a").attr("href");

        if (!url || url === "#") return;

        downloads.push({ text, url });
      });
    }

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

module.exports = { fetchTikTokData };

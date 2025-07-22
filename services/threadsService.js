const axios = require("axios");
const cheerio = require("cheerio");

async function threadsDownloader(url) {
  try {
    const res = await axios.post(
      "https://threadsv.com/get-thr",
      {
        token: "29ae809a4f98ebee39d8d683f851fc86",
        url,
        lang: "en",
      },
      {
        headers: {
          "content-type": "application/json",
          referer: "https://threadsv.com/",
          "user-agent": "Mozilla/5.0",
          cookie: "PHPSESSID=l7cec5kqiqlt2mce3q03in0jo9",
        },
      }
    );

    if (!res.data || !res.data.html) {
      throw new Error("No HTML in response from threadsv.com");
    }

    const $ = cheerio.load(res.data.html);
    const download = $(".btn.download-btn").attr("href");
    const thumbnail = $(".thumb img").attr("src");
    const quality = $(".btn.download-btn .tag").text().trim() || "Unknown";

    return { download, thumbnail, quality };
  } catch (err) {
    throw new Error(err.message);
  }
}

module.exports = threadsDownloader;

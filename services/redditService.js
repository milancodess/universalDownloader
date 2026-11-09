const axios = require("axios");
const cheerio = require("cheerio");

async function redditDownloader(url) {
  try {
    const rapidUrl = `https://rapidsave.com/info?url=${encodeURIComponent(url)}`;

    const res = await axios.get(rapidUrl, {
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0",
        referer: "https://rapidsave.com/",
      },
    });

    const $ = cheerio.load(res.data);

    const downloadUrl = $("a.downloadbutton").attr("href");

    if (!downloadUrl) {
      throw new Error("Download link not found");
    }

    return downloadUrl;
  } catch (err) {
    throw new Error(err.message);
  }
}

module.exports = redditDownloader;

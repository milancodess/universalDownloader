const axios = require("../lib/httpClient");
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

    if (typeof res.data !== "string") {
      throw new Error("Invalid response from RapidSave");
    }

    const $ = cheerio.load(res.data);

    const downloadUrl = $("a.downloadbutton").attr("href");

    if (!downloadUrl || downloadUrl.startsWith("#")) {
      throw new Error("Download link not found");
    }

    const resolvedUrl = new URL(downloadUrl, rapidUrl);
    if (!["http:", "https:"].includes(resolvedUrl.protocol)) {
      throw new Error("Download link not found");
    }

    return resolvedUrl.href;
  } catch (err) {
    throw new Error(err.message, { cause: err });
  }
}

module.exports = redditDownloader;

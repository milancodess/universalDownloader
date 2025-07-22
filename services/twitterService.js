const axios = require("axios");
const cheerio = require("cheerio");

async function downloadTwmateData(twitterUrl) {
  const formData = `page=${encodeURIComponent(twitterUrl)}&ftype=all&ajax=1`;

  try {
    const { data } = await axios.post("https://twmate.com/", formData, {
      headers: {
        accept: "*/*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        referer: "https://twmate.com/",
        "user-agent": "Mozilla/5.0",
      },
    });

    const $ = cheerio.load(data);
    const results = [];

    $("table.files-table tbody tr").each((_, row) => {
      const quality = $(row).find("td").eq(0).text().trim();
      const type = $(row).find("td").eq(1).text().trim();
      const url = $(row).find("td a").attr("href");

      if (quality && type && url) {
        results.push({ quality, type, url });
      }
    });

    return results;
  } catch (err) {
    throw new Error("Twitter download failed: " + err.message);
  }
}

module.exports = { downloadTwmateData };

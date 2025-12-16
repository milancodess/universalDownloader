const axios = require("axios");
const cheerio = require("cheerio");

async function downloadTwmateData(twitterUrl) {
  twitterUrl = twitterUrl.replace("x.com", "twitter.com");

  const formData = `page=${encodeURIComponent(twitterUrl)}&ftype=all`;

  const { data } = await axios.post("https://twmate.com/en2/", formData, {
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      referer: "https://twmate.com/en2/",
    },
  });

  const $ = cheerio.load(data);
  const results = [];

  $(".files-table tbody tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length < 3) return;

    results.push({
      quality: tds.eq(0).text().trim(),
      type: tds.eq(1).text().trim(),
      url: tds.eq(2).find("a.btn-dl").attr("href"),
    });
  });

  if (!results.length) {
    throw new Error("No download links found");
  }

  return results;
}

module.exports = { downloadTwmateData };

const axios = require("../lib/httpClient");
const cheerio = require("cheerio");
const { resolveMediaUrl } = require("../lib/resolveMediaUrl");

async function fetchPinterestMedia(url) {
  const encodedUrl = encodeURIComponent(url);
  const fullUrl = `https://www.savepin.app/download.php?url=${encodedUrl}&lang=en&type=redirect`;

  try {
    const response = await axios.get(fullUrl, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        Referer: "https://www.savepin.app/",
      },
    });

    if (typeof response.data !== "string") {
      throw new Error("Invalid response from SavePin");
    }

    const $ = cheerio.load(response.data);
    const title = $("h1").first().text().trim();
    const thumbnail = resolveMediaUrl($(".image-container img").attr("src"), fullUrl);
    const results = [];

    $("tbody tr").each((_, el) => {
      const quality = $(el).find(".video-quality").text().trim();
      const format = $(el).find("td:nth-child(2)").text().trim();
      const href = $(el).find("a").attr("href");
      const wrapperUrl = resolveMediaUrl(href, fullUrl);
      if (!wrapperUrl) return;

      let directUrl;
      try {
        const link = new URL(wrapperUrl);
        // Only SavePin wrappers contain a nested destination. A direct CDN URL
        // may have its own signed `url` parameter, which must remain untouched.
        const providerHost = new URL(fullUrl).hostname;
        const wrapped = link.hostname === providerHost && link.searchParams.has("url");
        const target = wrapped ? link.searchParams.get("url") : link.href;
        directUrl = resolveMediaUrl(target);
      } catch {
        // One malformed row should not hide the remaining download options.
        return;
      }

      if (quality && format && directUrl) {
        results.push({
          quality,
          format,
          url: directUrl,
        });
      }
    });

    if (!results.length) {
      throw new Error("No media found");
    }

    return {
      title,
      thumbnail,
      downloads: results,
    };
  } catch (error) {
    throw new Error("Failed to scrape Pinterest media: " + error.message, { cause: error });
  }
}

module.exports = { fetchPinterestMedia };

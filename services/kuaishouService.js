const axios = require("axios");

async function scrapeKuaishou(videoUrl) {
  if (!videoUrl) throw new Error("Missing video URL");

  try {
    const response = await axios.post(
      "https://kuaishouvideodownloader.net/api/fetch-video-info",
      { videoUrl },
      {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.8",
          "content-type": "application/json",
          priority: "u=1, i",
          "sec-ch-ua":
            '"Chromium";v="140", "Not=A?Brand";v="24", "Brave";v="140"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "sec-gpc": "1",
          Referer: "https://kuaishouvideodownloader.net/",
        },
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(
      `Error scraping Kuaishou video: ${error.response?.data || error.message}`
    );
  }
}

module.exports = { scrapeKuaishou };

const axios = require("axios");

function extractTikTokId(url) {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

async function fetchTikTokData(videoId) {
  const apiUrl = `https://api.twitterpicker.com/tiktok/mediav2?id=${videoId}`;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        priority: "u=1, i",
        "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "sec-gpc": "1",
        Referer: "https://tiktokdownloader.com/",
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(`TikTok API request failed: ${error.message}`);
  }
}

module.exports = {
  extractTikTokId,
  fetchTikTokData,
};

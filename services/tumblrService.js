const axios = require("axios");

/**
 * Fetch Tumblr download data from Tumbleclip API.
 * @param {string} tumblrUrl - Tumblr post URL
 * @returns {Promise<Object>}
 */
async function fetchTumblrData(tumblrUrl) {
  const apiUrl = "https://tumbleclip.com/api/tumblr";

  try {
    const res = await axios.post(
      apiUrl,
      { url: tumblrUrl },
      {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.6",
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
          Referer: "https://tumbleclip.com/en",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        },
      }
    );

    return res.data;
  } catch (error) {
    throw new Error(`Tumbleclip request failed: ${error.message}`);
  }
}

module.exports = { fetchTumblrData };

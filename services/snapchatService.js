const axios = require("axios");

async function fetchSnapchat(url) {
  try {
    const apiUrl = "https://solyptube.com/findsnapchatvideo";

    const response = await axios.post(
      apiUrl,
      { url },
      {
        headers: {
          "accept": "*/*",
          "accept-language": "en-US,en;q=0.6",
          "content-type": "application/json",
          "dnt": "1",
          "origin": "https://spotlight.how2shout.com",
          "priority": "u=1, i",
          "referer": "https://spotlight.how2shout.com/",
          "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Brave";v="140"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "sec-gpc": "1",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        },
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  } catch (error) {
    console.error(error.response?.data || error.message);
    throw new Error(`Snapchat API request failed: ${error.message}`);
  }
}

module.exports = { fetchSnapchat };

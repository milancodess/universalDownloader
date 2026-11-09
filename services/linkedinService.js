const axios = require("axios");

async function fetchLinkedinData(url) {
  try {
    const apiUrl = "https://saywhat.ai/api/fetch-linkedin-page/";

    const response = await axios.post(
      apiUrl,
      { url },
      {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          "content-type": "application/json",
          priority: "u=1, i",
          "sec-ch-ua":
            '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "sec-gpc": "1",
          Referer: "https://saywhat.ai/tools/linkedin-video-downloader/",
        },
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`LinkedIn API request failed: ${error.message}`);
  }
}

module.exports = { fetchLinkedinData };

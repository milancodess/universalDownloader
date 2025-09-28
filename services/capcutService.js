const axios = require("axios");

async function fetchCapcutData(url) {
  try {
    const apiUrl = "https://3bic.com/api/download/";

    const response = await axios.post(
      apiUrl,
      { url },
      {
        headers: { 
            'accept': 'application/json, text/plain, */*', 
            'accept-language': 'en-US,en;q=0.9,fr;q=0.8,ne;q=0.7,ja;q=0.6', 
            'content-type': 'application/json', 
            'origin': 'https://3bic.com', 
            'priority': 'u=1, i', 
            'referer': 'https://3bic.com/', 
            'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"', 
            'sec-ch-ua-mobile': '?0', 
            'sec-ch-ua-platform': '"Windows"', 
            'sec-fetch-dest': 'empty', 
            'sec-fetch-mode': 'cors', 
            'sec-fetch-site': 'same-origin', 
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        },
      }
    );

    return {
        code: response.data.code,
        title: response.data.title,
        videoUrl: `https://3bic.com${response.data.originalVideoUrl}`,
        coverUrl: response.data.coverUrl,
        author: response.data.authorName,
    };
  } catch (error) {
    throw new Error(`Capcut API request failed: ${error.message}`);
  }
}

module.exports = { fetchCapcutData };

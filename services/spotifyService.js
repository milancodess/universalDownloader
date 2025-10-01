const axios = require('axios');

async function fetchSpotify(url) {
  try {
    const spotisongUrl = `https://spotisongdownloader.to/api/composer/spotify/xsingle_track.php?url=${encodeURIComponent(url)}`;
    const spotisongReq = axios.get(spotisongUrl);

    const videosoloReq = axios.post(
      'https://parsevideoapi.videosolo.com/spotify-api/',
      {
        format: "web",
        url
      },
      {
        headers: { 
          'accept': 'application/json, text/javascript, */*; q=0.01', 
          'content-type': 'application/json', 
          'origin': 'https://spotidown.online', 
          'referer': 'https://spotidown.online/', 
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        },
        maxBodyLength: Infinity
      }
    );

    const [spotisongRes, videosoloRes] = await Promise.all([spotisongReq, videosoloReq]);

    const spotisongData = spotisongRes.data;
    if (!spotisongData || spotisongData.res !== 200) {
      throw new Error("Failed to fetch spotisong metadata");
    }

    const videoData = videosoloRes.data?.data?.metadata;
    if (!videoData) {
      throw new Error("Failed to fetch VideoSolo data");
    }

    return {
      title: spotisongData.song_name || videoData.name,
      album: spotisongData.album_name || videoData.album,
      author: spotisongData.artist || videoData.artist,
      thumbnail: spotisongData.img || videoData.image,
      duration: spotisongData.duration || videoData.duration,
      released: spotisongData.released || null,
      downloadLink: videoData.download || null,
    };
  } catch (err) {
    throw new Error(`Spotify fetch failed: ${err.message}`);
  }
}

module.exports = { fetchSpotify };

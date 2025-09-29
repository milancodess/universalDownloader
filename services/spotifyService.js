const axios = require('axios');

async function fetchSpotify(url) {
  try {
    // Spotisongdownloader API
    const spotisongUrl = `https://spotisongdownloader.to/api/composer/spotify/xsingle_track.php?url=${encodeURIComponent(url)}`;
    const spotisongReq = axios.get(spotisongUrl);

    // Downloaderize API
    const downloaderizeReq = axios.post(
      'https://spotify.downloaderize.com/wp-admin/admin-ajax.php',
      `action=spotify_downloader_get_info&url=${encodeURIComponent(url)}&nonce=56de9e968b`,
      {
        headers: {
          'accept': 'application/json, text/javascript, */*; q=0.01',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'origin': 'https://spotify.downloaderize.com',
          'referer': 'https://spotify.downloaderize.com/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
          'x-requested-with': 'XMLHttpRequest'
        }
      }
    );

    // Run both requests in parallel
    const [spotisongRes, downloaderizeRes] = await Promise.all([spotisongReq, downloaderizeReq]);

    // Parse spotisong
    const spotisongData = spotisongRes.data;
    if (!spotisongData || spotisongData.res !== 200) {
      throw new Error("Failed to fetch spotisong metadata");
    }

    // Parse downloaderize
    const downloadLinks = (downloaderizeRes.data?.data?.medias || []).map(m => ({
      url: m.url,
      quality: m.quality || "unknown",
      extension: m.extension || "mp3",
      type: m.type || "audio"
    }));

    // Final merged response
    return {
      title: spotisongData.song_name,
      album: spotisongData.album_name,
      author: spotisongData.artist,
      thumbnail: spotisongData.img,
      duration: spotisongData.duration,
      released: spotisongData.released,
      downloadLinks
    };
  } catch (err) {
    throw new Error(`Spotify fetch failed: ${err.message}`);
  }
}

module.exports = { fetchSpotify };

const http = require("../lib/httpClient");

// Apply only inside the dedicated Meta worker. metadownloader uses the default
// axios singleton and provides no way to pass request options of its own.
function configureMetaHttp(client, mediaUrl) {
  for (const key of ["timeout", "maxContentLength", "maxBodyLength", "maxRedirects"]) {
    client.defaults[key] = http.defaults[key];
  }

  client.interceptors.request.use((config) => {
    // The dependency concatenates this one form field without encoding it.
    // Repair that exact payload while leaving every other request untouched.
    if (config.method === "post" && config.data === `url=${mediaUrl}`) {
      config.data = new URLSearchParams({ url: mediaUrl }).toString();
    }
    return config;
  });
}

module.exports = { configureMetaHttp };

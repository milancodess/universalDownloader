const axios = require("axios");

// Providers return metadata/HTML here; media files are downloaded by API clients.
const client = axios.create({
  timeout: 15000,
  maxContentLength: 5 * 1024 * 1024,
  maxBodyLength: 1024 * 1024,
  maxRedirects: 5,
});

const deadline = Symbol("requestDeadline");

client.interceptors.request.use((config) => {
  // Also limit total elapsed time, including DNS, redirects and slow responses.
  const timeout = Number(config.timeout);
  if (Number.isFinite(timeout) && timeout > 0) {
    const signal = AbortSignal.timeout(timeout);
    config[deadline] = signal;
    config.signal = config.signal
      ? AbortSignal.any([config.signal, signal])
      : signal;
  }
  return config;
});

client.interceptors.response.use(undefined, (error) => {
  const signal = error.config?.[deadline];
  if (signal?.aborted && error.config.signal.reason === signal.reason) {
    error.code = "ETIMEDOUT";
    error.message = "Upstream request timed out";
  }
  return Promise.reject(error);
});

module.exports = client;

const { parentPort, workerData } = require("node:worker_threads");
const axios = require("axios");
const { configureMetaHttp } = require("./configureMetaHttp");

configureMetaHttp(axios, workerData);
const snapsave = require("metadownloader");

// Dependency HTTP requests are confined to this worker so they can be stopped.
async function download() {
  const result = await snapsave(workerData);
  parentPort.postMessage(result);
}

download();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EXTRACT_TIMEOUT_MS } = require("../lib/ytDlp");

// Run the browser event handlers with a small DOM fixture, without network or
// animation timing, to reproduce late events from replaced media elements.
function loadApp() {
  const elements = new Map();
  let document;
  class Element {
    constructor(tag = "div") {
      this.tagName = tag;
      this.children = [];
      this.attributes = new Map();
      this.listeners = new Map();
      this.dataset = {};
      this.value = "";
      this.textContent = "";
      this.hidden = false;
      this.options = [];
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle: (name, force = !classes.has(name)) => force ? classes.add(name) : classes.delete(name),
      };
    }
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    }
    dispatch(type) { for (const handler of this.listeners.get(type) || []) handler({ target: this }); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) || null; }
    removeAttribute(name) { this.attributes.delete(name); }
    contains(element) { return this === element || this.children.some((child) => child.contains(element)); }
    querySelector(selector) {
      if (selector === "video, audio") return this.children.find((child) => ["video", "audio"].includes(child.tagName)) || null;
      return this.children.find((child) => child.tagName === selector) || this.append(new Element(selector));
    }
    append(child) { child.parentElement = this; this.children.push(child); return child; }
    replaceChildren(...children) {
      for (const child of this.children) child.parentElement = null;
      this.children = [];
      for (const child of children) this.append(child);
    }
    focus() { document.activeElement = this; }
    pause() { this.paused = true; }
    load() {}
    play() { return Promise.resolve(); }
  }
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  document = {
    getElementById: get,
    createElement: (tag) => new Element(tag),
    querySelectorAll: () => [],
    addEventListener() {},
    body: new Element("body"),
  };
  get("status").parentElement = new Element();
  get("platform").value = "auto";
  get("platform").options = [{ value: "auto", textContent: "Automatic" }];
  const context = vm.createContext({
    document,
    window: { addEventListener() {} },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    DownloaderMedia: require("../web/media"),
    URL, URLSearchParams, AbortController, AbortSignal,
    setTimeout: () => 1, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../web/app.js"), "utf8"), context);
  vm.runInContext(`
    current = { media: { title: "Example", thumbnail: null }, resolvedAt: Date.now() };
    selected = { kind: "video", format: "mp4", url: "https://cdn.example/first.mp4", local: false };
  `, context);
  return { context, get };
}

test("a queued error from a replaced preview cannot remove the current player or steal focus", () => {
  const { context, get } = loadApp();
  get("preview-button").dispatch("click");
  const oldPlayer = get("player-container").children[0];
  vm.runInContext(`selected = { ...selected, url: "https://cdn.example/second.mp4" }; showPreview(selected);`, context);
  get("preview-button").dispatch("click");
  const currentPlayer = get("player-container").children[0];
  assert.notEqual(oldPlayer, currentPlayer);
  oldPlayer.dispatch("error");
  assert.equal(get("player-container").children[0], currentPlayer);
  assert.equal(context.document.activeElement, currentPlayer);
  assert.equal(get("player-container").hidden, false);
});

test("an error on the active preview restores the preview control and explains recovery", () => {
  const { context, get } = loadApp();
  get("preview-button").dispatch("click");
  get("player-container").children[0].dispatch("error");
  assert.equal(get("player-container").children.length, 0);
  assert.equal(get("player-container").hidden, true);
  assert.equal(get("preview-button").hidden, false);
  assert.equal(context.document.activeElement, get("preview-button"));
  assert.match(get("toast").textContent, /can’t be previewed/);
});

test("refreshing the same preparation keeps its poller and ready-file expiry", () => {
  const { context } = loadApp();
  vm.runInContext(`
    const activeItem = { url: "/api/files/active", preparation: true };
    const readyItem = { url: "/api/files/ready", preparation: true };
    const active = { item: activeItem, context: current, status: { state: "downloading" }, controller: new AbortController(), polling: true };
    const ready = { item: readyItem, context: current, status: { state: "ready", expiresAt: 12345, sizeBytes: 2000 } };
    preparationJobs.set(activeItem.url, active);
    preparationJobs.set(readyItem.url, ready);
    activePreparation = active;
    const next = { media: { items: [{ ...activeItem }, { ...readyItem, sizeBytes: 1000, estimated: true }] } };
    retainPreparations(next);
    current = next;
  `, context);
  assert.equal(vm.runInContext("activePreparation === active && active.polling && !active.controller.signal.aborted", context), true);
  assert.equal(vm.runInContext("active.context === current && active.item === current.media.items[0]", context), true);
  assert.equal(vm.runInContext("preparationJobs.get(readyItem.url) === ready && ready.context === current", context), true);
  assert.equal(vm.runInContext("ready.status.expiresAt", context), 12345);
  assert.equal(vm.runInContext("current.media.items[1].sizeBytes", context), 2000);
  assert.equal(vm.runInContext("current.media.items[1].estimated", context), false);
});

test("replacing a source cancels a preparation that has no controls in the new result", () => {
  const { context } = loadApp();
  context.fetch = () => new Promise(() => {});
  vm.runInContext(`
    const old = { item: { url: "/api/files/old", preparation: true }, context: current,
      status: { state: "downloading" }, controller: new AbortController(), polling: true };
    preparationJobs.set(old.item.url, old);
    activePreparation = old;
    lastPreparationIssue = old;
    const next = { media: { items: [{ url: "/api/files/new", preparation: true }] } };
    retainPreparations(next);
    current = next;
  `, context);
  assert.equal(vm.runInContext("old.controller.signal.aborted", context), true);
  assert.equal(vm.runInContext("activePreparation", context), null);
  assert.equal(vm.runInContext("lastPreparationIssue", context), null);
  assert.equal(vm.runInContext("preparationJobs.size", context), 0);
});

for (const [platform, source] of [
  ["SoundCloud", "https://soundcloud.com/artist/public-track"],
  ["TikTok", "https://www.tiktok.com/@creator/video/7000000000000000000"],
]) {
  test(`${platform} extraction can use the server deadline before browser timeout recovery`, async () => {
    const { context, get } = loadApp();
    const timers = [];
    let requestSignal;
    context.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
    context.setInterval = () => 1;
    context.clearInterval = () => {};
    context.fetch = (url, { signal }) => new Promise((resolve, reject) => {
      requestSignal = signal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    get("media-url").value = source;
    const pending = get("download-form").listeners.get("submit")[0]({ preventDefault() {} });
    assert.equal(requestSignal.aborted, false);
    assert.equal(get("submit-button").disabled, true);
    // The previous 35-second browser timeout cut off otherwise valid 60-second
    // extractor work. Let the backend finish or report its own timeout first.
    const deadline = timers.find(({ delay }) => delay > EXTRACT_TIMEOUT_MS);
    assert.ok(deadline, "browser deadline must exceed the extractor deadline");
    assert.equal(timers.some(({ delay }) => delay > 1000 && delay <= EXTRACT_TIMEOUT_MS), false);
    deadline.callback();
    await pending;
    assert.equal(requestSignal.aborted, true);
    assert.equal(get("submit-button").disabled, false);
    assert.match(get("search-error-message").textContent, /took too long/);
  });
}

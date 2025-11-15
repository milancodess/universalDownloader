const platforms = [
  {
    label: "Bluesky",
    slug: "bluesky",
    placeholder: "https://bsky.app/profile/.../post/...",
  },
  {
    label: "CapCut",
    slug: "capcut",
    placeholder: "https://www.capcut.com/...",
  },
  {
    label: "Dailymotion",
    slug: "dailymotion",
    placeholder: "https://www.dailymotion.com/video/...",
  },
  {
    label: "Douyin",
    slug: "douyin",
    placeholder: "https://www.douyin.com/video/...",
  },
  {
    label: "Facebook / Instagram (Meta)",
    slug: "meta",
    placeholder: "https://www.instagram.com/p/...",
  },
  {
    label: "Kuaishou",
    slug: "kuaishou",
    placeholder: "https://www.kuaishou.com/...",
  },
  {
    label: "LinkedIn",
    slug: "linkedin",
    placeholder: "https://www.linkedin.com/posts/...",
  },
  {
    label: "Pinterest",
    slug: "pinterest",
    placeholder: "https://www.pinterest.com/pin/...",
  },
  {
    label: "Reddit",
    slug: "reddit",
    placeholder: "https://www.reddit.com/r/.../comments/...",
  },
  {
    label: "Snapchat",
    slug: "snapchat",
    placeholder: "https://story.snapchat.com/s/...",
  },
  {
    label: "Soundcloud",
    slug: "soundcloud",
    placeholder: "https://soundcloud.com/...",
  },
  {
    label: "Spotify",
    slug: "spotify",
    placeholder: "https://open.spotify.com/track/...",
  },
  {
    label: "Threads",
    slug: "threads",
    placeholder: "https://www.threads.net/@user/post/...",
  },
  {
    label: "TikTok",
    slug: "tiktok",
    placeholder: "https://www.tiktok.com/@user/video/...",
  },
  {
    label: "Tumblr",
    slug: "tumblr",
    placeholder: "https://www.tumblr.com/...",
  },
  {
    label: "Twitter / X",
    slug: "twitter",
    placeholder: "https://twitter.com/user/status/...",
  },
  {
    label: "YouTube",
    slug: "youtube",
    placeholder: "https://www.youtube.com/watch?v=...",
  },
];

const form = document.getElementById("downloadForm");
const select = document.getElementById("platform");
const urlInput = document.getElementById("contentUrl");
const output = document.getElementById("responseOutput");
const statusMessage = document.getElementById("statusMessage");
const endpointGrid = document.getElementById("endpointGrid");
const endpointCount = document.getElementById("endpointCount");
const copyButton = document.getElementById("copyButton");
const linksContainer = document.getElementById("links");
const submitButton = document.getElementById("submitButton");

const formatPlatformPath = (slug) => `/api/${slug}/download`;

const populatePlatforms = () => {
  const fragment = document.createDocumentFragment();

  platforms.forEach((platform) => {
    const option = document.createElement("option");
    option.value = platform.slug;
    option.textContent = platform.label;
    fragment.appendChild(option);

    const endpointCard = document.createElement("div");
    endpointCard.className = "endpoint";
    endpointCard.innerHTML = `
      <strong>${platform.label}</strong>
      <code>${formatPlatformPath(platform.slug)}</code>
    `;
    endpointGrid.appendChild(endpointCard);
  });

  select.appendChild(fragment);
  endpointCount.textContent = `${platforms.length} endpoints`;
};

populatePlatforms();

select.addEventListener("change", (event) => {
  const selected = platforms.find((item) => item.slug === event.target.value);
  if (selected?.placeholder) {
    urlInput.placeholder = selected.placeholder;
  }
});

const setStatus = (message, type = "info") => {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`.trim();
};

const stringify = (payload) => {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return "Unable to stringify response.";
  }
};

const extractLinks = (payload) => {
  const urls = new Set();

  const walk = (value) => {
    if (!value) return;

    if (typeof value === "string" && /^https?:\/\//.test(value)) {
      urls.add(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };

  walk(payload);
  return Array.from(urls).slice(0, 12);
};

const renderLinks = (links) => {
  linksContainer.innerHTML = "";

  if (!links.length) {
    return;
  }

  links.forEach((href, index) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = `Download link ${index + 1}`;
    linksContainer.appendChild(anchor);
  });
};

const handleSubmit = async (event) => {
  event.preventDefault();

  if (!select.value || !urlInput.value.trim()) {
    setStatus("Select a platform and paste a URL first.", "error");
    return;
  }

  const endpoint = `${formatPlatformPath(select.value)}?url=${encodeURIComponent(
    urlInput.value.trim()
  )}`;

  setStatus("Contacting the API...", "pending");
  form.classList.add("pending");
  submitButton.disabled = true;

  try {
    const response = await fetch(endpoint);
    const payload = await response.json().catch(() => ({ message: "Non JSON" }));
    output.textContent = stringify(payload);
    renderLinks(extractLinks(payload));

    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || payload.message || "Something went wrong.");
    }

    setStatus("Success! Scroll down for the raw payload.", "success");
  } catch (error) {
    setStatus(error.message || "Unable to reach the API.", "error");
  } finally {
    submitButton.disabled = false;
    form.classList.remove("pending");
  }
};

form.addEventListener("submit", handleSubmit);

copyButton.addEventListener("click", async () => {
  const text = output.textContent.trim();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied response JSON to clipboard.", "success");
  } catch {
    setStatus("Clipboard copy failed.", "error");
  }
});

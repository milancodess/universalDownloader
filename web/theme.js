/* Runs before styles so a remembered appearance is applied before first paint. */
(function () {
  "use strict";
  const storageKey = "universal.theme";
  const modes = ["system", "light", "dark"];
  const labels = { system: "System", light: "Light", dark: "Dark" };
  const normalize = (value) => modes.includes(value) ? value : "system";
  const nextMode = () => modes[(modes.indexOf(preference) + 1) % modes.length];
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  let control;
  try { preference = normalize(localStorage.getItem(storageKey)); } catch { /* Storage can be disabled. */ }

  function apply() {
    const appearance = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = appearance;
    document.querySelector('meta[name="color-scheme"]').content = appearance;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.content = appearance === "dark" ? "#17141b" : "#f7f5f2";
      meta.removeAttribute("media");
    }
    if (control) {
      control.dataset.mode = preference;
      control.setAttribute("aria-label", "Theme: " + labels[preference] + ". Switch to " + labels[nextMode()] + ".");
      document.getElementById("theme-current").textContent = labels[preference];
      document.getElementById("theme-next").textContent = "Next: " + labels[nextMode()];
    }
  }

  apply();
  // Explicit choices stay fixed; System continues following live device changes.
  const onSystemChange = () => { if (preference === "system") apply(); };
  if (system.addEventListener) system.addEventListener("change", onSystemChange);
  else system.addListener(onSystemChange);

  document.addEventListener("DOMContentLoaded", () => {
    control = document.getElementById("theme-toggle");
    if (!control) return;
    control.disabled = false;
    apply();
    // Enable once after the initial appearance. Removing transitions on a timer
    // can interrupt colors that are still settling, especially during rapid clicks.
    document.documentElement.classList.add("theme-ready");
    control.addEventListener("click", () => {
      preference = nextMode();
      apply();
      document.getElementById("theme-announcement").textContent = labels[preference] + " theme selected.";
      try { localStorage.setItem(storageKey, preference); } catch { /* The choice still works for this page. */ }
    });
  }, { once: true });

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    preference = normalize(event.newValue);
    apply();
  });
}());

// Dark mode toggle. Fully self-contained — only touches the DOM and
// localStorage, no dependency on the wizard's bill/people state.

export function setupThemeToggle() {
  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.id = "theme-toggle";
  themeBtn.style.cssText =
    "margin-left:auto;background:transparent;border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:16px;color:var(--ink);line-height:1;";

  function syncThemeBtn() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.textContent = dark ? "☀️" : "🌙";
    themeBtn.title = dark ? "Mode terang" : "Mode gelap";
  }

  themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    try {
      if (dark) {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("patungan_theme", "light");
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("patungan_theme", "dark");
      }
    } catch {
      /* noop */
    }
    syncThemeBtn();
  });

  document.querySelector(".brand")?.appendChild(themeBtn);
  syncThemeBtn();
}

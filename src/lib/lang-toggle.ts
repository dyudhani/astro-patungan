// ID/EN language toggle button, styled like the dark-mode toggle it sits next to.

import { getLang, setLang } from "./i18n";

export function setupLangToggle() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "lang-toggle";
  btn.style.cssText =
    "background:transparent;border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px;font-weight:700;color:var(--ink);line-height:1;";

  function sync() {
    const lang = getLang();
    btn.textContent = lang === "id" ? "EN" : "ID";
    btn.title = lang === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia";
  }

  btn.addEventListener("click", () => {
    setLang(getLang() === "id" ? "en" : "id");
    sync();
  });

  document.querySelector(".brand")?.appendChild(btn);
  sync();
}

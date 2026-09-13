// Custom "Add to Home Screen" banner. Chrome/Android fires a
// beforeinstallprompt event we can defer and trigger from our own UI; iOS
// Safari has no such API, so it gets a one-time manual-steps tip instead.

import { t } from "./i18n";

const DISMISS_KEY = "patungan_install_dismissed_at";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return (Date.now() - Number(raw)) / 86_400_000 < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
}

// A dismissible bottom banner, optionally with one action button.
function buildBanner(
  message: string,
  actionLabel: string | null,
  onAction: (() => void) | null,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;bottom:16px;left:16px;right:16px;max-width:400px;margin:0 auto;background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow-sm);z-index:1050;display:flex;align-items:center;gap:12px;";

  const span = document.createElement("div");
  span.style.cssText = "flex:1;font-size:13px;color:var(--ink);";
  span.textContent = message;
  el.appendChild(span);

  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.style.cssText = "font-size:13px;padding:8px 14px;flex-shrink:0;";
    btn.textContent = actionLabel;
    btn.addEventListener("click", onAction);
    el.appendChild(btn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", t("closeAria"));
  closeBtn.textContent = "✕";
  closeBtn.style.cssText =
    "background:none;border:none;color:var(--ink-muted);cursor:pointer;font-size:16px;flex-shrink:0;";
  closeBtn.addEventListener("click", () => {
    markDismissed();
    el.remove();
  });
  el.appendChild(closeBtn);

  return el;
}

export function setupInstallPrompt() {
  if (isStandalone() || wasDismissedRecently()) return;

  let deferredPrompt: any = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = buildBanner(
      t("installBannerText"),
      t("installBtn"),
      async () => {
        banner.remove();
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "dismissed") markDismissed();
        deferredPrompt = null;
      },
    );
    document.body.appendChild(banner);
  });

  window.addEventListener("appinstalled", markDismissed);

  // iOS Safari never fires beforeinstallprompt — show manual steps instead.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS) {
    setTimeout(() => {
      if (wasDismissedRecently()) return;
      document.body.appendChild(buildBanner(t("installIOSText"), null, null));
    }, 3000);
  }
}

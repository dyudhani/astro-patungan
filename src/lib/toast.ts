// Lightweight snackbar with an optional action button, auto-dismissing.
// Only one shows at a time — a new toast replaces whatever is on screen.

let active: { el: HTMLElement; timer: number } | null = null;

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

export function showToast(message: string, opts: ToastOptions = {}) {
  const { actionLabel, onAction, duration = 5000 } = opts;

  if (active) {
    clearTimeout(active.timer);
    active.el.remove();
    active = null;
  }

  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:12px 16px;border-radius:10px;display:flex;align-items:center;gap:14px;box-shadow:var(--shadow-sm);z-index:1100;font-size:14px;max-width:90vw;";

  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);

  const close = () => {
    el.remove();
    if (active?.el === el) active = null;
  };

  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = actionLabel;
    btn.style.cssText =
      "background:none;border:none;color:var(--accent);font-weight:700;cursor:pointer;flex-shrink:0;font-size:14px;";
    btn.addEventListener("click", () => {
      onAction();
      close();
    });
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  const timer = window.setTimeout(close, duration);
  active = { el, timer };
}

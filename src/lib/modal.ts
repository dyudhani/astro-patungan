// Custom alert/confirm dialog replacing native browser ones (unstyled, jarring).
// Reuses the .card/.btn classes from Layout.astro so it themes for free.

function buildOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000;";
  return overlay;
}

function buildDialog(message: string): HTMLDivElement {
  const dialog = document.createElement("div");
  dialog.className = "card";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.style.cssText =
    "max-width:360px;width:100%;margin:0;animation:none;";
  const p = document.createElement("p");
  p.textContent = message;
  p.style.cssText = "color:var(--ink);font-size:15px;line-height:1.5;margin:0 0 18px;white-space:pre-line;";
  dialog.setAttribute("aria-label", message);
  dialog.appendChild(p);
  return dialog;
}

function buildButtonRow(): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "btn-row";
  row.style.marginTop = "0";
  return row;
}

/** Show a message with a single "OK" button. Resolves once dismissed. */
export function showAlert(message: string, okLabel = "OK"): Promise<void> {
  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const dialog = buildDialog(message);
    const row = buildButtonRow();

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn-primary btn-block";
    ok.textContent = okLabel;

    const close = () => {
      overlay.remove();
      resolve();
    };
    ok.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Enter") close();
    });

    row.appendChild(ok);
    dialog.appendChild(row);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    ok.focus();
  });
}

// Show a message with Cancel/Confirm buttons. Resolves true if confirmed,
// false if cancelled (button, backdrop click, or Escape).
export function showConfirm(
  message: string,
  opts: { confirmLabel?: string; cancelLabel?: string } = {},
): Promise<boolean> {
  const { confirmLabel = "Ya", cancelLabel = "Batal" } = opts;
  return new Promise((resolve) => {
    const overlay = buildOverlay();
    const dialog = buildDialog(message);
    const row = buildButtonRow();

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-secondary";
    cancel.style.flex = "1";
    cancel.textContent = cancelLabel;

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn btn-primary";
    confirmBtn.style.flex = "1";
    confirmBtn.textContent = confirmLabel;

    const close = (value: boolean) => {
      overlay.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => close(false));
    confirmBtn.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    });

    row.appendChild(cancel);
    row.appendChild(confirmBtn);
    dialog.appendChild(row);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

// Optional passcode lock. This keeps casual eyes out on a shared device; it
// does not encrypt the stored data.

import { store } from "../store.js";
import { escapeHtml } from "../util.js";
import { toast, icon } from "./dom.js";

const ITERATIONS = 150000;
const LOCK_AFTER_MS = 5 * 60 * 1000;

async function hashPin(pin, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function newSalt() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export function isLocked() {
  return Boolean(store.local.pinHash);
}

async function verify(pin) {
  const meta = store.local.pinSalt;
  if (!meta) return false;
  return (await hashPin(pin, meta.salt)) === store.local.pinHash;
}

/** Shows the lock screen; resolves when unlocked. */
export function showLock() {
  const el = document.getElementById("lock");
  const length = store.local.pinSalt?.length || 4;
  let entered = "";
  let busy = false;
  return new Promise((resolve) => {
    const render = (error = "") => {
      el.innerHTML = `
        <div class="lock-inner">
          ${icon("lock", "icon lock-icon")}
          <p class="lock-title">Enter passcode</p>
          <div class="dots ${error ? "is-wrong" : ""}" aria-label="${entered.length} of ${length} digits">${Array.from({ length }, (_, i) => `<i class="${i < entered.length ? "on" : ""}"></i>`).join("")}</div>
          <p class="lock-error" role="alert">${escapeHtml(error)}</p>
          <div class="keypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-key="${n}">${n}</button>`).join("")}
            <span></span><button type="button" data-key="0">0</button>
            <button type="button" data-back aria-label="Delete">⌫</button>
          </div>
          <button type="button" class="link-btn lock-forgot" data-forgot>${forgotStage === 0 ? "Forgot passcode?" : forgotStage === 1 ? "Erase this device's data to reset. Tap again to erase." : "Erasing…"}</button>
        </div>`;
    };
    let forgotStage = 0;
    const press = async (key) => {
      if (busy) return;
      if (key === "back") entered = entered.slice(0, -1);
      else if (entered.length < length) entered += key;
      render();
      if (entered.length === length) {
        busy = true;
        const ok = await verify(entered);
        busy = false;
        if (ok) {
          el.hidden = true;
          el.innerHTML = "";
          document.removeEventListener("keydown", onKey);
          resolve();
        } else {
          entered = "";
          render("Wrong passcode. Try again.");
        }
      }
    };
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
    };
    el.onclick = (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.forgot !== undefined) {
        forgotStage += 1;
        render();
        if (forgotStage >= 2) store.eraseAll().then(() => location.reload());
        return;
      }
      press(btn.dataset.back !== undefined ? "back" : btn.dataset.key);
    };
    document.addEventListener("keydown", onKey);
    el.hidden = false;
    render();
  });
}

/** Locks again after the app has been in the background for a while. */
export function watchForRelock(onLock) {
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (isLocked() && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) onLock();
  });
}

export function renderLockSettings(main) {
  const on = isLocked();
  main.innerHTML = `
    <header class="page-head"><div><a class="back" href="#/settings">${icon("back")} Settings</a><h1>App lock</h1></div></header>
    <form class="group pad-group lock-form" novalidate>
      ${on ? `
        <p>The app asks for your passcode when it opens, and again after 5 minutes in the background.</p>
        <label class="field"><span class="field-label">Current passcode</span><input name="current" type="password" inputmode="numeric" autocomplete="off" maxlength="6" /></label>
        <div class="row-end"><button type="submit" class="btn btn-danger" name="action" value="off">Turn off</button></div>
      ` : `
        <p>Choose a 4 to 6 digit passcode. It applies to this device only.</p>
        <label class="field"><span class="field-label">New passcode</span><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" /></label>
        <label class="field"><span class="field-label">Type it again</span><input name="pin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" /></label>
        <div class="row-end"><button type="submit" class="btn btn-primary">Turn on</button></div>
      `}
      <p class="form-error" data-error></p>
    </form>
    <p class="group-note">The lock keeps others from opening the app on your device. It doesn't encrypt your data, and if you forget the passcode you can only get back in by erasing this device's data (sync first).</p>
  `;
  main.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = main.querySelector("[data-error]");
    if (on) {
      if (!(await verify(main.querySelector("[name=current]").value))) { err.textContent = "That passcode isn't right."; return; }
      await store.setLocal("pinHash", null);
      await store.setLocal("pinSalt", null);
      toast("App lock turned off");
    } else {
      const pin = main.querySelector("[name=pin]").value;
      if (!/^\d{4,6}$/.test(pin)) { err.textContent = "Use 4 to 6 digits."; return; }
      if (pin !== main.querySelector("[name=pin2]").value) { err.textContent = "The two passcodes don't match."; return; }
      const salt = newSalt();
      await store.setLocal("pinSalt", { salt, length: pin.length });
      await store.setLocal("pinHash", await hashPin(pin, salt));
      toast("App lock turned on");
    }
    renderLockSettings(main);
  });
}

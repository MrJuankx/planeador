// =============================================================================
//  utils.js — Helpers compartidos
// =============================================================================

window.Utils = (function () {

  // ----- DOM -----
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") node.innerHTML = v;
      else if (v === false || v == null) continue;
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  // ----- Debounce -----
  function debounce(fn, wait = 400) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // ----- Date helpers -----
  // Acepta "2026-05-22", "May 22, 2026" o un Date. Devuelve "YYYY-MM-DD" o "".
  function toISODate(value) {
    if (!value) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d)) return "";
    return d.toISOString().slice(0, 10);
  }
  function formatDateHuman(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
  }

  // ----- IDs -----
  function uid() {
    return "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // ----- Toast -----
  let toastTimer;
  function toast(message, variant = "") {
    const el = document.getElementById("toast");
    if (!el) return;
    el.className = "toast " + variant;
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => { el.hidden = true; }, 250);
    }, 2800);
  }

  // ----- Sync indicator -----
  function setSync(state) {
    // state: "idle" | "syncing" | "error"
    const el = document.getElementById("sync-indicator");
    if (!el) return;
    el.dataset.state = state;
    const txt = el.querySelector(".sync-text");
    if (txt) {
      txt.textContent =
        state === "syncing" ? "Guardando…"
      : state === "error"   ? "Error al guardar"
      :                       "Sincronizado";
    }
  }

  return { $, $$, el, debounce, toISODate, formatDateHuman, uid, toast, setSync };
})();

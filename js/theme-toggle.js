/* theme-toggle.js \u2014 Toggle d\u00EDa/noche con animaci\u00F3n + \u201Cghost icons\u201D
   - Estado visual con .wrap.is-dark (no dependemos de :host)
   - Aplica en <html> clases 'light'/'dark' y data-theme
   - Persiste en localStorage(storage-key) y emite 'themechange'
*/

class ThemeToggle extends HTMLElement {
  static get observedAttributes() {
    return ["day-label", "night-label"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._theme = "light";
    this._storageKey = this.getAttribute("storage-key") || "crm_theme";
    this._targetSelector = this.getAttribute("target") || "html";
    this._dayLabel = this.getAttribute("day-label") || "";
    this._nightLabel = this.getAttribute("night-label") || "";

    const style = document.createElement("style");
    style.textContent = `
      :host { display:inline-block; vertical-align:middle; }

      .wrap{
        width: var(--tt-width, 112px);
        height: var(--tt-height, 44px);
        position: relative;
        border-radius: 999px;
        cursor: pointer;
        user-select: none;
        overflow: hidden;
        background: transparent;
        border: 0; padding: 0;
        box-shadow: var(--tt-shadow, 0 6px 16px rgba(0,0,0,.18));
      }

      /* Track (p\u00EDldora) */
      .track{
        position:absolute; inset:0; border-radius:inherit;
        background: linear-gradient(90deg,
          var(--tt-day-grad-from, #ff6aa0),
          var(--tt-day-grad-to,   #ffa042)
        );
        transition: background var(--tt-dur,420ms) ease;
      }
      .wrap.is-dark .track{
        background: linear-gradient(90deg,
          var(--tt-night-grad-from, #1462d9),
          var(--tt-night-grad-to,   #3a2dbd)
        );
      }

      /* Etiquetas (opcionales). Si est\u00E1n vac\u00EDas, no ocupan lugar */
      .label{
        position:absolute; top:50%; transform:translateY(-50%);
        font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Inter,sans-serif;
        letter-spacing:.3px; color: var(--tt-text, rgba(255,255,255,.92));
        pointer-events:none; opacity:.9;
        transition: opacity var(--tt-dur,420ms), transform var(--tt-dur,420ms);
      }
      .label:empty{ display:none; }
      .label.day{ left: 10px; }
      .label.night{ right: 10px; text-align:right; }

      /* \u201CGhost\u201D del modo contrario (suaves) */
      .ghost{
        position:absolute; top:50%; transform: translateY(-50%) scale(.92);
        width: 20px; height: 20px; opacity: 0; pointer-events:none;
        transition: opacity 420ms ease, transform 420ms ease;
        filter: drop-shadow(0 1px 1px rgba(0,0,0,.25));
      }
      .ghost svg{ width:100%; height:100%; display:block; }
      .ghost-sun { left: 10px;  color: rgba(255, 255, 255, .85); }
      .ghost-moon{ right: 10px; color: rgba(255, 255, 255, .85); }
      .wrap:not(.is-dark) .ghost-moon { opacity:.75; transform: translateY(-50%) scale(1); }
      .wrap.is-dark        .ghost-sun  { opacity:.75; transform: translateY(-50%) scale(1); }

      /* === FIX del hueco derecho ===
         Posicionamos con left + transform, sim\u00E9trico por ambos lados */
      .thumb{
        --tt-pad: max(6px, calc(var(--tt-height,44px) * 0.12)); /* margen interior */
        position:absolute; top:50%;
        left: var(--tt-pad);
        transform: translate(0, -50%);
        width: calc(var(--tt-height,44px) * .78);
        height: calc(var(--tt-height,44px) * .78);
        border-radius: 50%;
        background: #ffffff;
        display:flex; align-items:center; justify-content:center;
        transition:
          left 520ms cubic-bezier(.2,.8,.2,1),
          transform 520ms cubic-bezier(.2,.8,.2,1),
          background 420ms ease;
          - box-shadow: 0 6px 16px rgba(0,0,0,.20);
          + box-shadow: var(--tt-thumb-shadow, 0 6px 16px rgba(0,0,0,.20));
      }
      .thumb::before{
        content:""; position:absolute; inset:0; border-radius:50%;
        border: max(2px, calc(var(--tt-height,44px) * 0.06)) solid rgba(0,0,0,.08);
        transition: border-color 420ms ease;
      }
      .wrap.is-dark .thumb{
        left: calc(100% - var(--tt-pad));
        transform: translate(-100%, -50%);
        background: #ffffff;
      }
      .wrap.is-dark .thumb::before{ border-color: rgba(255,255,255,.22); }

      /* Contenedor del \u00EDcono que rota */
      .icon-wrap{
        position: relative;
        width: 66%; height: 66%;
        transition: transform 600ms cubic-bezier(.2,.8,.2,1);
      }
      .wrap.is-dark .icon-wrap{ transform: rotate(360deg); }

      /* Sun \u2194 Moon dentro del thumb */
      .icon{ position:absolute; inset:0; transition: transform 420ms ease, opacity 360ms ease; }
      .sun  { color: var(--tt-sun,  #ffcc3f); opacity: 1; transform: scale(1) rotate(0); }
      .moon { color: var(--tt-moon, #e9f2ff); opacity: 0; transform: scale(.6) rotate(35deg); }
      .wrap.is-dark .sun  { opacity: 0; transform: scale(.6) rotate(-35deg); }
      .wrap.is-dark .moon { opacity: 1; transform: scale(1)  rotate(0); }

      /* Estrellitas en noche */
      .star{
        position:absolute; width: 10%; aspect-ratio:1; border-radius:50%;
        background:#fff; opacity:0; transform: translateY(2px) scale(.8);
        transition: opacity 420ms ease, transform 600ms cubic-bezier(.2,.8,.2,1);
        filter: drop-shadow(0 1px 1px rgba(0,0,0,.2));
      }
      .s1{ top:12%; left:18%; }
      .s2{ bottom:16%; right:20%; width: 8%; }
      .s3{ top:18%; right:30%; width: 7%; }
      .wrap.is-dark .star{ opacity:1; transform: translateY(0) scale(1); }

      .wrap:focus-visible { outline: 3px solid rgba(0,0,0,.35); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce){
        .thumb, .icon, .icon-wrap, .track, .label, .star, .ghost { transition: none !important; }
      }
    `;

    const btn = document.createElement("button");
    btn.className = "wrap";
    btn.type = "button";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", "false");
    btn.setAttribute(
      "aria-label",
      this.getAttribute("aria-label") || "Cambiar tema"
    );

    const track = document.createElement("div");
    track.className = "track";

    // \u201CGhost\u201D opuestos en el track
    const ghostSun = document.createElement("div");
    ghostSun.className = "ghost ghost-sun";
    ghostSun.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8L6.76 4.84zm10.48 14.32l1.79 1.79l1.79-1.79l-1.79-1.79l-1.79 1.79zM12 4V1h0v3h0zm0 19v-3h0v3h0zM4.84 17.24l-1.79 1.79l1.79 1.79l1.79-1.79l-1.79-1.79zM19.16 6.76l1.79-1.79l-1.79-1.79l-1.79 1.79l1.79 1.79zM23 12h-3v0h3v0zM4 12H1v0h3v0zm8 5a5 5 0 1 1 0-10a5 5 0 0 1 0 10z"/></svg>`;
    const ghostMoon = document.createElement("div");
    ghostMoon.className = "ghost ghost-moon";
    ghostMoon.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.742 13.045a8.5 8.5 0 0 1-10.787-10.787a.75.75 0 0 0-1.01-.917A9.999 9.999 0 1 0 21.66 14.055a.75.75 0 0 0-.918-1.01z"/></svg>`;

    // Labels opcionales
    const labelDay = document.createElement("div");
    labelDay.className = "label day";
    labelDay.textContent = this._dayLabel;
    const labelNight = document.createElement("div");
    labelNight.className = "label night";
    labelNight.textContent = this._nightLabel;

    // Thumb + \u00EDconos internos
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const wrapIcon = document.createElement("div");
    wrapIcon.className = "icon-wrap";

    const sun = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sun.setAttribute("viewBox", "0 0 24 24");
    sun.classList.add("icon", "sun");
    sun.innerHTML = `<path fill="currentColor" d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8L6.76 4.84zm10.48 14.32l1.79 1.79l1.79-1.79l-1.79-1.79l-1.79 1.79zM12 4V1h0v3h0zm0 19v-3h0v3h0zM4.84 17.24l-1.79 1.79l1.79 1.79l1.79-1.79l-1.79-1.79zM19.16 6.76l1.79-1.79l-1.79-1.79l-1.79 1.79l1.79 1.79zM23 12h-3v0h3v0zM4 12H1v0h3v0zm8 5a5 5 0 1 1 0-10a5 5 0 0 1 0 10z"/>`;

    const moon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    moon.setAttribute("viewBox", "0 0 24 24");
    moon.classList.add("icon", "moon");
    moon.innerHTML = `<path fill="currentColor" d="M20.742 13.045a8.5 8.5 0 0 1-10.787-10.787a.75.75 0 0 0-1.01-.917A9.999 9.999 0 1 0 21.66 14.055a.75.75 0 0 0-.918-1.01z"/>`;

    const s1 = document.createElement("div");
    s1.className = "star s1";
    const s2 = document.createElement("div");
    s2.className = "star s2";
    const s3 = document.createElement("div");
    s3.className = "star s3";

    wrapIcon.append(sun, moon, s1, s2, s3);
    thumb.append(wrapIcon);

    btn.append(track, ghostSun, ghostMoon, labelDay, labelNight, thumb);
    this.shadowRoot.append(style, btn);

    btn.addEventListener("click", () => this.toggle());
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.toggle();
      }
    });

    this._btnWrap = btn;
  }

  connectedCallback() {
    const saved = localStorage.getItem(this._storageKey);
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    this._theme = saved || (prefersDark ? "dark" : "light");
    this.applyTheme(this._theme, false);
  }

  attributeChangedCallback(name, _, v) {
    if (!this.shadowRoot) return;
    const el = this.shadowRoot.querySelector(
      name === "day-label" ? ".label.day" : ".label.night"
    );
    if (el) el.textContent = v || "";
  }

  toggle() {
    this.applyTheme(this._theme === "dark" ? "light" : "dark", true);
  }

  applyTheme(theme, persist = true) {
    this._theme = theme;

    // Estado visual del propio bot\u00F3n
    this._btnWrap?.classList.toggle("is-dark", theme === "dark");
    this._btnWrap?.setAttribute("aria-checked", String(theme === "dark"));

    // Aplicar en el documento (tu app usa .light/.dark en :root)
    const target =
      document.querySelector(this._targetSelector) || document.documentElement;
    target.setAttribute("data-theme", theme);
    target.classList.toggle("dark", theme === "dark");
    target.classList.toggle("light", theme === "light");

    if (persist) localStorage.setItem(this._storageKey, theme);

    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }
}
customElements.define("theme-toggle", ThemeToggle);

// ===== Aplicar tema al cargar muy temprano =====
(() => {
  try {
    const saved =
      localStorage.getItem("crm_theme") || sessionStorage.getItem("theme");
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", theme === "dark");
    sessionStorage.setItem("theme", theme); // compat con lo que ya usabas
  } catch {}
})();

// Common utilities shared by both pages (no Chart.js here)
(function () {
  const SHEET_ID = "1K9j2y7qYK0LlmQMrFkVKItmGHoZDr3xXrkI3-S__jpk";
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
  const UPDATE_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbzJmi9WsZVzvje77gUW6aGGYZzR6NKfBpTRi9vOzwmlgb2NCNyxzutIaA_M9eKHfa5M/exec";

  const OPTIONS_REGISTRO = ["Nuevo", "Gestionado"];
  const OPTIONS_ESTADO = [
    "Errado",
    "Duplicado",
    "No contesta",
    "Gestionado",
    "Cerrado",
    "Venta",
  ];
  const OPTIONS_REGISTRADO = ["SI", "NO"];
  const OPTIONS_ASESOR = ["Alvaro", "Male"];
  const N_INICIAL = 15,
    N_PASO = 10;

  const norm = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLowerCase();
  const prettyDate = (d) =>
    new Intl.DateTimeFormat("es-PE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  const prettyDay = (d) =>
    new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(d);
  const prettyDayShort = (d) =>
    new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short" }).format(
      d
    );
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const isFileOrigin = () => location.protocol === "file:";

  function parseSheetDate(str) {
    if (!str) return NaN;
    const s = String(str)
      .trim()
      .replace(/\u00A0/g, " ");
    const t0 = Date.parse(s);
    if (!Number.isNaN(t0)) return t0;
    let m = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i
    );
    if (m) {
      let [, mm, dd, yy, hh, mi, ap] = m;
      mm = +mm;
      dd = +dd;
      yy = +yy;
      hh = +hh;
      mi = +mi;
      if (yy < 100) yy = yy < 70 ? 2000 + yy : 1900 + yy;
      if (ap.toUpperCase() === "PM" && hh !== 12) hh += 12;
      if (ap.toUpperCase() === "AM" && hh === 12) hh = 0;
      return new Date(yy, mm - 1, dd, hh, mi, 0).getTime();
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let [, a, b, yyRaw] = m;
      let dd, mm;
      const A = +a,
        B = +b;
      if (A > 12 && B <= 12) {
        dd = A;
        mm = B;
      } else {
        mm = A;
        dd = B;
      }
      let yy = +yyRaw;
      if (yy < 100) yy = yy < 70 ? 2000 + yy : 1900 + yy;
      return new Date(yy, mm - 1, dd, 0, 0, 0).getTime();
    }
    return NaN;
  }
  const dateOnlyTs = (ts) => {
    if (Number.isNaN(ts)) return NaN;
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };

  function canalKey(v) {
    const s = norm(v);
    if (s.startsWith("fb")) return "fb";
    if (s.startsWith("ig") || s.includes("insta")) return "ig";
    if (s.startsWith("wpp") || s.includes("whats")) return "wpp";
    if (s.startsWith("mss") || s.includes("mess")) return "mss";
    if (s.includes("manual")) return "manual";
    if (s.includes("web")) return "web";
    if (s.startsWith("ext")) return "ext";
    return "def";
  }
  function canalColor(label) {
    const cs = getComputedStyle(document.documentElement);
    const map = {
      fb: cs.getPropertyValue("--fb").trim(),
      ig: cs.getPropertyValue("--ig").trim(),
      wpp: cs.getPropertyValue("--wpp").trim(),
      mss: cs.getPropertyValue("--mss").trim(),
      web: cs.getPropertyValue("--ext").trim(),
      manual: cs.getPropertyValue("--def").trim(),
      ext: cs.getPropertyValue("--ext").trim(),
      def: cs.getPropertyValue("--def").trim(),
    };
    if ((label || "").toString().trim() === "(Sin dato)") return map.def;
    return map[canalKey(label)];
  }
  function canalClass(l) {
    return "canal-" + canalKey(l);
  }

  function interesScore(label) {
    if (!label) return 0.5;
    const s = norm(label);
    if (s.includes("al_contado")) return 1.0;
    if (s.includes("financi")) return 0.75;
    if (s.includes("separ")) return 0.55;
    const m = s.match(/^s\/\s*([\d.,]+)/i);
    if (m) {
      const n = parseFloat(m[1].replace(/\./g, "").replace(",", ".")) || 0;
      const lo = 2000,
        hi = 10000;
      return Math.max(0, Math.min(1, (n - lo) / (hi - lo)));
    }
    return 0.6;
  }
  function interesColorFor(l) {
    const cs = getComputedStyle(document.documentElement);
    if ((l || "").toString().trim() === "(Sin dato)")
      return cs.getPropertyValue("--def").trim();
    const t = interesScore(l);
    const hue = 140 - 140 * t;
    return `hsl(${Math.round(hue)} 75% 50%)`;
  }
  function colorEstado(label) {
    const l = norm(label);
    if (l === "errado") return "#1f2937";
    if (l === "duplicado") return "#7dd3fc";
    if (l === "no contesta") return "#c4b5fd";
    if (l === "gestionado") return "#86efac";
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--def")
      .trim();
  }
  function colorRegistrado(label) {
    const l = norm(label);
    if (l === "si") return "#5eead4";
    if (l === "no") return "#fb923c";
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--def")
      .trim();
  }

  function parseColorToRGB(c) {
    c = (c || "").trim();
    if (c.startsWith("#")) {
      const h = c.length === 4 ? c.replace(/./g, (m) => m + m) : c;
      const num = parseInt(h.slice(1), 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    const tmp = document.createElement("canvas").getContext("2d");
    tmp.fillStyle = c;
    const rgb = tmp.fillStyle.match(/rgba?\(([^)]+)\)/i);
    if (rgb) {
      const [r, g, b] = rgb[1].split(",").map((x) => parseFloat(x));
      return { r, g, b };
    }
    return { r: 120, g: 120, b: 120 };
  }
  function luminance({ r, g, b }) {
    const s = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }
  const contrastText = (color) =>
    luminance(parseColorToRGB(color)) < 0.5 ? "#fff" : "#000";

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, a), ms);
    };
  }

  // CSV fetch via Papa
  const fetchCSV = (url) =>
    new Promise((res, rej) =>
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (r) => res(r.data),
        error: rej,
      })
    );

  // API helpers
  const buildUrl = (params) => {
    const u = new URL(UPDATE_ENDPOINT);
    Object.entries(params).forEach(([k, v]) =>
      u.searchParams.set(k, String(v))
    );
    return u.toString();
  };
  const apiSetCell = async (row, column, value) => {
    const res = await fetch(buildUrl({ op: "set", row, column, value }), {
      method: "GET",
      mode: "cors",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!(data && data.ok))
      throw new Error(data?.error || "Respuesta inv\u00E1lida");
    return true;
  };
  const apiGetCell = async (row, column) => {
    const res = await fetch(buildUrl({ op: "cell", row, column }), {
      method: "GET",
      mode: "cors",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!(data && data.ok))
      throw new Error(data?.error || "Respuesta inv\u00E1lida");
    return data.value ?? "";
  };

  // Theme + menu
  function initThemeAndMenu() {
    const root = document.documentElement;
    const pref = localStorage.getItem("crm_theme");
    if (pref === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else if (pref === "dark") {
      root.classList.remove("light");
      root.classList.add("dark");
    }

    const themeBtn = document.getElementById("themeToggle");
    const themeBtnMobile = document.getElementById("themeToggleMobile");
    if (themeBtn || themeBtnMobile) {
      const updateLabel = (theme) => {
        const label =
          theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro";
        themeBtn?.setAttribute("aria-label", label);
        themeBtnMobile?.setAttribute("aria-label", label);
      };
      const initialTheme = root.classList.contains("light") ? "light" : "dark";
      updateLabel(initialTheme);
      window.addEventListener("themechange", (e) => {
        const theme = e.detail?.theme || (root.classList.contains("light") ? "light" : "dark");
        updateLabel(theme);
        document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme } }));
      });
    }

    const topNav = document.getElementById("crmTopNav");
    const topNavMenu = document.getElementById("topNavMenu");
    const topNavToggle = document.getElementById("topNavToggle");
    if (topNav && topNavMenu && topNavToggle) {
      const mqDesktop = window.matchMedia("(min-width: 769px)");
      let mobileExpanded = false;

      const applyMobileMenu = (expanded) => {
        mobileExpanded = expanded;
        topNavMenu.setAttribute("data-open", expanded ? "true" : "false");
        topNavToggle.setAttribute("data-open", expanded ? "true" : "false");
        topNavToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        document.body?.classList.toggle("top-nav-open", expanded);
      };

      const syncTopNav = () => {
        if (mqDesktop.matches) {
          applyMobileMenu(false);
          topNavToggle.setAttribute("aria-hidden", "true");
          topNavToggle.setAttribute("tabindex", "-1");
        } else {
          topNavToggle.removeAttribute("aria-hidden");
          topNavToggle.removeAttribute("tabindex");
        }
      };

      topNavToggle.addEventListener("click", () => {
        if (mqDesktop.matches) return;
        applyMobileMenu(!mobileExpanded);
      });

      topNavMenu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          if (!mqDesktop.matches) {
            applyMobileMenu(false);
          }
        });
      });

      if (mqDesktop.addEventListener) {
        mqDesktop.addEventListener("change", syncTopNav);
      } else if (mqDesktop.addListener) {
        mqDesktop.addListener(syncTopNav);
      }
      syncTopNav();

      const page = document.body?.dataset.page;
      if (page) {
        topNavMenu.querySelectorAll(".top-nav__link").forEach((link) => {
          const isActive = link.dataset.page === page;
          link.classList.toggle("active", isActive);
          if (isActive) {
            link.setAttribute("aria-current", "page");
          } else {
            link.removeAttribute("aria-current");
          }
        });
      }
    }

    const sidebar = document.getElementById("crmSidebar");
    const collapseBtn = document.getElementById("sidebarCollapse");
    const collapsedKey = "crm_sidebar_collapsed";
    if (sidebar) {
      const applyCollapsed = (collapsed) => {
        sidebar.setAttribute("data-collapsed", collapsed ? "true" : "false");
        if (document.body && document.body.classList) {
          document.body.classList.toggle("sidebar-collapsed", collapsed);
        }
        if (collapseBtn) {
          collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
          collapseBtn.setAttribute(
            "aria-label",
            collapsed ? "Expandir men\u00FA" : "Contraer men\u00FA"
          );
        }
      };
      const storedRaw = localStorage.getItem(collapsedKey);
      let collapsed = storedRaw === "1";
      if (storedRaw === null && window.innerWidth <= 960) {
        collapsed = true;
      }
      applyCollapsed(collapsed);
      collapseBtn?.addEventListener("click", () => {
        const current = sidebar.getAttribute("data-collapsed") === "true";
        const next = !current;
        applyCollapsed(next);
        localStorage.setItem(collapsedKey, next ? "1" : "0");
        if (sidebar.animate) {
          const keyframes = next
            ? [
                { transform: "translateX(0)", opacity: 1 },
                { transform: "translateX(-12px)", opacity: 0.78 }
              ]
            : [
                { transform: "translateX(-12px)", opacity: 0.78 },
                { transform: "translateX(0)", opacity: 1 }
              ];
          sidebar.animate(keyframes, {
            duration: 260,
            easing: "cubic-bezier(0.33, 1, 0.68, 1)",
            fill: "forwards"
          });
        }
      });

      const page = document.body?.dataset.page;
      if (page) {
        sidebar.querySelectorAll(".sidebar-link").forEach((link) => {
          const isActive = link.dataset.page === page;
          link.classList.toggle("active", isActive);
          if (isActive) {
            link.setAttribute("aria-current", "page");
          } else {
            link.removeAttribute("aria-current");
          }
          if (!link.getAttribute("title")) {
            const label = link.querySelector(".label")?.textContent?.trim();
            if (label) link.setAttribute("title", label);
          }
        });
      }
    }
  }

  window.Common = {
    SHEET_ID,
    CSV_URL,
    UPDATE_ENDPOINT,
    OPTIONS_REGISTRO,
    OPTIONS_ESTADO,
    OPTIONS_REGISTRADO,
    OPTIONS_ASESOR,
    N_INICIAL,
    N_PASO,
    norm,
    prettyDate,
    prettyDay,
    prettyDayShort,
    isoDay,
    isFileOrigin,
    parseSheetDate,
    dateOnlyTs,
    canalKey,
    canalColor,
    canalClass,
    interesScore,
    interesColorFor,
    colorEstado,
    colorRegistrado,
    contrastText,
    debounce,
    fetchCSV,
    apiSetCell,
    apiGetCell,
    initThemeAndMenu,
  };
})();

// ===== Integraci\u00F3n con <theme-toggle> =====
window.addEventListener("themechange", (e) => {
  const theme = e.detail.theme; // 'dark' | 'light'
  try {
    sessionStorage.setItem("theme", theme);
  } catch {}
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light"); // <-- clave para tu CSS
});

// === Hamburguesa animada: abrir/cerrar panel + sincronizar \u00EDcono ===
// Sidebar colapsable gestionado en initThemeAndMenu (mantener compatibilidad con eventos globales)








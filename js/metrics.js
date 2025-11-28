// P\u00E1gina de M\u00E9tricas: donuts + historial (usa Chart.js solo aqu\u00ED)
(function () {
  const C = window.Common;

  let allRows = [];
  let histRange = null;
  let histShowLabels = false;
  let histMode = "count";
  let autoRefreshTimer = null;
  let autoRefreshRunning = false;
  const metricModes = {
    canal: "percent",
    campana: "percent",
    interes: "percent",
    estado: "percent",
    registrado: "percent",
    registro: "percent",
    social: "percent",
  };
  let charts = {
    canal: null,
    campana: null,
    interes: null,
    estado: null,
    registrado: null,
    registro: null,
    social: null,
    hist: null,
    trendTotal: null,
    trendSales: null,
    trendChannel: null,
  };
  const applyThemeToCharts = () =>
    Object.values(charts).forEach((chart) => {
      if (chart && typeof chart.__applyTheme === "function") {
        chart.__applyTheme();
      }
    });

  const last7DaysRange = () => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 6);
    return { from: C.isoDay(from), to: C.isoDay(to) };
  };
  const setLastUpdate = () =>
    (document.getElementById(
      "lastUpdate"
    ).textContent = `Actualizado: ${C.prettyDate(new Date())}`);

  const rowsForGroupFilters = () => {
    try {
      if (!window.__metricsGroupRange) return allRows;
      const gr = window.__metricsGroupRange;
      if (!gr.from || !gr.to) return allRows;
      const tsFrom = new Date(`${gr.from}T00:00:00`).getTime();
      const tsTo = new Date(`${gr.to}T23:59:59`).getTime();
      return allRows.filter((r) => {
        const t = r._dateOnly;
        if (Number.isNaN(t)) return false;
        return t >= tsFrom && t <= tsTo;
      });
    } catch (e) {
      console.warn("rowsForGroupFilters fallback", e);
      return allRows;
    }
  };

  // ======== Plugins de etiquetas ========
  const DonutValueLabels = {
    id: "donutValueLabels",
    afterDatasetsDraw(chart) {
      if (chart.config.type !== "doughnut") return;
      const mode = chart.options.plugins.valueLabels?.mode || "percent";
      const ds = chart.data.datasets[0];
      if (!ds) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "11px Inter, system-ui";
      const bg = ds.backgroundColor || [];
      chart.getDatasetMeta(0).data.forEach((arc, i) => {
        const val = +ds.data[i] || 0;
        if (val <= 0) return;
        const pos = arc.tooltipPosition();
        const color = bg[i % bg.length] || "#888";
        ctx.fillStyle = C.contrastText(color);
        const text =
          mode === "percent" ? `${Math.round(val * 10) / 10}%` : `${val}`;
        ctx.fillText(text, pos.x, pos.y);
      });
      ctx.restore();
    },
  };
  const DonutCenterTotal = {
    id: "donutCenterTotal",
    afterDraw(chart) {
      if (chart.config.type !== "doughnut") return;
      const dataset = chart.data.datasets?.[0];
      if (!dataset) return;
      const total = dataset.__centerValue;
      if (!(Number.isFinite(total) && total > -Infinity)) return;
      const meta = chart.getDatasetMeta(0);
      const elements = meta?.data;
      if (!elements || !elements.length) return;
      const arc = elements[0];
      const { x: centerX, y: centerY } = arc;
      const ctx = chart.ctx;
      const root = getComputedStyle(document.documentElement);
      const textColor =
        dataset.__centerColor ||
        root.getPropertyValue("--text").trim() ||
        "#111827";
      const subColor =
        dataset.__centerSubColor ||
        root.getPropertyValue("--muted").trim() ||
        "#6b7280";
      const valueFont =
        dataset.__centerValueFont || "600 22px Inter, system-ui, sans-serif";
      const labelFont =
        dataset.__centerLabelFont || "500 11px Inter, system-ui, sans-serif";
      const formattedTotal =
        dataset.__centerFormatter?.call?.(dataset, total) ??
        new Intl.NumberFormat("es-PE").format(total);
      const labelText = dataset.__centerLabel || "Total";
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      ctx.font = valueFont;
      ctx.fillText(formattedTotal, centerX, centerY - 6);
      ctx.font = labelFont;
      ctx.fillStyle = subColor;
      ctx.fillText(labelText, centerX, centerY + 14);
      ctx.restore();
    },
  };
  const BarPillLabels = {
    id: "barPillLabels",
    afterDatasetsDraw(chart) {
      if (chart.config.type !== "bar") return;
      const pillOpts = chart.options?.plugins?.pillLabels;
      if (pillOpts && pillOpts.enabled === false) return;
      const {
        ctx,
        data: { datasets, labels },
      } = chart;
      const mode = pillOpts?.mode || "percent";
      const totals = new Array(labels.length).fill(0);
      datasets.forEach((ds) =>
        ds.data.forEach((v, i) => (totals[i] += +v || 0))
      );
      ctx.save();
      ctx.font = "11px Inter, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pillBg = "rgba(0,0,0,.35)";
      datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((bar, i) => {
          const raw = +ds.data[i] || 0;
          if (!raw || !totals[i]) return;
          const text =
            mode === "percent"
              ? Math.round((raw / totals[i]) * 100) + "%"
              : String(raw);
          const x = bar.x,
            y = (bar.y + bar.base) / 2,
            padX = 6,
            h = 16,
            w = ctx.measureText(text).width + padX * 2,
            r = 8,
            rx = x - w / 2,
            ry = y - h / 2;
          ctx.fillStyle = pillBg;
          ctx.beginPath();
          ctx.moveTo(rx + r, ry);
          ctx.arcTo(rx + w, ry, rx + w, ry + h, r);
          ctx.arcTo(rx + w, ry + h, rx, ry + h, r);
          ctx.arcTo(rx, ry + h, rx, ry, r);
          ctx.arcTo(rx, ry, rx + w, ry, r);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillText(text, x, y + 0.5);
        });
      });
      ctx.restore();
    },
  };
  const TopStackLabel = {
    id: "topStackLabel",
    afterDatasetsDraw(chart) {
      if (chart.config.type !== "bar") return;
      const topOpts = chart.options?.plugins?.topStackLabel;
      if (topOpts && topOpts.enabled === false) return;
      const {
        ctx,
        data: { labels, datasets },
        scales: { y },
      } = chart;
      if (!labels.length) return;
      const mode = topOpts?.mode || "count";
      const totalsPerDay = new Array(labels.length).fill(0);
      datasets.forEach((ds) =>
        ds.data.forEach((v, i) => (totalsPerDay[i] += +v || 0))
      );
      const grand = totalsPerDay.reduce((a, b) => a + b, 0) || 1;
      ctx.save();
      ctx.font = "12px Inter, system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--muted")
        .trim();
      labels.forEach((_, i) => {
        const total = totalsPerDay[i];
        const text =
          mode === "percent"
            ? Math.round((total / grand) * 100) + "%"
            : String(total);
        let sample = null;
        for (let d = datasets.length - 1; d >= 0; d--) {
          const meta = chart.getDatasetMeta(d);
          if (meta.data[i]) {
            sample = meta.data[i];
            break;
          }
        }
        if (!sample) return;
        const x = sample.x;
        const topY = y.getPixelForValue(total) - 12;
        ctx.fillText(text, x, topY);
      });
      ctx.restore();
    },
  };
  const SocialInlineLabels = {
    id: "socialInlineLabels",
    afterDatasetsDraw(chart) {
      const opts = chart.options?.plugins?.socialInlineLabels;
      if (!opts || !Array.isArray(opts.items) || !opts.items.length) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      const baseRadius = opts.iconRadius ?? 14;
      const compactThreshold = opts.compactThreshold ?? 680;
      const microThreshold = Math.min(
        compactThreshold,
        opts.microThreshold ?? 560
      );
      const tinyThreshold = Math.min(microThreshold, opts.tinyThreshold ?? 460);
      const isCompact = chart.width <= compactThreshold;
      const isMicro = chart.width <= microThreshold;
      const isTiny = chart.width <= tinyThreshold;

      const compactRadius =
        opts.iconRadiusCompact ?? Math.max(10, baseRadius - 2);
      const microRadius =
        opts.iconRadiusMicro ??
        Math.max(9, Math.min(compactRadius - 1, compactRadius));
      const tinyRadius =
        opts.iconRadiusTiny ??
        Math.max(8, Math.min(microRadius - 1, microRadius));
      const hideTinyLabels = opts.hideTinyLabels ?? false;
      const iconRadius = isTiny
        ? tinyRadius
        : isMicro
        ? microRadius
        : isCompact
        ? compactRadius
        : baseRadius;

      const baseIconOffset = opts.iconOffset ?? 135;
      const compactIconOffset = opts.iconOffsetCompact ?? 78;
      const microIconOffset =
        opts.iconOffsetMicro ?? Math.max(58, compactIconOffset - 10);
      const tinyIconOffset =
        opts.iconOffsetTiny ?? Math.max(50, microIconOffset - 8);
      const iconOffset = isTiny
        ? tinyIconOffset
        : isMicro
        ? microIconOffset
        : isCompact
        ? compactIconOffset
        : baseIconOffset;

      const labelOffset = opts.labelOffset ?? 40;

      const baseValueOffset = opts.valueOffset ?? 12;
      const compactValueOffset = opts.valueOffsetCompact ?? baseValueOffset;
      const microValueOffset =
        opts.valueOffsetMicro ?? Math.max(6, compactValueOffset - 2);
      const tinyValueOffset =
        opts.valueOffsetTiny ?? Math.max(4, microValueOffset - 2);
      const valueOffset = isTiny
        ? tinyValueOffset
        : isMicro
        ? microValueOffset
        : isCompact
        ? compactValueOffset
        : baseValueOffset;

      const compactLabelGap = opts.compactLabelGap ?? compactRadius + 10;
      const microLabelGap = opts.microLabelGap ?? microRadius + 8;
      const tinyLabelGap = opts.tinyLabelGap ?? tinyRadius + 6;
      const activeLabelGap = isTiny
        ? tinyLabelGap
        : isMicro
        ? microLabelGap
        : compactLabelGap;

      const labelFont =
        opts.labelFont || "600 13px Inter, system-ui, -apple-system";
      const compactLabelFont =
        opts.compactLabelFont || "600 11px Inter, system-ui, -apple-system";
      const microLabelFont =
        opts.microLabelFont || "600 10px Inter, system-ui, -apple-system";
      const tinyLabelFont =
        opts.tinyLabelFont || "600 9px Inter, system-ui, -apple-system";
      const showLabels = opts.showLabels !== false;

      const baseValueFont = opts.valueFont || "600 13px Inter, system-ui";
      const compactValueFont = opts.compactValueFont || baseValueFont;
      const microValueFont = opts.microValueFont || compactValueFont;
      const tinyValueFont = opts.tinyValueFont || microValueFont;
      const valueFont = isTiny
        ? tinyValueFont
        : isMicro
        ? microValueFont
        : isCompact
        ? compactValueFont
        : baseValueFont;
      const showValues = opts.showValues !== false;

      ctx.save();
      meta.data.forEach((bar, index) => {
        const item = opts.items[index];
        if (!bar || !item) return;
        const y = bar.y;
        const iconX = area.left - iconOffset;
        const valueX = bar.x + valueOffset;

        drawSocialIcon(
          ctx,
          item.key,
          iconX,
          y,
          iconRadius,
          item.iconBg,
          item.iconColor,
          item.iconBaselineOffset
        );

        const hideLabel = hideTinyLabels && isTiny;
        const canDrawLabel = showLabels && !hideLabel;
        ctx.fillStyle = opts.labelColor || "#1f2933";
        if (isCompact) {
          if (canDrawLabel) {
            ctx.font = isTiny
              ? tinyLabelFont
              : isMicro
              ? microLabelFont
              : compactLabelFont;
            ctx.textAlign = "center";
            ctx.fillText(item.label, iconX, y + activeLabelGap);
          }
        } else if (canDrawLabel) {
          ctx.font = labelFont;
          ctx.textAlign = "left";
          const labelX = area.left - labelOffset;
          ctx.fillText(item.label, labelX, y);
        }

        if (showValues) {
          ctx.font = valueFont;
          ctx.fillStyle = opts.valueColor || ctx.fillStyle;
          ctx.textAlign = "left";
          ctx.fillText(item.value, valueX, y);
        }
      });
      ctx.restore();
    },
  };
  const SparklineActivePoint = {
    id: "sparklineActivePoint",
    afterDatasetsDraw(chart) {
      if (!chart.options?.sparkline) return;
      const tooltip = chart.tooltip;
      if (!tooltip || !tooltip.opacity || !tooltip.dataPoints?.length) return;
      const point = tooltip.dataPoints[0]?.element;
      if (!point) return;
      const ctx = chart.ctx;
      ctx.save();
      const color = chart.data.datasets[0]?.borderColor || "#2563eb";
      ctx.fillStyle = color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };
  Chart.register(
    DonutValueLabels,
    DonutCenterTotal,
    BarPillLabels,
    TopStackLabel,
    SocialInlineLabels,
    SparklineActivePoint
  );

  // ======== Datos & mapping ========
  const mapColumns = (data) => {
    if (!data.length) return { data: [], columns: {} };
    const headerReal = Object.keys(data[0]),
      headerNorm = headerReal.map((h) => C.norm(h));
    const want = [
      "Hora de registro",
      "HORA DE REGISTRO",
      "Nombres",
      "Celular",
      "DNI",
      "Canal",
      "Campa\u00F1a",
      "Interes",
      "Inter\u00E9s",
      "Registro",
      "REGISTRO",
      "Estado",
      "ESTADO",
      "Registrado",
      "REGISTRADO",
    ];
    const map = {};
    want.forEach((w) => {
      const i = headerNorm.indexOf(C.norm(w));
      if (i >= 0) map[w] = headerReal[i];
    });
    return { data, columns: map };
  };

  // ======== Donuts ========
  function groupStats(rows, key) {
    const map = new Map();
    rows.forEach((r) => {
      const k = (r[key] ?? "").toString().trim() || "(Sin dato)";
      map.set(k, (map.get(k) || 0) + 1);
    });
    const labels = [...map.keys()];
    const counts = labels.map((l) => map.get(l) || 0);
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const percents = counts.map((c) => Math.round((c / total) * 1000) / 10);
    const arr = labels
      .map((l, i) => ({ l, c: counts[i], p: percents[i] }))
      .sort((a, b) => {
        if (a.l === "(Sin dato)" && b.l !== "(Sin dato)") return 1;
        if (b.l === "(Sin dato)" && a.l !== "(Sin dato)") return -1;
        return b.c - a.c;
      });
    return {
      labels: arr.map((x) => x.l),
      counts: arr.map((x) => x.c),
      percents: arr.map((x) => x.p),
      total,
    };
  }

  function makeDonutMetric({
    canvasId,
    legendId,
    handle,
    stats,
    colors,
    mode,
  }) {
    if (charts[handle]) {
      charts[handle].destroy();
      charts[handle] = null;
    }
    const ctx = document.getElementById(canvasId).getContext("2d");
    const getBorderColor = () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--panel")
        .trim() || "#111827";
    const dataValues = mode === "percent" ? stats.percents : stats.counts;
    const tooltipLabel = (it) =>
      mode === "percent"
        ? `${it.label}: ${it.parsed}%`
        : `${it.label}: ${it.parsed}`;
    const lg = document.getElementById(legendId);
    const card =
      lg?.closest(".chart-card.metric") || lg?.closest(".chart-card") || null;
    const cardTitle = card?.querySelector("h4")?.textContent?.trim() || "";
    const centerLabel =
      cardTitle && cardTitle.length <= 16 ? cardTitle : "Total";
    const chartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: stats.labels,
        datasets: [
          {
            data: dataValues,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: getBorderColor(),
            hoverBorderWidth: 2.5,
            __centerValue: stats.total,
            __centerLabel: centerLabel,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: tooltipLabel } },
          valueLabels: { mode },
        },
        animation: {
          duration: 320,
          easing: "easeOutQuart",
        },
      },
    });
    chartInstance.__applyTheme = () => {
      const col = getBorderColor();
      chartInstance.data.datasets[0].borderColor = col;
      chartInstance.update("none");
    };
    charts[handle] = chartInstance;
    chartInstance.__applyTheme();

    if (!lg) return;
    lg.innerHTML = "";
    stats.labels.forEach((lab, i) => {
      const it = document.createElement("div");
      it.className = "item";
      const sw = document.createElement("span");
      sw.className = "sw";
      sw.style.background = colors[i];
      const lbl = document.createElement("span");
      lbl.textContent = lab;
      const val = document.createElement("span");
      val.className = "val";
      if (mode === "percent") {
        const percValue = stats.percents[i];
        val.textContent = Number.isFinite(percValue)
          ? `${
              percValue % 1 === 0
                ? percValue.toFixed(0)
                : percValue.toFixed(1)
            }%`
          : "0%";
      } else {
        val.textContent = new Intl.NumberFormat("es-PE").format(
          stats.counts[i] || 0
        );
      }
      it.appendChild(sw);
      it.appendChild(lbl);
      it.appendChild(val);
      lg.appendChild(it);
    });

    if (card) {
      card.querySelectorAll(".metric-total").forEach((el) => el.remove());
    }
  }

  function setMetricMode(prefix, mode) {
    if (prefix === "canal") metricModes.canal = mode;
    else if (prefix === "camp") metricModes.campana = mode;
    else if (prefix === "int") metricModes.interes = mode;
    else if (prefix === "est") metricModes.estado = mode;
    else if (prefix === "reg") metricModes.registrado = mode;
    else if (prefix === "registro") metricModes.registro = mode;
    segActive();
  }
  function segActive() {
    const seg = (p, m) => {
      const c = document.getElementById(p + "Count"),
        q = document.getElementById(p + "Percent");
      if (c && q) {
        c.classList.toggle("active", m === "count");
        q.classList.toggle("active", m === "percent");
      }
    };
    seg("canal", metricModes.canal);
    seg("camp", metricModes.campana);
    seg("int", metricModes.interes);
    seg("est", metricModes.estado);
    seg("reg", metricModes.registrado);
    seg("registro", metricModes.registro);
  }

  function iconGlyphFor(key, label) {
    switch (key) {
      case "fb":
        return "f";
      case "ig":
        return "I";
      case "wpp":
        return "W";
      case "mss":
        return "M";
      case "web":
        return "W";
      case "ext":
        return "E";
      case "manual":
        return "R";
      default:
        return (label?.trim()?.[0] || "?").toUpperCase();
    }
  }
  function iconBaselineOffsetFor(key) {
    if (key === "fb") return 1.5;
    if (key === "ig") return 0.5;
    if (key === "wpp") return 0.5;
    if (key === "mss") return 0.5;
    if (key === "web") return 0.5;
    if (key === "ext") return 0.5;
    if (key === "manual") return 0.5;
    return 0.5;
  }
  const OFFICIAL_SOCIAL_ICON_SOURCES = {
    fb: "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+DQo8IS0tIENyZWF0b3I6IENvcmVsRFJBVyBYNiAtLT4NCjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiB3aWR0aD0iMTQuMjIyMmluIiBoZWlnaHQ9IjE0LjIyMjJpbiIgdmVyc2lvbj0iMS4xIiBzdHlsZT0ic2hhcGUtcmVuZGVyaW5nOmdlb21ldHJpY1ByZWNpc2lvbjsgdGV4dC1yZW5kZXJpbmc6Z2VvbWV0cmljUHJlY2lzaW9uOyBpbWFnZS1yZW5kZXJpbmc6b3B0aW1pemVRdWFsaXR5OyBmaWxsLXJ1bGU6ZXZlbm9kZDsgY2xpcC1ydWxlOmV2ZW5vZGQiDQp2aWV3Qm94PSIwIDAgMTQyMjIgMTQyMjIiDQogeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPg0KIDxkZWZzPg0KICA8c3R5bGUgdHlwZT0idGV4dC9jc3MiPg0KICAgPCFbQ0RBVEFbDQogICAgLmZpbDAge2ZpbGw6IzE5NzdGMztmaWxsLXJ1bGU6bm9uemVyb30NCiAgICAuZmlsMSB7ZmlsbDojRkVGRUZFO2ZpbGwtcnVsZTpub256ZXJvfQ0KICAgXV0+DQogIDwvc3R5bGU+DQogPC9kZWZzPg0KIDxnIGlkPSJMYXllcl94MDAyMF8xIj4NCiAgPG1ldGFkYXRhIGlkPSJDb3JlbENvcnBJRF8wQ29yZWwtTGF5ZXIiLz4NCiAgPHBhdGggY2xhc3M9ImZpbDAiIGQ9Ik0xNDIyMiA3MTExYzAsLTM5MjcgLTMxODQsLTcxMTEgLTcxMTEsLTcxMTEgLTM5MjcsMCAtNzExMSwzMTg0IC03MTExLDcxMTEgMCwzNTQ5IDI2MDAsNjQ5MSA2MDAwLDcwMjVsMCAtNDk2OSAtMTgwNiAwIDAgLTIwNTYgMTgwNiAwIDAgLTE1NjdjMCwtMTc4MiAxMDYyLC0yNzY3IDI2ODYsLTI3NjcgNzc4LDAgMTU5MiwxMzkgMTU5MiwxMzlsMCAxNzUwIC04OTcgMGMtODgzLDAgLTExNTksNTQ4IC0xMTU5LDExMTFsMCAxMzM0IDE5NzIgMCAtMzE1IDIwNTYgLTE2NTcgMCAwIDQ5NjljMzQwMCwtNTMzIDYwMDAsLTM0NzUgNjAwMCwtNzAyNXoiLz4NCiAgPHBhdGggY2xhc3M9ImZpbDEiIGQ9Ik05ODc5IDkxNjdsMzE1IC0yMDU2IC0xOTcyIDAgMCAtMTMzNGMwLC01NjIgMjc1LC0xMTExIDExNTksLTExMTFsODk3IDAgMCAtMTc1MGMwLDAgLTgxNCwtMTM5IC0xNTkyLC0xMzkgLTE2MjQsMCAtMjY4Niw5ODQgLTI2ODYsMjc2N2wwIDE1NjcgLTE4MDYgMCAwIDIwNTYgMTgwNiAwIDAgNDk2OWMzNjIsNTcgNzMzLDg2IDExMTEsODYgMzc4LDAgNzQ5LC0zMCAxMTExLC04NmwwIC00OTY5IDE2NTcgMHoiLz4NCiA8L2c+DQo8L3N2Zz4NCg==",
    ig: "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMzIuMDA0IiBoZWlnaHQ9IjEzMiIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPgoJPGRlZnM+CgkJPGxpbmVhckdyYWRpZW50IGlkPSJiIj4KCQkJPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMzc3MWM4Ii8+CgkJCTxzdG9wIHN0b3AtY29sb3I9IiMzNzcxYzgiIG9mZnNldD0iLjEyOCIvPgoJCQk8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM2MGYiIHN0b3Atb3BhY2l0eT0iMCIvPgoJCTwvbGluZWFyR3JhZGllbnQ+CgkJPGxpbmVhckdyYWRpZW50IGlkPSJhIj4KCQkJPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZmQ1Ii8+CgkJCTxzdG9wIG9mZnNldD0iLjEiIHN0b3AtY29sb3I9IiNmZDUiLz4KCQkJPHN0b3Agb2Zmc2V0PSIuNSIgc3RvcC1jb2xvcj0iI2ZmNTQzZSIvPgoJCQk8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNjODM3YWIiLz4KCQk8L2xpbmVhckdyYWRpZW50PgoJCTxyYWRpYWxHcmFkaWVudCBpZD0iYyIgY3g9IjE1OC40MjkiIGN5PSI1NzguMDg4IiByPSI2NSIgeGxpbms6aHJlZj0iI2EiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiBncmFkaWVudFRyYW5zZm9ybT0ibWF0cml4KDAgLTEuOTgxOTggMS44NDM5IDAgLTEwMzEuNDAyIDQ1NC4wMDQpIiBmeD0iMTU4LjQyOSIgZnk9IjU3OC4wODgiLz4KCQk8cmFkaWFsR3JhZGllbnQgaWQ9ImQiIGN4PSIxNDcuNjk0IiBjeT0iNDczLjQ1NSIgcj0iNjUiIHhsaW5rOmhyZWY9IiNiIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgZ3JhZGllbnRUcmFuc2Zvcm09Im1hdHJpeCguMTczOTQgLjg2ODcyIC0zLjU4MTggLjcxNzE4IDE2NDguMzQ4IC00NTguNDkzKSIgZng9IjE0Ny42OTQiIGZ5PSI0NzMuNDU1Ii8+Cgk8L2RlZnM+Cgk8cGF0aCBmaWxsPSJ1cmwoI2MpIiBkPSJNNjUuMDMgMEMzNy44ODggMCAyOS45NS4wMjggMjguNDA3LjE1NmMtNS41Ny40NjMtOS4wMzYgMS4zNC0xMi44MTIgMy4yMi0yLjkxIDEuNDQ1LTUuMjA1IDMuMTItNy40NyA1LjQ2OEM0IDEzLjEyNiAxLjUgMTguMzk0LjU5NSAyNC42NTZjLS40NCAzLjA0LS41NjggMy42Ni0uNTk0IDE5LjE4OC0uMDEgNS4xNzYgMCAxMS45ODggMCAyMS4xMjUgMCAyNy4xMi4wMyAzNS4wNS4xNiAzNi41OS40NSA1LjQyIDEuMyA4LjgzIDMuMSAxMi41NiAzLjQ0IDcuMTQgMTAuMDEgMTIuNSAxNy43NSAxNC41IDIuNjguNjkgNS42NCAxLjA3IDkuNDQgMS4yNSAxLjYxLjA3IDE4LjAyLjEyIDM0LjQ0LjEyIDE2LjQyIDAgMzIuODQtLjAyIDM0LjQxLS4xIDQuNC0uMjA3IDYuOTU1LS41NSA5Ljc4LTEuMjggNy43OS0yLjAxIDE0LjI0LTcuMjkgMTcuNzUtMTQuNTMgMS43NjUtMy42NCAyLjY2LTcuMTggMy4wNjUtMTIuMzE3LjA4OC0xLjEyLjEyNS0xOC45NzcuMTI1LTM2LjgxIDAtMTcuODM2LS4wNC0zNS42Ni0uMTI4LTM2Ljc4LS40MS01LjIyLTEuMzA1LTguNzMtMy4xMjctMTIuNDQtMS40OTUtMy4wMzctMy4xNTUtNS4zMDUtNS41NjUtNy42MjRDMTE2LjkgNCAxMTEuNjQgMS41IDEwNS4zNzIuNTk2IDEwMi4zMzUuMTU3IDEwMS43My4wMjcgODYuMTkgMEg2NS4wM3oiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEuMDA0IDEpIi8+Cgk8cGF0aCBmaWxsPSJ1cmwoI2QpIiBkPSJNNjUuMDMgMEMzNy44ODggMCAyOS45NS4wMjggMjguNDA3LjE1NmMtNS41Ny40NjMtOS4wMzYgMS4zNC0xMi44MTIgMy4yMi0yLjkxIDEuNDQ1LTUuMjA1IDMuMTItNy40NyA1LjQ2OEM0IDEzLjEyNiAxLjUgMTguMzk0LjU5NSAyNC42NTZjLS40NCAzLjA0LS41NjggMy42Ni0uNTk0IDE5LjE4OC0uMDEgNS4xNzYgMCAxMS45ODggMCAyMS4xMjUgMCAyNy4xMi4wMyAzNS4wNS4xNiAzNi41OS40NSA1LjQyIDEuMyA4LjgzIDMuMSAxMi41NiAzLjQ0IDcuMTQgMTAuMDEgMTIuNSAxNy43NSAxNC41IDIuNjguNjkgNS42NCAxLjA3IDkuNDQgMS4yNSAxLjYxLjA3IDE4LjAyLjEyIDM0LjQ0LjEyIDE2LjQyIDAgMzIuODQtLjAyIDM0LjQxLS4xIDQuNC0uMjA3IDYuOTU1LS41NSA5Ljc4LTEuMjggNy43OS0yLjAxIDE0LjI0LTcuMjkgMTcuNzUtMTQuNTMgMS43NjUtMy42NCAyLjY2LTcuMTggMy4wNjUtMTIuMzE3LjA4OC0xLjEyLjEyNS0xOC45NzcuMTI1LTM2LjgxIDAtMTcuODM2LS4wNC0zNS42Ni0uMTI4LTM2Ljc4LS40MS01LjIyLTEuMzA1LTguNzMtMy4xMjctMTIuNDQtMS40OTUtMy4wMzctMy4xNTUtNS4zMDUtNS41NjUtNy42MjRDMTE2LjkgNCAxMTEuNjQgMS41IDEwNS4zNzIuNTk2IDEwMi4zMzUuMTU3IDEwMS43My4wMjcgODYuMTkgMEg2NS4wM3oiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEuMDA0IDEpIi8+Cgk8cGF0aCBmaWxsPSIjZmZmIiBkPSJNNjYuMDA0IDE4Yy0xMy4wMzYgMC0xNC42NzIuMDU3LTE5Ljc5Mi4yOS01LjExLjIzNC04LjU5OCAxLjA0My0xMS42NSAyLjIzLTMuMTU3IDEuMjI2LTUuODM1IDIuODY2LTguNTAzIDUuNTM1LTIuNjcgMi42NjgtNC4zMSA1LjM0Ni01LjU0IDguNTAyLTEuMTkgMy4wNTMtMiA2LjU0Mi0yLjIzIDExLjY1QzE4LjA2IDUxLjMyNyAxOCA1Mi45NjQgMTggNjZzLjA1OCAxNC42NjcuMjkgMTkuNzg3Yy4yMzUgNS4xMSAxLjA0NCA4LjU5OCAyLjIzIDExLjY1IDEuMjI3IDMuMTU3IDIuODY3IDUuODM1IDUuNTM2IDguNTAzIDIuNjY3IDIuNjcgNS4zNDUgNC4zMTQgOC41IDUuNTQgMy4wNTQgMS4xODcgNi41NDMgMS45OTYgMTEuNjUyIDIuMjMgNS4xMi4yMzMgNi43NTUuMjkgMTkuNzkuMjkgMTMuMDM3IDAgMTQuNjY4LS4wNTcgMTkuNzg4LS4yOSA1LjExLS4yMzQgOC42MDItMS4wNDMgMTEuNjU2LTIuMjMgMy4xNTYtMS4yMjYgNS44My0yLjg3IDguNDk3LTUuNTQgMi42Ny0yLjY2OCA0LjMxLTUuMzQ2IDUuNTQtOC41MDIgMS4xOC0zLjA1MyAxLjk5LTYuNTQyIDIuMjMtMTEuNjUuMjMtNS4xMi4yOS02Ljc1Mi4yOS0xOS43ODggMC0xMy4wMzYtLjA2LTE0LjY3Mi0uMjktMTkuNzkyLS4yNC01LjExLTEuMDUtOC41OTgtMi4yMy0xMS42NS0xLjIzLTMuMTU3LTIuODctNS44MzUtNS41NC04LjUwMy0yLjY3LTIuNjctNS4zNC00LjMxLTguNS01LjUzNS0zLjA2LTEuMTg3LTYuNTUtMS45OTYtMTEuNjYtMi4yMy01LjEyLS4yMzMtNi43NS0uMjktMTkuNzktLjI5em0tNC4zMDYgOC42NWMxLjI3OC0uMDAyIDIuNzA0IDAgNC4zMDYgMCAxMi44MTYgMCAxNC4zMzUuMDQ2IDE5LjM5Ni4yNzYgNC42OC4yMTQgNy4yMi45OTYgOC45MTIgMS42NTMgMi4yNC44NyAzLjgzNyAxLjkxIDUuNTE2IDMuNTkgMS42OCAxLjY4IDIuNzIgMy4yOCAzLjU5MiA1LjUyLjY1NyAxLjY5IDEuNDQgNC4yMyAxLjY1MyA4LjkxLjIzIDUuMDYuMjggNi41OC4yOCAxOS4zOXMtLjA1IDE0LjMzLS4yOCAxOS4zOWMtLjIxNCA0LjY4LS45OTYgNy4yMi0xLjY1MyA4LjkxLS44NyAyLjI0LTEuOTEyIDMuODM1LTMuNTkyIDUuNTE0LTEuNjggMS42OC0zLjI3NSAyLjcyLTUuNTE2IDMuNTktMS42OS42Ni00LjIzMiAxLjQ0LTguOTEyIDEuNjU0LTUuMDYuMjMtNi41OC4yOC0xOS4zOTYuMjgtMTIuODE3IDAtMTQuMzM2LS4wNS0xOS4zOTYtLjI4LTQuNjgtLjIxNi03LjIyLS45OTgtOC45MTMtMS42NTUtMi4yNC0uODctMy44NC0xLjkxLTUuNTItMy41OS0xLjY4LTEuNjgtMi43Mi0zLjI3Ni0zLjU5Mi01LjUxNy0uNjU3LTEuNjktMS40NC00LjIzLTEuNjUzLTguOTEtLjIzLTUuMDYtLjI3Ni02LjU4LS4yNzYtMTkuMzk4cy4wNDYtMTQuMzMuMjc2LTE5LjM5Yy4yMTQtNC42OC45OTYtNy4yMiAxLjY1My04LjkxMi44Ny0yLjI0IDEuOTEyLTMuODQgMy41OTItNS41MiAxLjY4LTEuNjggMy4yOC0yLjcyIDUuNTItMy41OTIgMS42OTItLjY2IDQuMjMzLTEuNDQgOC45MTMtMS42NTUgNC40MjgtLjIgNi4xNDQtLjI2IDE1LjA5LS4yN3ptMjkuOTI4IDcuOTdjLTMuMTggMC01Ljc2IDIuNTc3LTUuNzYgNS43NTggMCAzLjE4IDIuNTggNS43NiA1Ljc2IDUuNzYgMy4xOCAwIDUuNzYtMi41OCA1Ljc2LTUuNzYgMC0zLjE4LTIuNTgtNS43Ni01Ljc2LTUuNzZ6bS0yNS42MjIgNi43M2MtMTMuNjEzIDAtMjQuNjUgMTEuMDM3LTI0LjY1IDI0LjY1IDAgMTMuNjEzIDExLjAzNyAyNC42NDUgMjQuNjUgMjQuNjQ1Qzc5LjYxNyA5MC42NDUgOTAuNjUgNzkuNjEzIDkwLjY1IDY2Uzc5LjYxNiA0MS4zNSA2Ni4wMDMgNDEuMzV6bTAgOC42NWM4LjgzNiAwIDE2IDcuMTYzIDE2IDE2IDAgOC44MzYtNy4xNjQgMTYtMTYgMTYtOC44MzcgMC0xNi03LjE2NC0xNi0xNiAwLTguODM3IDcuMTYzLTE2IDE2LTE2eiIvPgo8L3N2Zz4=",
    wpp: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNzUuMjE2IDE3NS41NTIiPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iYiIgeDE9Ijg1LjkxNSIgeDI9Ijg2LjUzNSIgeTE9IjMyLjU2NyIgeTI9IjEzNy4wOTIiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM1N2QxNjMiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMyM2IzM2EiLz48L2xpbmVhckdyYWRpZW50PjxmaWx0ZXIgaWQ9ImEiIHdpZHRoPSIxLjExNSIgaGVpZ2h0PSIxLjExNCIgeD0iLS4wNTciIHk9Ii0uMDU3IiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjMuNTMxIi8+PC9maWx0ZXI+PC9kZWZzPjxwYXRoIGZpbGw9IiNiM2IzYjMiIGQ9Im01NC41MzIgMTM4LjQ1IDIuMjM1IDEuMzI0YzkuMzg3IDUuNTcxIDIwLjE1IDguNTE4IDMxLjEyNiA4LjUyM2guMDIzYzMzLjcwNyAwIDYxLjEzOS0yNy40MjYgNjEuMTUzLTYxLjEzNS4wMDYtMTYuMzM1LTYuMzQ5LTMxLjY5Ni0xNy44OTUtNDMuMjUxQTYwLjc1IDYwLjc1IDAgMCAwIDg3Ljk0IDI1Ljk4M2MtMzMuNzMzIDAtNjEuMTY2IDI3LjQyMy02MS4xNzggNjEuMTNhNjAuOTggNjAuOTggMCAwIDAgOS4zNDkgMzIuNTM1bDEuNDU1IDIuMzEyLTYuMTc5IDIyLjU1OHptLTQwLjgxMSAyMy41NDRMMjQuMTYgMTIzLjg4Yy02LjQzOC0xMS4xNTQtOS44MjUtMjMuODA4LTkuODIxLTM2Ljc3Mi4wMTctNDAuNTU2IDMzLjAyMS03My41NSA3My41NzgtNzMuNTUgMTkuNjgxLjAxIDM4LjE1NCA3LjY2OSA1Mi4wNDcgMjEuNTcyczIxLjUzNyAzMi4zODMgMjEuNTMgNTIuMDM3Yy0uMDE4IDQwLjU1My0zMy4wMjcgNzMuNTUzLTczLjU3OCA3My41NTNoLS4wMzJjLTEyLjMxMy0uMDA1LTI0LjQxMi0zLjA5NC0zNS4xNTktOC45NTR6bTAgMCIgZmlsdGVyPSJ1cmwoI2EpIi8+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTEyLjk2NiAxNjEuMjM4IDEwLjQzOS0zOC4xMTRhNzMuNDIgNzMuNDIgMCAwIDEtOS44MjEtMzYuNzcyYy4wMTctNDAuNTU2IDMzLjAyMS03My41NSA3My41NzgtNzMuNTUgMTkuNjgxLjAxIDM4LjE1NCA3LjY2OSA1Mi4wNDcgMjEuNTcyczIxLjUzNyAzMi4zODMgMjEuNTMgNTIuMDM3Yy0uMDE4IDQwLjU1My0zMy4wMjcgNzMuNTUzLTczLjU3OCA3My41NTNoLS4wMzJjLTEyLjMxMy0uMDA1LTI0LjQxMi0zLjA5NC0zNS4xNTktOC45NTR6Ii8+PHBhdGggZmlsbD0idXJsKCNsaW5lYXJHcmFkaWVudDE3ODApIiBkPSJNODcuMTg0IDI1LjIyN2MtMzMuNzMzIDAtNjEuMTY2IDI3LjQyMy02MS4xNzggNjEuMTNhNjAuOTggNjAuOTggMCAwIDAgOS4zNDkgMzIuNTM1bDEuNDU1IDIuMzEyLTYuMTc5IDIyLjU1OSAyMy4xNDYtNi4wNjkgMi4yMzUgMS4zMjRjOS4zODcgNS41NzEgMjAuMTUgOC41MTggMzEuMTI2IDguNTI0aC4wMjNjMzMuNzA3IDAgNjEuMTQtMjcuNDI2IDYxLjE1My02MS4xMzVhNjAuNzUgNjAuNzUgMCAwIDAtMTcuODk1LTQzLjI1MSA2MC43NSA2MC43NSAwIDAgMC00My4yMzUtMTcuOTI5eiIvPjxwYXRoIGZpbGw9InVybCgjYikiIGQ9Ik04Ny4xODQgMjUuMjI3Yy0zMy43MzMgMC02MS4xNjYgMjcuNDIzLTYxLjE3OCA2MS4xM2E2MC45OCA2MC45OCAwIDAgMCA5LjM0OSAzMi41MzVsMS40NTUgMi4zMTMtNi4xNzkgMjIuNTU4IDIzLjE0Ni02LjA2OSAyLjIzNSAxLjMyNGM5LjM4NyA1LjU3MSAyMC4xNSA4LjUxNyAzMS4xMjYgOC41MjNoLjAyM2MzMy43MDcgMCA2MS4xNC0yNy40MjYgNjEuMTUzLTYxLjEzNWE2MC43NSA2MC43NSAwIDAgMC0xNy44OTUtNDMuMjUxIDYwLjc1IDYwLjc1IDAgMCAwLTQzLjIzNS0xNy45Mjh6Ii8+PHBhdGggZmlsbD0iI2ZmZiIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNNjguNzcyIDU1LjYwM2MtMS4zNzgtMy4wNjEtMi44MjgtMy4xMjMtNC4xMzctMy4xNzZsLTMuNTI0LS4wNDNjLTEuMjI2IDAtMy4yMTguNDYtNC45MDIgMi4zcy02LjQzNSA2LjI4Ny02LjQzNSAxNS4zMzIgNi41ODggMTcuNzg1IDcuNTA2IDE5LjAxMyAxMi43MTggMjAuMzgxIDMxLjQwNSAyNy43NWMxNS41MjkgNi4xMjQgMTguNjg5IDQuOTA2IDIyLjA2MSA0LjZzMTAuODc3LTQuNDQ3IDEyLjQwOC04Ljc0IDEuNTMyLTcuOTcxIDEuMDczLTguNzQtMS42ODUtMS4yMjYtMy41MjUtMi4xNDYtMTAuODc3LTUuMzY3LTEyLjU2Mi01Ljk4MS0yLjkxLS45MTktNC4xMzcuOTIxLTQuNzQ2IDUuOTc5LTUuODE5IDcuMjA2LTIuMTQ0IDEuMzgxLTMuOTg0LjQ2Mi03Ljc2LTIuODYxLTE0Ljc4NC05LjEyNGMtNS40NjUtNC44NzMtOS4xNTQtMTAuODkxLTEwLjIyOC0xMi43M3MtLjExNC0yLjgzNS44MDgtMy43NTFjLjgyNS0uODI0IDEuODM4LTIuMTQ3IDIuNzU5LTMuMjJzMS4yMjQtMS44NCAxLjgzNi0zLjA2NS4zMDctMi4zMDEtLjE1My0zLjIyLTQuMDMyLTEwLjAxMS01LjY2Ni0xMy42NDciLz48L3N2Zz4=",
    mss: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwMEM2RkYiLz48c3RvcCBvZmZzZXQ9IjQ1JSIgc3RvcC1jb2xvcj0iIzAwNjhGRiIvPjxzdG9wIG9mZnNldD0iNzUlIiBzdG9wLWNvbG9yPSIjOEExRUZGIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjRkY2QTNEIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHBhdGggZmlsbD0idXJsKCNnKSIgZD0iTTI1Ni41NSA4QzExNi41MiA4IDggMTEwLjM0IDggMjQ4LjU3YzAgNzIuMyAyOS43MSAxMzQuNzggNzguMDcgMTc3Ljk0IDguMzUgNy41MSA2LjYzIDExLjg2IDguMDUgNTguMjNBMTkuOTIgMTkuOTIgMCAwIDAgMTIyIDUwMi4zMWM1Mi45MS0yMy4zIDUzLjU5LTI1LjE0IDYyLjU2LTIyLjdDMzM3Ljg1IDUyMS44IDUwNCA0MjMuNyA1MDQgMjQ4LjU3IDUwNCAxMTAuMzQgMzk2LjU5IDggMjU2LjU1IDhaIi8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTQwNS43OSAxOTMuMTNsLTczIDExNS41N2EzNy4zNyAzNy4zNyAwIDAgMS01My45MSA5LjkzbC01OC4wOC00My40N2ExNSAxNSAwIDAgMC0xOCAwbC03OC4zNyA1OS40NGMtMTAuNDYgNy45My0yNC4xNi00LjYtMTcuMTEtMTUuNjdsNzMtMTE1LjU3YTM3LjM2IDM3LjM2IDAgMCAxIDUzLjkxLTkuOTNsNTguMDYgNDMuNDZhMTUgMTUgMCAwIDAgMTggMGw3OC40MS01OS4zOGMxMC40NC03Ljk4IDI0LjE0IDQuNTQgMTcuMDkgMTUuNjJaIi8+PC9zdmc+DQo="
  };
  const SOCIAL_ICON_IMAGE_CACHE = new Map();
  OFFICIAL_SOCIAL_ICON_SOURCES.web =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZyIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMwYWQxZjUiIC8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzAwNjhmZiIgLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxjaXJjbGUgY3g9IjI1NiIgY3k9IjI1NiIgcj0iMjMyIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIyOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj4KICAgIDxjaXJjbGUgY3g9IjI1NiIgY3k9IjI1NiIgcj0iMTY0IiAvPgogICAgPHBhdGggZD0iTTkyIDI1NmgzMjgiIC8+CiAgICA8cGF0aCBkPSJNMjU2IDkyYzU0IDQ4IDg2IDEwNCA4NiAxNjRzLTMyIDExNi04NiAxNjQiIC8+CiAgICA8cGF0aCBkPSJNMjU2IDkyYy01NCA0OC04NiAxMDQtODYgMTY0czMyIDExNiA4NiAxNjQiIC8+CiAgPC9nPgo8L3N2Zz4NCg==";
  OFFICIAL_SOCIAL_ICON_SOURCES.manual =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iZG9jIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzgzNjhmZiIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjYjI4OGZmIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0icGVuY2lsIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2ZmYjg2YyIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZmY2YTljIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3QgeD0iNjgiIHk9IjU2IiB3aWR0aD0iMjk2IiBoZWlnaHQ9IjQwMCIgcng9IjU2IiBmaWxsPSJ1cmwoI2RvYykiIC8+CiAgPHJlY3QgeD0iMTA0IiB5PSI5NiIgd2lkdGg9IjIyNCIgaGVpZ2h0PSIzMjAiIHJ4PSI0MCIgZmlsbD0iI2ZmZmZmZiIgb3BhY2l0eT0iMC45MiIgLz4KICA8Y2lyY2xlIGN4PSIyMTYiIGN5PSIxOTIiIHI9IjQ0IiBmaWxsPSIjYTc4YmZhIiAvPgogIDxyZWN0IHg9IjE2MCIgeT0iMjYwIiB3aWR0aD0iMTUyIiBoZWlnaHQ9IjI4IiByeD0iMTQiIGZpbGw9IiNjNGI1ZmQiIC8+CiAgPHJlY3QgeD0iMTYwIiB5PSIzMTIiIHdpZHRoPSIxMjgiIGhlaWdodD0iMjgiIHJ4PSIxNCIgZmlsbD0iI2M0YjVmZCIgb3BhY2l0eT0iMC44NSIgLz4KICA8cGF0aCBmaWxsPSJ1cmwoI3BlbmNpbCkiIGQ9Ik0zMjAgMTYwbDk2IDk2LTEzOCAxMzhjLTYgNi0xMyAxMC0yMSAxMmwtNTcgMTNjLTggMi0xNS01LTEzLTEzbDEzLTU3YzItOCA2LTE1IDEyLTIxeiIgLz4KICA8cGF0aCBmaWxsPSIjZmZkY2E4IiBkPSJNNDEwIDI0NmwzMiAzMi0xMiAxMi0zMi0zMnoiIC8+Cjwvc3ZnPg0K";
  function ensureOfficialIconImage(key, canvas) {
    const src = OFFICIAL_SOCIAL_ICON_SOURCES[key];
    if (!src) return null;
    let entry = SOCIAL_ICON_IMAGE_CACHE.get(key);
    if (!entry) {
      const img = new Image();
      img.decoding = "async";
      entry = { img, ready: false, error: false, canvas: canvas || null };
      SOCIAL_ICON_IMAGE_CACHE.set(key, entry);
      img.onload = () => {
        entry.ready = true;
        const targetCanvas = entry.canvas;
        if (targetCanvas && targetCanvas.__socialChartInstance) {
          try {
            targetCanvas.__socialChartInstance.update("none");
          } catch (err) {
            console.warn("social icon redraw failed", err);
          }
        }
      };
      img.onerror = (err) => {
        entry.error = true;
        console.warn(`Icon load failed for ${key}`, err);
      };
      img.src = src;
    }
    if (canvas) {
      entry.canvas = canvas;
    }
    return entry;
  }
  function drawFallbackSocialIcon(ctx, key, radius, bgColor, fgColor, baselineOffset) {
    const r = radius;

    ctx.beginPath();
    ctx.fillStyle = bgColor;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = fgColor || "#fff";
    ctx.strokeStyle = fgColor || "#fff";
    ctx.lineWidth = Math.max(1.4, r * 0.32);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (key) {
      case "wpp": {
        const scale = r * 0.6;
        ctx.beginPath();
        ctx.moveTo(-scale * 0.3, -scale * 0.5);
        ctx.bezierCurveTo(
          -scale * 0.1,
          -scale * 0.9,
          scale * 0.4,
          -scale * 0.9,
          scale * 0.6,
          -scale * 0.2
        );
        ctx.bezierCurveTo(scale * 0.7, scale * 0.2, scale * 0.4, scale * 0.45, 0, scale * 0.55);
        ctx.lineTo(-scale * 0.25, scale * 0.8);
        ctx.lineTo(-scale * 0.2, scale * 0.45);
        ctx.bezierCurveTo(
          -scale * 0.6,
          scale * 0.2,
          -scale * 0.7,
          -scale * 0.2,
          -scale * 0.3,
          -scale * 0.5
        );
        ctx.stroke();
        break;
      }
      case "fb": {
        ctx.fillStyle = fgColor || "#fff";
        ctx.beginPath();
        const w = r * 0.6;
        const h = r * 1.2;
        ctx.moveTo(-w * 0.2, -h * 0.5);
        ctx.lineTo(w * 0.3, -h * 0.5);
        ctx.lineTo(w * 0.3, -h * 0.2);
        ctx.lineTo(w * 0.05, -h * 0.2);
        ctx.lineTo(w * 0.05, h * 0.5);
        ctx.lineTo(-w * 0.25, h * 0.5);
        ctx.lineTo(-w * 0.25, -h * 0.2);
        ctx.lineTo(-w * 0.45, -h * 0.2);
        ctx.lineTo(-w * 0.45, -h * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "ig": {
        const g = ctx.createLinearGradient(-r, -r, r, r);
        g.addColorStop(0, "#ff6a6a");
        g.addColorStop(0.5, "#c13584");
        g.addColorStop(1, "#515bd4");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = r * 0.18;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = r * 0.14;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = "#fff";
        ctx.arc(r * 0.55, -r * 0.55, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "mss": {
        ctx.beginPath();
        ctx.moveTo(-r * 0.65, -r * 0.2);
        ctx.bezierCurveTo(-r * 0.65, -r * 0.8, r * 0.6, -r * 0.8, r * 0.6, -r * 0.1);
        ctx.bezierCurveTo(r * 0.6, r * 0.2, r * 0.2, r * 0.45, -r * 0.1, r * 0.55);
        ctx.lineTo(-r * 0.3, r * 0.9);
        ctx.lineTo(-r * 0.35, r * 0.35);
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = r * 0.22;
        ctx.moveTo(-r * 0.2, -r * 0.1);
        ctx.lineTo(0, r * 0.2);
        ctx.lineTo(r * 0.3, -r * 0.1);
        ctx.stroke();
        break;
      }
      case "web": {
        ctx.strokeStyle = fgColor || "#fff";
        ctx.lineWidth = r * 0.16;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, 0);
        ctx.lineTo(r * 0.6, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.6);
        ctx.lineTo(0, r * 0.6);
        ctx.stroke();
        break;
      }
      case "ext": {
        ctx.fillStyle = fgColor || "#fff";
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.5);
        ctx.lineTo(r * 0.5, -r * 0.5);
        ctx.lineTo(r * 0.2, r * 0.5);
        ctx.lineTo(-r * 0.2, r * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "manual": {
        // document background
        const docRadius = r * 0.26;
        ctx.fillStyle = "#ede9fe";
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath();
          ctx.roundRect(-r * 0.45, -r * 0.5, r * 0.9, r * 1.0, docRadius);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(-r * 0.45 + docRadius, -r * 0.5);
          ctx.lineTo(r * 0.45 - docRadius, -r * 0.5);
          ctx.quadraticCurveTo(r * 0.45, -r * 0.5, r * 0.45, -r * 0.5 + docRadius);
          ctx.lineTo(r * 0.45, r * 0.5 - docRadius);
          ctx.quadraticCurveTo(r * 0.45, r * 0.5, r * 0.45 - docRadius, r * 0.5);
          ctx.lineTo(-r * 0.45 + docRadius, r * 0.5);
          ctx.quadraticCurveTo(-r * 0.45, r * 0.5, -r * 0.45, r * 0.5 - docRadius);
          ctx.lineTo(-r * 0.45, -r * 0.5 + docRadius);
          ctx.quadraticCurveTo(-r * 0.45, -r * 0.5, -r * 0.45 + docRadius, -r * 0.5);
          ctx.fill();
        }
        // inner page
        ctx.fillStyle = "#ffffff";
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath();
          ctx.roundRect(-r * 0.34, -r * 0.4, r * 0.68, r * 0.82, docRadius * 0.65);
          ctx.fill();
        } else {
          const innerR = docRadius * 0.65;
          ctx.beginPath();
          ctx.moveTo(-r * 0.34 + innerR, -r * 0.4);
          ctx.lineTo(r * 0.34 - innerR, -r * 0.4);
          ctx.quadraticCurveTo(r * 0.34, -r * 0.4, r * 0.34, -r * 0.4 + innerR);
          ctx.lineTo(r * 0.34, r * 0.42 - innerR);
          ctx.quadraticCurveTo(r * 0.34, r * 0.42, r * 0.34 - innerR, r * 0.42);
          ctx.lineTo(-r * 0.34 + innerR, r * 0.42);
          ctx.quadraticCurveTo(-r * 0.34, r * 0.42, -r * 0.34, r * 0.42 - innerR);
          ctx.lineTo(-r * 0.34, -r * 0.4 + innerR);
          ctx.quadraticCurveTo(-r * 0.34, -r * 0.4, -r * 0.34 + innerR, -r * 0.4);
          ctx.fill();
        }
        // avatar circle
        ctx.fillStyle = "#a78bfa";
        ctx.beginPath();
        ctx.arc(-r * 0.06, -r * 0.12, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        // text lines
        ctx.fillStyle = "#c4b5fd";
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath();
          ctx.roundRect(-r * 0.26, r * 0.02, r * 0.48, r * 0.12, r * 0.06);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(-r * 0.26, r * 0.19, r * 0.36, r * 0.1, r * 0.05);
          ctx.fill();
        } else {
          ctx.fillRect(-r * 0.26, r * 0.02, r * 0.48, r * 0.12);
          ctx.fillRect(-r * 0.26, r * 0.19, r * 0.36, r * 0.1);
        }
        // pencil
        ctx.fillStyle = "#ff9bbf";
        ctx.beginPath();
        ctx.moveTo(r * 0.05, -r * 0.4);
        ctx.lineTo(r * 0.48, -r * 0.0);
        ctx.lineTo(r * 0.2, r * 0.28);
        ctx.lineTo(-r * 0.12, r * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffdca8";
        ctx.beginPath();
        ctx.moveTo(r * 0.44, -r * 0.04);
        ctx.lineTo(r * 0.58, r * 0.1);
        ctx.lineTo(r * 0.46, r * 0.22);
        ctx.lineTo(r * 0.32, r * 0.08);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default: {
        ctx.fillStyle = fgColor || "#fff";
        ctx.font = `600 ${r * 1.1}px Inter, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(key?.charAt(0).toUpperCase() || "?", 0, baselineOffset);
      }
    }
  }

  function drawSocialIcon(ctx, key, x, y, radius, bgColor, fgColor, baselineOffset = 0) {
    key = key || "";
    ctx.save();
    ctx.translate(x, y);

    const official = ensureOfficialIconImage(key, ctx.canvas);
    if (official && official.ready && !official.error) {
      const size = radius * 2;
      ctx.drawImage(official.img, -radius, -radius, size, size);
      ctx.restore();
      return;
    }

    drawFallbackSocialIcon(ctx, key, radius, bgColor, fgColor, baselineOffset);
    ctx.restore();
  }

  const CHANNEL_NAME_MAP = {
    wpp: "WhatsApp",
    fb: "Facebook",
    ig: "Instagram",
    mss: "Messenger",
    web: "Web",
    manual: "Registro manual",
    ext: "Externo",
    def: "Otro",
  };

  function friendlyChannelLabel(label) {
    const key = C.canalKey ? C.canalKey(label) : C.norm(label || "");
    if (CHANNEL_NAME_MAP[key]) return CHANNEL_NAME_MAP[key];
    const normLabel = C.norm(label || "");
    if (normLabel.includes("whats")) return CHANNEL_NAME_MAP.wpp;
    if (normLabel.includes("face")) return CHANNEL_NAME_MAP.fb;
    if (normLabel.includes("insta")) return CHANNEL_NAME_MAP.ig;
    if (normLabel.includes("mess")) return CHANNEL_NAME_MAP.mss;
    if (normLabel.includes("web")) return CHANNEL_NAME_MAP.web;
    if (normLabel.includes("manual")) return CHANNEL_NAME_MAP.manual;
    if (normLabel.includes("extern")) return CHANNEL_NAME_MAP.ext;
    return label || "(Sin dato)";
  }

  function contrastColor(color) {
    try {
      return C.contrastText(color);
    } catch {
      return "#ffffff";
    }
  }
  function parseColorToRGBLocal(color) {
    color = (color || "").trim();
    if (!color) return { r: 52, g: 209, b: 191 };
    if (color.startsWith("#")) {
      const normHex = color.length === 4 ? color.replace(/./g, (m) => m + m) : color;
      const num = Number.parseInt(normHex.slice(1), 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    }
    const tmp = document.createElement("canvas").getContext("2d");
    tmp.fillStyle = color;
    const match = tmp.fillStyle.match(/rgba?\(([^)]+)\)/i);
    if (match) {
      const [r, g, b] = match[1].split(",").map((x) => parseFloat(x));
      return { r, g, b };
    }
    return { r: 52, g: 209, b: 191 };
  }
  function withAlpha(color, alpha) {
    const { r, g, b } = parseColorToRGBLocal(color);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function normalizeRange(range) {
    if (!range || !range.from || !range.to) return null;
    const fromDate = new Date(range.from + "T00:00:00");
    const toDate = new Date(range.to + "T00:00:00");
    if (Number.isNaN(fromDate) || Number.isNaN(toDate)) return null;
    const days = Math.max(1, Math.round((toDate - fromDate) / 86_400_000) + 1);
    return {
      from: C.isoDay(fromDate),
      to: C.isoDay(toDate),
      fromDate,
      toDate,
      fromTs: fromDate.getTime(),
      toTs: toDate.getTime() + 86_399_999,
      days,
    };
  }
  function datasetRange() {
    if (!allRows.length) return null;
    const times = allRows.map((r) => r._dateOnly).filter((t) => Number.isFinite(t));
    if (!times.length) return null;
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { from: C.isoDay(new Date(min)), to: C.isoDay(new Date(max)) };
  }
  function activeRangeInfo() {
    if (
      window.__metricsGroupRange &&
      window.__metricsGroupRange.from &&
      window.__metricsGroupRange.to
    ) {
      return normalizeRange(window.__metricsGroupRange);
    }
    if (histRange && histRange.from && histRange.to) {
      return normalizeRange(histRange);
    }
    const fallback = datasetRange() || last7DaysRange();
    return normalizeRange(fallback);
  }
  function previousRangeInfo(rangeInfo) {
    if (!rangeInfo) return null;
    const prevTo = new Date(rangeInfo.fromDate);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - (rangeInfo.days - 1));
    return normalizeRange({ from: C.isoDay(prevFrom), to: C.isoDay(prevTo) });
  }
  function rowsWithinRange(rangeInfo, predicate) {
    if (!rangeInfo) return [];
    return allRows.filter((row) => {
      const t = row._dateOnly;
      if (Number.isNaN(t)) return false;
      if (t < rangeInfo.fromTs || t > rangeInfo.toTs) return false;
      return !predicate || predicate(row);
    });
  }
  function buildSeriesForRange(rangeInfo, rows) {
    if (!rangeInfo) return { labels: [], values: [] };
    const values = new Array(rangeInfo.days).fill(0);
    rows.forEach((row) => {
      const idx = Math.floor((row._dateOnly - rangeInfo.fromTs) / 86_400_000);
      if (idx >= 0 && idx < values.length) values[idx] += 1;
    });
    const labels = [];
    for (let i = 0; i < rangeInfo.days; i += 1) {
      const day = new Date(rangeInfo.fromDate);
      day.setDate(rangeInfo.fromDate.getDate() + i);
      labels.push(C.isoDay(day));
    }
    return { labels, values };
  }
  function formatRangeLabel(rangeInfo) {
    if (!rangeInfo) return "";
    const sameYear = rangeInfo.fromDate.getFullYear() === rangeInfo.toDate.getFullYear();
    const fromTxt = sameYear
      ? C.prettyDayShort(rangeInfo.fromDate)
      : C.prettyDay(rangeInfo.fromDate);
    const toTxt = C.prettyDay(rangeInfo.toDate);
    return `${fromTxt} – ${toTxt}`;
  }
  function percentDelta(currentValue, previousValue) {
    if (previousValue === 0) {
      if (currentValue === 0) return 0;
      return 100;
    }
    return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  }
  function updateHistLabelsToggleButton() {
    const btn = document.getElementById("toggleHistLabels");
    if (!btn) return;
    btn.textContent = "Mostrar datos";
    const state = histShowLabels ? "true" : "false";
    btn.setAttribute("aria-checked", state);
    btn.dataset.on = histShowLabels ? "true" : "false";
  }
  function trendDirection(delta) {
    if (delta > 0.1) return "up";
    if (delta < -0.1) return "down";
    return "flat";
  }
  function isVentaRow(row) {
    const label = C.norm(row.Estado || "");
    return !!label && label.includes("venta");
  }
  function channelLabel(row) {
    const raw = (row.Canal ?? "(Sin dato)").toString().trim();
    return raw || "(Sin dato)";
  }
  function formatSparkTitle(label) {
    if (!label) return "";
    const d = new Date(label + "T00:00:00");
    if (Number.isNaN(d.getTime())) return label;
    return C.prettyDayShort ? C.prettyDayShort(d) : C.prettyDay(d);
  }
  function groupSalesByChannel(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = channelLabel(row);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function computeCountStep(maxValue) {
    if (maxValue <= 5) return 1;
    if (maxValue <= 20) return 2;
    if (maxValue <= 50) return 5;
    if (maxValue <= 100) return 10;
    if (maxValue <= 200) return 20;
    if (maxValue <= 500) return 50;
    return Math.pow(10, Math.floor(Math.log10(maxValue)));
  }

  function computeAxisMeta(values, mode) {
    const maxValue = Math.max(0, ...values);
    if (mode === "percent") {
      const step =
        maxValue >= 80 ? 10 : maxValue >= 40 ? 5 : maxValue >= 20 ? 2 : 1;
      return {
        max: 100,
        step,
      };
    }
    const step = computeCountStep(maxValue || 5);
    const padded = Math.ceil(((maxValue || step) * 1.05) / step) * step;
    return {
      max: Math.max(step, padded),
      step,
    };
  }

  function renderSocialChannels() {
    const canvasEl = document.getElementById("chartSocial");
    const graphWrap = document.getElementById("socialChartGraph");
    if (!canvasEl || !graphWrap) return;

    const detachResizeHandler = () => {
      if (canvasEl.__socialResizeHandler) {
        window.removeEventListener("resize", canvasEl.__socialResizeHandler);
        canvasEl.__socialResizeHandler = null;
      }
      if (canvasEl.__socialResizeObserver) {
        try {
          canvasEl.__socialResizeObserver.disconnect();
        } catch (e) {
          console.warn("social resize observer cleanup failed", e);
        }
        canvasEl.__socialResizeObserver = null;
      }
    };

    const rows = rowsForGroupFilters();
    const stats = groupStats(rows, "Canal");
    const mode = metricModes.social === "count" ? "count" : "percent";
    const nf = new Intl.NumberFormat("es-PE");
    const pf = new Intl.NumberFormat("es-PE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });

    const dataset = stats.labels.map((label, i) => {
      const key = C.canalKey(label);
      const color = C.canalColor(label);
      const fullName = friendlyChannelLabel(label);
      return {
        label,
        key,
        color,
        fullName,
        iconGlyph: iconGlyphFor(key, fullName),
        iconBaselineOffset: iconBaselineOffsetFor(key),
        count: stats.counts[i],
        percent: stats.percents[i],
        displayValue:
          mode === "percent"
            ? `${pf.format(stats.percents[i])}%`
            : nf.format(stats.counts[i]),
        valueLabel:
          mode === "percent"
            ? `${pf.format(stats.percents[i])}%`
            : nf.format(stats.counts[i]),
      };
    });

    if (!dataset.length) {
      detachResizeHandler();
      if (charts.social) {
        charts.social.destroy();
        charts.social = null;
      }
      const ctxEmpty = canvasEl.getContext("2d");
      if (ctxEmpty) {
        ctxEmpty.clearRect(0, 0, canvasEl.width, canvasEl.height);
      }
      graphWrap.style.minHeight = "220px";
      return;
    }

    const values = dataset.map((d) => (mode === "percent" ? d.percent : d.count));
    const colors = dataset.map((d) => d.color);
    const axisMeta = computeAxisMeta(values, mode);
    const desiredHeight = Math.max(220, dataset.length * 58);
    graphWrap.style.minHeight = `${desiredHeight}px`;

    if (charts.social) {
      charts.social.destroy();
      charts.social = null;
    }
    detachResizeHandler();

    const ctx = canvasEl.getContext("2d");
    const docStyles = getComputedStyle(document.documentElement);
    const initialLabelColor =
      docStyles.getPropertyValue("--text").trim() || "#1f2933";
    const tooltipBg = "rgba(0,0,0,0.82)";
    const tooltipText = "#ffffff";
    const formatAxisValue = (value) =>
      mode === "percent" ? `${pf.format(value)}%` : nf.format(value);
    const xAxisMax = axisMeta.max;
    const xAxisStep = axisMeta.step;

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: dataset.map((d) => d.label),
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderRadius: {
              topLeft: 2,
              bottomLeft: 2,
              topRight: 16,
              bottomRight: 16,
            },
            minBarLength: 4,
            barThickness: "flex",
            maxBarThickness: 44,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { left: 160, right: 32, top: 16, bottom: 16 },
        },
        plugins: {
          pillLabels: {
            enabled: histShowLabels,
            mode: histMode === "percent" ? "percent" : "count",
          },
          topStackLabel: {
            enabled: true,
            mode: histMode === "percent" ? "percent" : "count",
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            min: 0,
            max: xAxisMax,
            suggestedMax: xAxisMax,
            grace: 0,
            grid: {
              color:
                docStyles.getPropertyValue("--neutral-border").trim() ||
                docStyles.getPropertyValue("--border").trim() ||
                "#e5e5e5",
              drawBorder: false,
              drawTicks: true,
              tickLength: 4,
            },
            border: { display: false },
            ticks: {
              color:
                docStyles.getPropertyValue("--muted").trim() || "#6b7280",
              padding: 8,
              stepSize: xAxisStep,
              callback: (value) => formatAxisValue(value),
            },
          },
          y: {
            grid: { display: false, drawBorder: false },
            ticks: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            callbacks: {
              label(context) {
                const item = dataset[context.dataIndex];
                if (!item) return "";
                if (mode === "percent") {
                  const percentValue = pf.format(context.parsed.x);
                  const countValue =
                    item && Number.isFinite(item.count) ? nf.format(item.count) : "";
                  return countValue
                    ? `${percentValue}% \u2022 ${countValue} registros`
                    : `${percentValue}%`;
                }
                const percentValue =
                  item && Number.isFinite(item.percent) ? pf.format(item.percent) : pf.format(0);
                return `${nf.format(context.parsed.x)} registros \u2022 ${percentValue}%`;
              },
            },
          },
          pillLabels: { enabled: false },
          socialInlineLabels: {
            items: dataset.map((d) => ({
              label: d.fullName,
              value: d.valueLabel ?? d.displayValue,
              iconGlyph: d.iconGlyph,
              iconBg: d.color,
              iconColor: contrastColor(d.color),
              iconBaselineOffset: d.iconBaselineOffset,
              key: d.key,
            })),
            mode,
            labelColor: initialLabelColor,
            valueColor: initialLabelColor,
          },
        },
        animation: { duration: 360, easing: "easeOutCubic" },
      },
    });

    const updateSocialLayout = () => {
      const styles = getComputedStyle(document.documentElement);
      const labelTone = styles.getPropertyValue("--text").trim() || "#1f2933";
      const availableWidth =
        graphWrap.clientWidth || canvasEl.clientWidth || chart.width || 0;
      const compactThreshold = 720;
      const microThreshold = 580;
      const tinyThreshold = 500;
      const isCompactLayout = availableWidth <= compactThreshold;
      const isMicroLayout = availableWidth <= microThreshold;
      const isTinyLayout = availableWidth <= tinyThreshold;
      const baseLeftPadding = Math.round(
        Math.max(72, Math.min(availableWidth * 0.18, 186))
      );
      const leftPadding = isTinyLayout
        ? Math.max(54, Math.round(baseLeftPadding * 0.68))
        : isMicroLayout
        ? Math.max(62, Math.round(baseLeftPadding * 0.78))
        : isCompactLayout
        ? Math.max(70, Math.round(baseLeftPadding * 0.9))
        : baseLeftPadding;
      const rightPadding = isTinyLayout
        ? 14
        : isMicroLayout
        ? 18
        : isCompactLayout
        ? 24
        : 32;

      const rowHeight = isTinyLayout
        ? 42
        : isMicroLayout
        ? 48
        : isCompactLayout
        ? 52
        : 54;
      graphWrap.style.minHeight = `${Math.max(200, dataset.length * rowHeight)}px`;

      const baseIconRadius = 14;
      const compactIconRadius = 13;
      const microIconRadius = 12;
      const tinyIconRadius = 16;
      const activeIconRadius = isTinyLayout
        ? tinyIconRadius
        : isMicroLayout
        ? microIconRadius
        : isCompactLayout
        ? compactIconRadius
        : baseIconRadius;

      const baseIconOffset = 115;
      const compactIconOffset = 88;
      const microIconOffset = 76;
      const tinyIconOffset = 62;
      const iconOffset = isTinyLayout
        ? tinyIconOffset
        : isMicroLayout
        ? microIconOffset
        : isCompactLayout
        ? compactIconOffset
        : baseIconOffset;
      const paddingForIcons = iconOffset + activeIconRadius + (isTinyLayout ? 12 : 24);
      const normalizedLeftPadding = Math.max(leftPadding, paddingForIcons);

      chart.options.layout.padding.left = normalizedLeftPadding;
      chart.options.layout.padding.right = rightPadding;

      const baseValueOffset = 10;
      const compactValueOffset = 8;
      const microValueOffset = 6;
      const tinyValueOffset = 5;

      chart.options.plugins.socialInlineLabels = {
        ...chart.options.plugins.socialInlineLabels,
        labelColor: labelTone,
        valueColor: labelTone,
        iconRadius: baseIconRadius,
        iconRadiusCompact: compactIconRadius,
        iconRadiusMicro: microIconRadius,
        iconRadiusTiny: tinyIconRadius,
        iconOffset: baseIconOffset,
        iconOffsetCompact: compactIconOffset,
        iconOffsetMicro: microIconOffset,
        iconOffsetTiny: tinyIconOffset,
        labelOffset: 78,
        valueOffset: baseValueOffset,
        valueOffsetCompact: compactValueOffset,
        valueOffsetMicro: microValueOffset,
        valueOffsetTiny: tinyValueOffset,
        labelFont: "600 13px Inter, system-ui",
        compactLabelFont: "600 11px Inter, system-ui",
        microLabelFont: "600 10px Inter, system-ui",
        tinyLabelFont: "600 9px Inter, system-ui",
        valueFont: "600 13px Inter, system-ui",
        compactValueFont: "600 12px Inter, system-ui",
        microValueFont: "600 11px Inter, system-ui",
        tinyValueFont: "600 10px Inter, system-ui",
        compactThreshold,
        microThreshold,
        tinyThreshold,
        compactLabelGap: compactIconRadius + 10,
        microLabelGap: microIconRadius + 8,
        tinyLabelGap: tinyIconRadius + 6,
        hideTinyLabels: true,
        showValues: true,
      };
      chart.options.scales.x.grid.color =
        styles.getPropertyValue("--neutral-border").trim() ||
        styles.getPropertyValue("--border").trim() ||
        "#e5e5e5";
      chart.options.scales.x.ticks.color =
        styles.getPropertyValue("--muted").trim() || "#6b7280";
      chart.options.plugins.tooltip.backgroundColor = tooltipBg;
      chart.options.plugins.tooltip.titleColor = tooltipText;
      chart.options.plugins.tooltip.bodyColor = tooltipText;
    };

    const handleResize = () => {
      updateSocialLayout();
      chart.update("none");
    };

    canvasEl.__socialChartInstance = chart;
    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(graphWrap);
      canvasEl.__socialResizeObserver = resizeObserver;
    } else {
      canvasEl.__socialResizeHandler = handleResize;
      window.addEventListener("resize", handleResize);
    }

    chart.__applyTheme = () => {
      updateSocialLayout();
      chart.update("none");
    };

    charts.social = chart;
    chart.__applyTheme();
  }

  function formatDeltaLabel(delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) === Infinity) return "0%";
    if (Math.abs(delta) < 0.05) return "0%";
    const abs = Math.abs(delta);
    const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    const prefix = delta > 0 ? "+" : "-";
    return `${prefix}${abs.toFixed(decimals)}%`;
  }
  function setTrendChartColors(chart, color) {
    if (!chart) return;
    const gradient = chart.ctx.createLinearGradient(0, 0, 0, chart.height || 80);
    gradient.addColorStop(0, withAlpha(color, 0.32));
    gradient.addColorStop(1, withAlpha(color, 0));
    const ds = chart.data.datasets[0];
    ds.borderColor = color;
    ds.backgroundColor = gradient;
    ds.pointBackgroundColor = color;
    ds.pointBorderColor = color;
     ds.pointHoverBackgroundColor = color;
     ds.pointHoverBorderColor = "#fff";
  }
  function ensureTrendChart(chartKey, canvasId, fallbackColor) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (!charts[chartKey]) {
      const ctx = canvas.getContext("2d");
      const chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              data: [],
              borderWidth: 2,
              tension: 0.35,
              fill: true,
              pointRadius: 0,
              pointHoverRadius: 0,
              pointHitRadius: 16,
              pointBorderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "nearest",
            intersect: false,
            axis: "x",
          },
          layout: {
            padding: { top: 10, bottom: 8, left: 4, right: 4 },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              external: (context) => renderSparkTooltip(context, canvas),
            },
          },
          sparkline: true,
          scales: {
            x: { display: false, grid: { display: false } },
            y: { display: false, grid: { display: false } },
          },
          elements: {
            line: { capBezierPoints: true },
          },
        },
      });
      chart.__applyTheme = () => {
        const parent = canvas.closest(".trend-card");
        const tone =
          parent && getComputedStyle(parent).getPropertyValue("--trend-color").trim()
            ? getComputedStyle(parent).getPropertyValue("--trend-color").trim()
            : fallbackColor;
        setTrendChartColors(chart, tone);
        chart.update("none");
      };
      charts[chartKey] = chart;
    }
    const chartInstance = charts[chartKey];
    const parent = canvas.closest(".trend-card");
    const tone =
      parent && getComputedStyle(parent).getPropertyValue("--trend-color").trim()
        ? getComputedStyle(parent).getPropertyValue("--trend-color").trim()
        : fallbackColor;
    setTrendChartColors(chartInstance, tone);
    return chartInstance;
  }
    function updateTrendCard({
    cardId,
    valueId,
    deltaId,
    hintId,
    sparkId,
    chartKey,
    rows,
    previousRows,
    rangeInfo,
    previousRange,
    numberFormatter,
    valueLabel,
  }) {
    const formatter = numberFormatter || new Intl.NumberFormat("es-PE");
    const currentValue = rows.length;
    const previousValue = previousRows.length;
    const delta = percentDelta(currentValue, previousValue);
    const direction = trendDirection(delta);
    const valueEl = document.getElementById(valueId);
    if (valueEl) {
      valueEl.textContent = formatter.format(currentValue);
    }
    const deltaEl = document.getElementById(deltaId);
    if (deltaEl) {
      deltaEl.textContent = formatDeltaLabel(delta);
      deltaEl.dataset.trend = direction;
      deltaEl.title = previousRange
        ? `Período anterior (${formatRangeLabel(previousRange)}): ${formatter.format(previousValue)}`
        : "";
    }
    const hintEl = document.getElementById(hintId);
    if (hintEl) {
      hintEl.textContent = previousRange
        ? `vs ${formatRangeLabel(previousRange)}`
        : "sin período anterior";
    }
    const card = document.getElementById(cardId);
    const sparkColor =
      card && getComputedStyle(card).getPropertyValue("--trend-color").trim()
        ? getComputedStyle(card).getPropertyValue("--trend-color").trim()
        : "#2563eb";
    const series = buildSeriesForRange(rangeInfo, rows);
    const chart = ensureTrendChart(chartKey, sparkId, sparkColor);
    if (chart) {
      chart.data.labels = series.labels;
      chart.data.datasets[0].data = series.values;
      chart.data.datasets[0].label = valueLabel || "Valor";
      chart.options.plugins.tooltip = {
        enabled: false,
        external: (context) => renderSparkTooltip(context, chart.canvas),
      };
      setTrendChartColors(chart, sparkColor);
      chart.update("none");
    }
  }

  function updateChannelLeaderCard({ rangeInfo, salesRows, numberFormatter }) {
    const formatter = numberFormatter || new Intl.NumberFormat("es-PE");
    const card = document.getElementById("trendChannelCard");
    const nameEl = document.getElementById("trendChannelName");
    const valueEl = document.getElementById("trendChannelValue");
    const deltaEl = document.getElementById("trendChannelDelta");
    const hintEl = document.getElementById("trendChannelHint");
    const sparkId = "trendChannelSpark";
    const ranks = groupSalesByChannel(salesRows);
    if (!ranks.length || !rangeInfo) {
      if (nameEl) nameEl.textContent = "Sin datos";
      if (valueEl) valueEl.textContent = "0";
      if (deltaEl) {
        deltaEl.textContent = "Sin comparación";
        deltaEl.dataset.trend = "flat";
      }
      if (hintEl) hintEl.textContent = "No hay ventas registradas";
      const chart = charts.trendChannel;
      if (chart) {
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.update("none");
      }
      if (card) card.style.removeProperty("--trend-color");
      return;
    }
    const [leaderLabel, leaderCount] = ranks[0];
    const runner = ranks[1] || null;
    const leaderName = friendlyChannelLabel(leaderLabel);
    const runnerName = runner ? friendlyChannelLabel(runner[0]) : "";
    if (nameEl) nameEl.textContent = leaderName;
    if (valueEl) valueEl.textContent = formatter.format(leaderCount);
    if (card) {
      const color = C.canalColor(leaderLabel);
      card.style.setProperty("--trend-color", color);
    }
    if (deltaEl) {
      if (runner) {
        const diff = leaderCount - runner[1];
        const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
        deltaEl.dataset.trend = direction;
        const symbol = diff > 0 ? "+" : diff < 0 ? "-" : "=";
        const diffText = formatter.format(Math.abs(diff));
        deltaEl.textContent = `${symbol}${diffText} vs ${runnerName}`;
      } else {
        deltaEl.dataset.trend = "up";
        deltaEl.textContent = "Único canal con ventas";
      }
    }
    if (hintEl) {
      hintEl.textContent = runner
        ? `Segundo lugar: ${runnerName} (${formatter.format(runner[1])})`
        : "Sin otros canales con ventas";
    }
    const topRows = salesRows.filter((row) => channelLabel(row) === leaderLabel);
    const series = buildSeriesForRange(rangeInfo, topRows);
    const chart = ensureTrendChart("trendChannel", sparkId, C.canalColor(leaderLabel));
    if (chart) {
      chart.data.labels = series.labels;
      chart.data.datasets[0].data = series.values;
      chart.data.datasets[0].label = leaderName;
      chart.options.plugins.tooltip = {
        enabled: false,
        external: (context) => renderSparkTooltip(context, chart.canvas),
      };
      setTrendChartColors(chart, C.canalColor(leaderLabel));
      chart.update("none");
    }
  }
function renderTrendCards() {
    const rangeInfo = activeRangeInfo();
    if (!rangeInfo) return;
    const prevInfo = previousRangeInfo(rangeInfo);
    const nf = new Intl.NumberFormat("es-PE");
    const currentRows = rowsWithinRange(rangeInfo);
    const prevRows = rowsWithinRange(prevInfo);
    updateTrendCard({
      cardId: "trendTotalCard",
      valueId: "trendTotalValue",
      deltaId: "trendTotalDelta",
      hintId: "trendTotalHint",
      sparkId: "trendTotalSpark",
      chartKey: "trendTotal",
      rows: currentRows,
      previousRows: prevRows,
      rangeInfo,
      previousRange: prevInfo,
      numberFormatter: nf,
      valueLabel: "Registros",
    });
    const currentSales = currentRows.filter(isVentaRow);
    const previousSales = prevRows.filter(isVentaRow);
    updateTrendCard({
      cardId: "trendSalesCard",
      valueId: "trendSalesValue",
      deltaId: "trendSalesDelta",
      hintId: "trendSalesHint",
      sparkId: "trendSalesSpark",
      chartKey: "trendSales",
      rows: currentSales,
      previousRows: previousSales,
      rangeInfo,
      previousRange: prevInfo,
      numberFormatter: nf,
      valueLabel: "Ventas",
    });
    updateChannelLeaderCard({
      rangeInfo,
      salesRows: currentSales,
      numberFormatter: nf,
    });
  }

  function renderDonut(which) {
    const def = getComputedStyle(document.documentElement)
      .getPropertyValue("--def")
      .trim();
    const pal = [
      "--c1",
      "--c2",
      "--c3",
      "--c4",
      "--c5",
      "--c6",
      "--c7",
      "--c8",
    ].map((v) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim()
    );

    // Si hay un rango global aplicado, usar s\u00F3lo las filas dentro del rango
    const rows = rowsForGroupFilters();

    if (which === "canal") {
      const st = groupStats(rows, "Canal");
      const colors = st.labels.map((l) =>
        l === "(Sin dato)" ? def : C.canalColor(l)
      );
      makeDonutMetric({
        canvasId: "chartCanal",
        legendId: "legendCanal",
        handle: "canal",
        stats: st,
        colors,
        mode: metricModes.canal,
      });
    } else if (which === "campana") {
      const st = groupStats(rows, "Campa\u00F1a");
      const colors = st.labels.map((l, i) =>
        l === "(Sin dato)" ? def : pal[i % pal.length]
      );
      makeDonutMetric({
        canvasId: "chartCampana",
        legendId: "legendCampana",
        handle: "campana",
        stats: st,
        colors,
        mode: metricModes.campana,
      });
    } else if (which === "interes") {
      const st = groupStats(rows, "Interes");
      const colors = st.labels.map((l) =>
        l === "(Sin dato)" ? def : C.interesColorFor(l)
      );
      makeDonutMetric({
        canvasId: "chartInteres",
        legendId: "legendInteres",
        handle: "interes",
        stats: st,
        colors,
        mode: metricModes.interes,
      });
    } else if (which === "estado") {
      const st = groupStats(rows, "Estado");
      const colors = st.labels.map((l) =>
        l === "(Sin dato)" ? def : C.colorEstado(l)
      );
      makeDonutMetric({
        canvasId: "chartEstado",
        legendId: "legendEstado",
        handle: "estado",
        stats: st,
        colors,
        mode: metricModes.estado,
      });
    } else if (which === "registrado") {
      const st = groupStats(rows, "Registrado");
      const colors = st.labels.map((l) =>
        l === "(Sin dato)" ? def : C.colorRegistrado(l)
      );
      makeDonutMetric({
        canvasId: "chartRegistrado",
        legendId: "legendRegistrado",
        handle: "registrado",
        stats: st,
        colors,
        mode: metricModes.registrado,
      });
    } else if (which === "registro") {
      const st = groupStats(rows, "Registro");
      const colors = st.labels.map((l, i) =>
        l === "(Sin dato)" ? def : pal[i % pal.length]
      );
      makeDonutMetric({
        canvasId: "chartRegistro",
        legendId: "legendRegistro",
        handle: "registro",
        stats: st,
        colors,
        mode: metricModes.registro,
      });
    }
  }
  function renderAllDonuts() {
    renderDonut("canal");
    renderDonut("campana");
    renderDonut("interes");
    renderDonut("estado");
    renderDonut("registrado");
    renderDonut("registro");
    renderSocialChannels();
    renderTrendCards();
    applyThemeToCharts();
  }

  // ======== HISTORIAL ========
  function updateRangePill() {
    const pill = document.getElementById("rangePill");
    if (!pill) return;
    if (!histRange) {
      pill.textContent = "(sin rango)";
      pill.title = "";
      return;
    }
    const fromD = new Date(histRange.from + "T00:00:00");
    const toD = new Date(histRange.to + "T00:00:00");
    const compact = window.matchMedia("(max-width:700px)").matches;
    pill.textContent = compact
      ? `${C.prettyDayShort(fromD)} \u2013 ${C.prettyDayShort(
          toD
        )} ${toD.getFullYear()}`
      : `${C.prettyDay(fromD)} \u2013 ${C.prettyDay(toD)}`;
    pill.title = pill.textContent;
  }

  function renderHistoryStacked() {
    updateHistLabelsToggleButton();
    if (
      !histRange &&
      window.__metricsGroupRange &&
      window.__metricsGroupRange.from &&
      window.__metricsGroupRange.to
    ) {
      histRange = {
        from: window.__metricsGroupRange.from,
        to: window.__metricsGroupRange.to,
      };
    }
    if (!histRange) {
      const tMin = Math.min(
        ...allRows.map((r) => r._dateOnly).filter((v) => !Number.isNaN(v))
      );
      const tMax = Math.max(
        ...allRows.map((r) => r._dateOnly).filter((v) => !Number.isNaN(v))
      );
      if (Number.isFinite(tMin) && Number.isFinite(tMax)) {
        histRange = {
          from: C.isoDay(new Date(tMin)),
          to: C.isoDay(new Date(tMax)),
        };
      } else {
        histRange = last7DaysRange();
      }
    }
    updateRangePill();

    if (charts.hist) {
      charts.hist.destroy();
      charts.hist = null;
    }
    const tsFrom = new Date(histRange.from + "T00:00:00").getTime();
    const tsTo = new Date(histRange.to + "T00:00:00").getTime();
    const inRange = allRows.filter((r) => {
      const t = r._dateOnly;
      if (Number.isNaN(t)) return false;
      return t >= tsFrom && t <= tsTo;
    });

    const map = new Map(),
      setCanales = new Set();
    inRange.forEach((r) => {
      const d = new Date(r._dateOnly),
        key = C.isoDay(d);
      const canal =
        (r["Canal"] || "(Sin dato)").toString().trim() || "(Sin dato)";
      setCanales.add(canal);
      if (!map.has(key)) map.set(key, {});
      map.get(key)[canal] = (map.get(key)[canal] || 0) + 1;
    });

    const labels = [];
    for (
      let d = new Date(tsFrom);
      d.getTime() <= tsTo;
      d.setDate(d.getDate() + 1)
    ) {
      const k = C.isoDay(d);
      labels.push(k);
      if (!map.has(k)) map.set(k, {});
    }
    const canales = [...setCanales];

    const dayTotalsCount = labels.map((day) =>
      Object.values(map.get(day)).reduce((a, b) => a + b, 0)
    );
    const rangeTotal = dayTotalsCount.reduce((a, b) => a + b, 0) || 1;

    let datasets, yMax;
    const roundedTop = 6;
    const resolveRoundedCorners = (ctx) => {
      const value = ctx?.parsed?.y ?? ctx?.raw;
      if (!value || value <= 0) {
        return { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
      }
      const { chart, datasetIndex, dataIndex } = ctx;
      const meta = chart.getDatasetMeta(datasetIndex);
      const stackKey =
        meta?.stack ?? chart.data.datasets[datasetIndex]?.stack ?? "__stack";
      for (let i = datasetIndex + 1; i < chart.data.datasets.length; i += 1) {
        const ds = chart.data.datasets[i];
        const metaAbove = chart.getDatasetMeta(i);
        const metaStack =
          metaAbove?.stack ?? ds?.stack ?? "__stack";
        if (metaStack !== stackKey) continue;
        if (!chart.isDatasetVisible(i)) continue;
        const valAbove = Number(ds?.data?.[dataIndex]) || 0;
        if (valAbove && valAbove > 0) {
          return { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
        }
      }
      return {
        topLeft: roundedTop,
        topRight: roundedTop,
        bottomLeft: 0,
        bottomRight: 0,
      };
    };

    if (histMode === "percent") {
      datasets = canales.map((c) => ({
        label: c,
        data: labels.map((day) => ((map.get(day)[c] || 0) / rangeTotal) * 100),
        backgroundColor: C.canalColor(c),
        borderWidth: 0,
        stack: "s1",
        borderSkipped: false,
        borderRadius: resolveRoundedCorners,
      }));
      const dayPercents = labels.map(
        (_, i) => (dayTotalsCount[i] / rangeTotal) * 100
      );
      yMax = Math.max(...dayPercents, 0) + 5;
    } else {
      datasets = canales.map((c) => ({
        label: c,
        data: labels.map((day) => map.get(day)[c] || 0),
        backgroundColor: C.canalColor(c),
        borderWidth: 0,
        stack: "s1",
        borderSkipped: false,
        borderRadius: resolveRoundedCorners,
      }));
      yMax = Math.max(...dayTotalsCount, 0) + 5;
    }

    const ctx = document.getElementById("chartHist").getContext("2d");
    charts.hist = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: "index", intersect: false },
          pillLabels: {
            enabled: !!histShowLabels,
            mode: histMode === "percent" ? "percent" : "count",
          },
          topStackLabel: {
            enabled: true,
            mode: histMode === "percent" ? "percent" : "count",
          },
        },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true } },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { precision: 0 },
            max: yMax,
          },
        },
        animation: { duration: 250, easing: "easeOutQuad" },
      },
    });

    const lg = document.getElementById("legendHist");
    lg.innerHTML = "";
    const totalsByCanal = new Map();
    canales.forEach((c) => totalsByCanal.set(c, 0));
    labels.forEach((day) => {
      const obj = map.get(day);
      canales.forEach((c) =>
        totalsByCanal.set(c, totalsByCanal.get(c) + (obj[c] || 0))
      );
    });
    const sorted = [...totalsByCanal.entries()]
      .map(([label, total]) => ({
        label,
        total,
        perc: rangeTotal ? Math.round((total / rangeTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => {
        if (a.label === "(Sin dato)" && b.label !== "(Sin dato)") return 1;
        if (b.label === "(Sin dato)" && a.label !== "(Sin dato)") return -1;
        return b.total - a.total;
      });
    sorted.forEach((s) => {
      const it = document.createElement("div");
      it.className = "item";
      const sw = document.createElement("span");
      sw.className = "sw";
      sw.style.background = C.canalColor(s.label);
      const lbl = document.createElement("span");
      lbl.textContent = friendlyChannelLabel(s.label);
      const val = document.createElement("span");
      val.className = "val";
      val.textContent = histMode === "percent" ? `${s.perc}%` : `${s.total}`;
      it.appendChild(sw);
      it.appendChild(lbl);
      it.appendChild(val);
      lg.appendChild(it);
    });
    const totalChip = document.createElement("div");
    totalChip.className = "item total";
    totalChip.textContent = `Total: ${rangeTotal}`;
    lg.appendChild(totalChip);
  }

  // ======== RANGO POPUP HISTORIAL ========
  function setupRangePicker() {
    const pop = document.getElementById("rangePop"),
      cancel = document.getElementById("rpCancel"),
      apply = document.getElementById("rpApply"),
      prev = document.getElementById("rpPrev"),
      next = document.getElementById("rpNext"),
      sideBtns = [...document.querySelectorAll("#rangePop .rp-side button")],
      calHead = document.getElementById("calHead"),
      calGrid = document.getElementById("calGrid"),
      title = document.getElementById("rpTitle"),
      fromI = document.getElementById("rpFrom"),
      toI = document.getElementById("rpTo");

    if (
      !pop ||
      !cancel ||
      !apply ||
      !prev ||
      !next ||
      !calHead ||
      !calGrid ||
      !title ||
      !fromI ||
      !toI
    ) {
      return;
    }

    let view = new Date();
    view.setDate(1);
    let tmpStart = null,
      tmpEnd = null;

    function setApplyEnabled() {
      const ok = !!(tmpStart && tmpEnd);
      apply.classList.toggle("apply-disabled", !ok);
      apply.disabled = !ok;
    }
    function markPresetActive(id) {
      sideBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.preset === id)
      );
    }

    function draw() {
      calHead.innerHTML = "";
      "lun mar mie jue vie s\u00E1b dom".split(" ").forEach((d) => {
        const el = document.createElement("div");
        el.className = "dow";
        el.textContent = d;
        calHead.appendChild(el);
      });
      title.textContent = new Intl.DateTimeFormat("es-PE", {
        month: "long",
        year: "numeric",
      }).format(view);
      calGrid.innerHTML = "";
      const firstDow = (view.getDay() + 6) % 7,
        daysInMonth = new Date(
          view.getFullYear(),
          view.getMonth() + 1,
          0
        ).getDate();
      const prevDays = firstDow;
      const prevDate = new Date(view);
      prevDate.setMonth(view.getMonth() - 1);
      const prevCount = new Date(
        prevDate.getFullYear(),
        prevDate.getMonth() + 1,
        0
      ).getDate();
      function mkCell(day, off, dateObj) {
        const el = document.createElement("div");
        el.className = "cell" + (off ? " off" : "");
        el.textContent = String(day).padStart(2, "0");
        const key = C.isoDay(dateObj);
        const inSel =
          tmpStart &&
          tmpEnd &&
          new Date(key) >= new Date(tmpStart) &&
          new Date(key) <= new Date(tmpEnd);
        const isSel = tmpStart === key || tmpEnd === key;
        if (inSel) el.classList.add("in");
        if (isSel) el.classList.add("sel");
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          markPresetActive(null);
          if (!tmpStart || (tmpStart && tmpEnd)) {
            tmpStart = key;
            tmpEnd = null;
          } else {
            if (new Date(key) < new Date(tmpStart)) {
              tmpEnd = tmpStart;
              tmpStart = key;
            } else {
              tmpEnd = key;
            }
          }
          fromI.value = tmpStart || "";
          toI.value = tmpEnd || "";
          setApplyEnabled();
          draw();
        });
        calGrid.appendChild(el);
      }
      for (let i = prevDays; i > 0; i--) {
        const d = prevCount - i + 1;
        mkCell(d, true, new Date(view.getFullYear(), view.getMonth() - 1, d));
      }
      for (let d = 1; d <= daysInMonth; d++) {
        mkCell(d, false, new Date(view.getFullYear(), view.getMonth(), d));
      }
      const totalCells = prevDays + daysInMonth;
      const nextCells = 42 - totalCells;
      for (let d = 1; d <= nextCells; d++) {
        mkCell(d, true, new Date(view.getFullYear(), view.getMonth() + 1, d));
      }
      fromI.value = tmpStart || "";
      toI.value = tmpEnd || "";
      setApplyEnabled();
    }

    sideBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        markPresetActive(btn.dataset.preset);
        const now = new Date();
        let from, to;
        const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        switch (btn.dataset.preset) {
          case "today":
            from = to = day(now);
            break;
          case "yesterday": {
            const y = new Date(now);
            y.setDate(now.getDate() - 1);
            from = to = day(y);
            break;
          }
          case "thisweek": {
            const w = new Date(now);
            const dow = (w.getDay() + 6) % 7;
            w.setDate(w.getDate() - dow);
            from = day(w);
            to = day(now);
            break;
          }
          case "lastweek": {
            const w = new Date(now);
            const dow = (w.getDay() + 6) % 7;
            w.setDate(w.getDate() - dow - 7);
            from = day(w);
            const e = new Date(w);
            e.setDate(w.getDate() + 6);
            to = day(e);
            break;
          }
          case "thismonth": {
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = day(now);
            break;
          }
          case "lastmonth": {
            const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const e = new Date(now.getFullYear(), now.getMonth(), 0);
            from = s;
            to = e;
            break;
          }
        }
        tmpStart = C.isoDay(from);
        tmpEnd = C.isoDay(to);
        view = new Date(tmpStart + "T00:00:00");
        view.setDate(1);
        draw();
      });
    });

    // Helper: posiciona un popup respecto a un bot\u00F3n/anchor
    function positionPopup(popEl, anchorEl) {
      if (!popEl || !anchorEl) return;
      popEl.style.position = "absolute";
      popEl.style.visibility = "hidden";
      popEl.classList.add("open");
      // forzar layout para medir
      const popRect = popEl.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const parent = popEl.offsetParent;
      const parentRect = parent
        ? parent.getBoundingClientRect()
        : { left: 0, top: 0 };
      let left = anchorRect.left - parentRect.left;
      let top = anchorRect.bottom - parentRect.top + 8;
      const maxLeft =
        (parent ? parent.clientWidth : window.innerWidth || document.documentElement.clientWidth) -
        popRect.width -
        8;
      if (left > maxLeft) left = Math.max(8, maxLeft);
      if (left < 8) left = 8;
      if (top < 8) top = 8;
      popEl.style.left = `${left}px`;
      popEl.style.top = `${top}px`;
      popEl.style.visibility = "visible";
    }

    function open() {
      tmpStart = (histRange && histRange.from) || null;
      tmpEnd = (histRange && histRange.to) || null;
      if (!tmpStart || !tmpEnd) {
        const r = last7DaysRange();
        tmpStart = r.from;
        tmpEnd = r.to;
      }
      view = new Date(tmpStart + "T00:00:00");
      view.setDate(1);
      draw();
      pop.hidden = false;
      pop.setAttribute("aria-hidden", "false");
      // posicionar cerca del bot\u00F3n de historial (rangeOpen)
      const anchor = document.getElementById("rangeOpen") || document.getElementById("groupRangeOpen");
      positionPopup(pop, anchor);
    }

    function close() {
      pop.classList.remove("open");
      pop.hidden = true;
      pop.setAttribute("aria-hidden", "true");
      // si el picker se cerr\u00F3, limpiar intenci\u00F3n de uso por grupo
      try { window.__openRangeFor = null; } catch (e) {}
      // limpiar estilos inline usados para posicionamiento
      pop.style.left = "";
      pop.style.top = "";
      pop.style.position = "";
      pop.style.visibility = "";
    }

    window.openRangePicker = open;

    cancel.addEventListener("click", close);
    // Al aplicar, si el picker fue abierto para el grupo (global donuts) -> emitir evento para donuts.
    apply.addEventListener("click", () => {
      if (!(tmpStart && tmpEnd)) return;
      if (window.__openRangeFor === "group") {
        // emitir rango para los donuts (mantener formato Date o ISO)
        const from = tmpStart;
        const to = tmpEnd;
        document.dispatchEvent(
          new CustomEvent("metrics:groupRange", {
            detail: { from: new Date(from + "T00:00:00"), to: new Date(to + "T00:00:00") },
          })
        );
        // cerrar y limpiar bandera
        window.__openRangeFor = null;
        close();
        return;
      }
      // comportamiento por defecto: historial
      histRange = { from: tmpStart, to: tmpEnd };
      renderHistoryStacked();
      close();
    });
    prev.addEventListener("click", () => {
       view.setMonth(view.getMonth() - 1);
       draw();
     });
     next.addEventListener("click", () => {
       view.setMonth(view.getMonth() + 1);
       draw();
     });

    document.addEventListener("click", (e) => {
      const b2 = document.getElementById("rangeOpen");
      if (!pop.contains(e.target) && e.target !== b2 && (!b2 || !b2.contains(e.target))) {
        close();
      }
    });
    const pill = document.getElementById("rangePill");
    if (pill) {
      pill.textContent = "";
      pill.title = "";
    }
  }

  // ======== Carga de datos ========
  async function loadData() {
    try {
      const rows = await C.fetchCSV(C.CSV_URL);
      const { data, columns } = mapColumns(rows);
      allRows = data.map((r, idx) => {
        const hora =
          r[columns["Hora de registro"]] ??
          r[columns["HORA DE REGISTRO"]] ??
          "";
        const ts = C.parseSheetDate(hora);
        return {
          _idx: idx,
          _ts: ts,
          _dateOnly: C.dateOnlyTs(ts),
          "Hora de registro": hora,
          Nombres: r[columns["Nombres"]] ?? "",
          Celular: r[columns["Celular"]] ?? "",
          DNI: r[columns["DNI"]] ?? "",
          Canal: r[columns["Canal"]] ?? "",
          Campa\u00F1a: r[columns["Campa\u00F1a"]] ?? "",
          Interes: r[columns["Interes"]] ?? r[columns["Inter\u00E9s"]] ?? "",
          Registro: r[columns["Registro"]] ?? r[columns["REGISTRO"]] ?? "",
          Estado: r[columns["Estado"]] ?? r[columns["ESTADO"]] ?? "",
          Registrado:
            r[columns["Registrado"]] ?? r[columns["REGISTRADO"]] ?? "",
        };
      });
      setLastUpdate();
    } catch (e) {
      console.error(e);
      alert("No se pudieron cargar los datos del Google Sheets.");
    }
  }

  async function autoRefreshMetrics() {
    if (autoRefreshRunning || window.__metricsRefreshing) return;
    autoRefreshRunning = true;
    try {
      await loadData();
      renderAllDonuts();
      renderHistoryStacked();
    } catch (err) {
      console.warn("Auto refresh metrics fall\u00F3:", err);
    } finally {
      autoRefreshRunning = false;
    }
  }

  function scheduleAutoRefresh() {
    if (autoRefreshTimer) return;
    autoRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      autoRefreshMetrics();
    }, 60_000);
  }

  // ======== init ========
  document.addEventListener("DOMContentLoaded", () => {
    C.initThemeAndMenu();

    // helper seguro para a\u00F1adir listeners s\u00F3lo si el elemento existe
    const on = (id, ev, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(ev, fn);
    };
    const toggleClass = (id, cls, set) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle(cls, !!set);
    };

    // Bind de segment toggles (s\u00F3lo si existen en el DOM)
    on("canalCount", "click", () => {
      setMetricMode("canal", "count");
      renderDonut("canal");
    });
    on("canalPercent", "click", () => {
      setMetricMode("canal", "percent");
      renderDonut("canal");
    });
    on("campCount", "click", () => {
      setMetricMode("camp", "count");
      renderDonut("campana");
    });
    on("campPercent", "click", () => {
      setMetricMode("camp", "percent");
      renderDonut("campana");
    });
    on("intCount", "click", () => {
      setMetricMode("int", "count");
      renderDonut("interes");
    });
    on("intPercent", "click", () => {
      setMetricMode("int", "percent");
      renderDonut("interes");
    });
    on("estCount", "click", () => {
      setMetricMode("est", "count");
      renderDonut("estado");
    });
    on("estPercent", "click", () => {
      setMetricMode("est", "percent");
      renderDonut("estado");
    });
    on("regCount", "click", () => {
      setMetricMode("reg", "count");
      renderDonut("registrado");
    });
    on("regPercent", "click", () => {
      setMetricMode("reg", "percent");
      renderDonut("registrado");
    });
    const histToggleHandler = () => {
      histShowLabels = !histShowLabels;
      updateHistLabelsToggleButton();
      renderHistoryStacked();
    };
    on("toggleHistLabels", "click", histToggleHandler);
    const toggleEl = document.getElementById("toggleHistLabels");
    if (toggleEl) {
      toggleEl.addEventListener("keydown", (ev) => {
        if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          histToggleHandler();
        }
      });
    }

    // Historial toggles + rango (seguro)
    on("modeCount", "click", () => {
      histMode = "count";
      toggleClass("modeCount", "active", true);
      toggleClass("modePercent", "active", false);
      renderHistoryStacked();
    });
    on("modePercent", "click", () => {
      histMode = "percent";
      toggleClass("modePercent", "active", true);
      toggleClass("modeCount", "active", false);
      renderHistoryStacked();
    });
    on("rangeOpen", "click", (e) => {
      e.stopPropagation();
      if (typeof window.openRangePicker === "function") window.openRangePicker();
    });
    on("hClear", "click", () => {
      histRange = last7DaysRange();
      renderHistoryStacked();
    });

    // Si existe el bot\u00F3n global de rango, abrir el picker independiente en modo group
    on("groupRangeOpen", "click", (e) => {
      e && e.stopPropagation && e.stopPropagation();
      try {
        if (typeof window.openGroupRangePicker === "function") {
          window.openGroupRangePicker();
        } else if (typeof window.openRangePicker === "function") {
          // fallback: abrir picker del historial si no est\u00E1 el de grupo
          window.__openRangeFor = "group";
          window.openRangePicker();
        }
      } catch (err) {
        console.warn("groupRangeOpen fallback", err);
      }
    });

    // ...m\u00E1s abajo en init, despu\u00E9s de setupRangePicker()
    try {
      setupRangePicker();
    } catch (err) {
      console.warn("setupRangePicker skipped (missing DOM nodes?)", err);
    }
    try {
      setupGroupRangePicker();
    } catch (err) {
      console.warn("setupGroupRangePicker skipped (missing DOM nodes?)", err);
    }

    // carga inicial de datos + render (async)
    (async () => {
      try {
        await loadData();
        renderAllDonuts();
        histRange = last7DaysRange();
        renderHistoryStacked();
      } catch (err) {
        console.error("Error en carga inicial de m\u00E9tricas:", err);
      } finally {
        scheduleAutoRefresh();
      }
    })();
  });

  // C\u00F3digo a\u00F1adido: controles globales para los donuts (cantidad/porcentaje/rango/actualizar/limpiar)
  // Versi\u00F3n segura: solo conecta con elementos ya presentes en metrics.html
  document.addEventListener("DOMContentLoaded", function () {
    try {
      const metricsGrid = document.getElementById("metricsGrid");
      if (!metricsGrid) return;

      // Helpers fecha
      function fmtDateISO(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
      }
      function daysAgo(n) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - n);
        return d;
      }
      function defaultRangeLast7() {
        const to = new Date();
        to.setHours(0, 0, 0, 0);
        const from = daysAgo(6);
        return { from, to };
      }
      // Formatea el pill del grupo igual que el Historial (ej: "9 oct. 2025 \u2013 15 oct. 2025")
      function formatGroupPill(fromDate, toDate) {
        try {
          const fromD = fromDate instanceof Date ? fromDate : new Date(fromDate + "T00:00:00");
          const toD = toDate instanceof Date ? toDate : new Date(toDate + "T00:00:00");
          // Usar el mismo formateo que el Historial (C.prettyDay)
          return `${C.prettyDay(fromD)} \u2013 ${C.prettyDay(toD)}`;
        } catch (e) {
          // fallback compacto dd/mm \u2014 dd/mm
          const f = `${String(new Date(fromDate).getDate()).padStart(2, "0")}/${String(new Date(fromDate).getMonth() + 1).padStart(2, "0")}`;
          const t = `${String(new Date(toDate).getDate()).padStart(2, "0")}/${String(new Date(toDate).getMonth() + 1).padStart(2, "0")}`;
          return `${f} \u2014 ${t}`;
        }
      }

      // Referencias a controles existentes (no crear/duplicar)
      const btnGroupCount = document.getElementById("groupCount");
      const btnGroupPercent = document.getElementById("groupPercent");
      const btnGroupRangeOpen = document.getElementById("groupRangeOpen");
      const btnGroupRefresh = document.getElementById("groupRefresh");
      const btnGroupClear = document.getElementById("groupClear");
      const groupRangePill = document.getElementById("groupRangePill");

      const groupRangePop = document.getElementById("rangePopGroup");
      const rpFrom = groupRangePop && groupRangePop.querySelector("#rpFromGroup");
      const rpTo = groupRangePop && groupRangePop.querySelector("#rpToGroup");
      const rpApply = groupRangePop && groupRangePop.querySelector("#rpApplyGroup");
      const rpCancel = groupRangePop && groupRangePop.querySelector("#rpCancelGroup");

      // Modo: emitir eventos en vez de asumir botones por tarjeta (m\u00E1s seguro)
      function setGroupModeToCount() {
        try {
          btnGroupCount && btnGroupCount.classList.add("active");
          btnGroupPercent && btnGroupPercent.classList.remove("active");
          document.dispatchEvent(
            new CustomEvent("metrics:groupMode", { detail: { mode: "count" } })
          );
        } catch (e) {
          console.warn("setGroupModeToCount error", e);
        }
      }
      function setGroupModeToPercent() {
        try {
          btnGroupPercent && btnGroupPercent.classList.add("active");
          btnGroupCount && btnGroupCount.classList.remove("active");
          document.dispatchEvent(
            new CustomEvent("metrics:groupMode", { detail: { mode: "percent" } })
          );
        } catch (e) {
          console.warn("setGroupModeToPercent error", e);
        }
      }

      // Listeners simples y defensivos
      if (btnGroupCount) {
        btnGroupCount.addEventListener("click", function () {
          setGroupModeToCount();
        });
      }
      if (btnGroupPercent) {
        btnGroupPercent.addEventListener("click", function () {
          setGroupModeToPercent();
        });
      }

      // Rango: abrir modal existente y emitir evento con rango seleccionado
      if (btnGroupRangeOpen && groupRangePop && rpFrom && rpTo && rpApply && rpCancel) {
        const openGroupRangeModal = () => {
          try {
            const currentRange = window.__metricsGroupRange;
            const def = defaultRangeLast7();
            const fromDate = currentRange?.from
              ? new Date(`${currentRange.from}T00:00:00`)
              : def.from;
            const toDate = currentRange?.to
              ? new Date(`${currentRange.to}T00:00:00`)
              : def.to;
            rpFrom.value = fmtDateISO(fromDate);
            rpTo.value = fmtDateISO(toDate);
            rpApply.disabled = !(rpFrom.value && rpTo.value);
            rpApply.classList.toggle("apply-disabled", rpApply.disabled);
            groupRangePop.hidden = false;
            groupRangePop.setAttribute("aria-hidden", "false");
            btnGroupRangeOpen.setAttribute("aria-expanded", "true");
          } catch (err) {
            console.warn("openGroupRangeModal failed", err);
          }
        };

        const closeGroupRangeModal = () => {
          groupRangePop.hidden = true;
          groupRangePop.setAttribute("aria-hidden", "true");
          btnGroupRangeOpen.setAttribute("aria-expanded", "false");
        };

        btnGroupRangeOpen.addEventListener("click", function (ev) {
          if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
          }
          const isVisible =
            !groupRangePop.hidden && groupRangePop.getAttribute("aria-hidden") !== "true";
          if (isVisible) {
            closeGroupRangeModal();
          } else {
            openGroupRangeModal();
          }
        });

        rpCancel.addEventListener("click", function () {
          closeGroupRangeModal();
        });

        document.addEventListener("keydown", function handleEscClose(ev) {
          if (ev.key === "Escape" && !groupRangePop.hidden) {
            closeGroupRangeModal();
          }
        });

        rpApply.addEventListener("click", function () {
          try {
            const fromVal = rpFrom.value;
            const toVal = rpTo.value;
            if (!fromVal || !toVal) return;
            const from = new Date(fromVal + "T00:00:00");
            const to = new Date(toVal + "T00:00:00");
            groupRangePill && (groupRangePill.textContent = formatGroupPill(from, to));
            document.dispatchEvent(
              new CustomEvent("metrics:groupRange", { detail: { from: from, to: to } })
            );
            closeGroupRangeModal();
          } catch (e) {
            console.warn("rpApply error", e);
          }
        });

        // habilitar aplicar si hay valores
        [rpFrom, rpTo].forEach((inp) =>
          inp.addEventListener("input", function () {
            try {
              if (rpFrom.value && rpTo.value) {
                rpApply.disabled = false;
                rpApply.classList.remove("apply-disabled");
              } else {
                rpApply.disabled = true;
                rpApply.classList.add("apply-disabled");
              }
            } catch (e) {}
          })
        );
      }

      // Actualizar datos: intentar funciones conocidas, si no emitir evento para fallback
      if (btnGroupRefresh) {
        // Usar onclick (sobrescribe listeners previos) y delegar a performGroupRefresh
        btnGroupRefresh.onclick = function (ev) {
          ev && ev.preventDefault && ev.preventDefault();
          try {
            // Preferir la funci\u00F3n robusta que previene dobles ejecuciones
            if (typeof window.performGroupRefresh === "function") {
              window.performGroupRefresh();
              return;
            }
            // Fallback a funciones conocidas si performGroupRefresh no existe
            if (typeof window.updateSheet === "function") {
              window.updateSheet();
            } else if (typeof window.refreshSheet === "function") {
              window.refreshSheet();
            } else if (typeof window.refreshData === "function") {
              window.refreshData();
            } else {
              document.dispatchEvent(new CustomEvent("metrics:refreshData"));
            }
          } catch (e) {
            console.warn("groupRefresh fallback error", e);
          }
        };
      }

      // Limpiar filtros: modo por defecto + rango \u00FAltimos 7 d\u00EDas
      if (btnGroupClear) {
        btnGroupClear.addEventListener("click", function () {
          try {
            setGroupModeToCount();
            const d = defaultRangeLast7();
            groupRangePill && (groupRangePill.textContent = formatGroupPill(d.from, d.to));
            document.dispatchEvent(
              new CustomEvent("metrics:groupClear", {
                detail: { from: d.from, to: d.to, mode: "count" },
              })
            );
            // tambi\u00E9n emitir rango por defecto para que los charts se sincronicen
            document.dispatchEvent(
              new CustomEvent("metrics:groupRange", { detail: { from: d.from, to: d.to } })
            );
          } catch (e) {
            console.warn("groupClear error", e);
          }
        });
      }

      // Inicializar por defecto (no rompe si alg\u00FAn elemento falta)
      (function initDefaults() {
        try {
          setGroupModeToCount();
          const d = defaultRangeLast7();
          groupRangePill && (groupRangePill.textContent = formatGroupPill(d.from, d.to));
          document.dispatchEvent(
            new CustomEvent("metrics:groupRange", { detail: { from: d.from, to: d.to } })
          );
        } catch (e) {
          console.warn("initDefaults error", e);
        }
      })();
    } catch (err) {
      console.error("Error inicializando controles globales de m\u00E9tricas:", err);
    }
  });

  // Manejo de controles globales (escucha los eventos emitidos por la UI global)
  // usa window.__metricsGroupRange para mantener el rango aplicado a los donuts
  (function attachGroupHandlers() {
    // modo global: count / percent
    document.addEventListener("metrics:groupMode", (ev) => {
      try {
        const mode = ev?.detail?.mode;
        if (!mode) return;
        ["canal", "campana", "interes", "estado", "registrado", "registro", "social"].forEach(
          (key) => {
            metricModes[key] = mode;
          }
        );
        histMode = mode === "percent" ? "percent" : "count";
        segActive();
        renderAllDonuts();
        renderHistoryStacked();
      } catch (e) {
        console.warn("metrics:groupMode handler failed", e);
      }
    });

    // rango global: espera { from: Date|string, to: Date|string }
    document.addEventListener("metrics:groupRange", (ev) => {
      try {
        const d = ev?.detail;
        if (!d || !d.from || !d.to) return;
        const fromStr =
          d.from instanceof Date ? C.isoDay(d.from) : C.isoDay(new Date(d.from));
        const toStr =
          d.to instanceof Date ? C.isoDay(d.to) : C.isoDay(new Date(d.to));
        const range = { from: fromStr, to: toStr };
        window.__metricsGroupRange = range;
        histRange = { ...range };
        // si hay un pill visible en la UI, esa UI ya lo actualizo; solo re-renderizar
        renderAllDonuts();
        renderHistoryStacked();
      } catch (e) {
        console.warn("metrics:groupRange handler failed", e);
      }
    });

    // limpiar filtros globales
    document.addEventListener("metrics:groupClear", (ev) => {
      try {
        const detail = ev?.detail;
        const mode = detail?.mode === "percent" ? "percent" : "count";
        metricModes.canal = metricModes.campana = metricModes.interes = metricModes.estado = metricModes.registrado = metricModes.registro = mode;
        histMode = mode;
        if (detail?.from && detail?.to) {
          const fromStr =
            detail.from instanceof Date ? C.isoDay(detail.from) : C.isoDay(new Date(detail.from));
          const toStr =
            detail.to instanceof Date ? C.isoDay(detail.to) : C.isoDay(new Date(detail.to));
          const range = { from: fromStr, to: toStr };
          window.__metricsGroupRange = range;
          histRange = { ...range };
        } else {
          window.__metricsGroupRange = null;
          histRange = null;
        }
        segActive();
        renderAllDonuts();
        renderHistoryStacked();
      } catch (e) {
        console.warn("metrics:groupClear handler failed", e);
      }
    });

    // refresh fallback: recarga datos y re-renderiza
    document.addEventListener("metrics:refreshData", () => {
      (async () => {
        try {
          await loadData();
          renderAllDonuts();
          renderHistoryStacked();
        } catch (e) {
          console.warn("metrics:refreshData handler failed", e);
        }
      })();
    });
  })();

  // Fallback seguro: abrir picker de rango si groupRangeOpen existe pero openRangePicker no
  document.addEventListener("DOMContentLoaded", () => {
    try {
      const btn = document.getElementById("groupRangeOpen");
      if (btn && typeof window.openRangePicker !== "function") {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          try {
            window.openRangePicker();
          } catch (err) {
            console.warn("openRangePicker error", err);
          }
        });
      }
    } catch (err) {
      console.warn("groupRangeOpen fallback init error", err);
    }
  });

  // ======== RANGO POPUP PARA GRUPO DE DONUTS (independiente) ========
  function setupGroupRangePicker() {
    const pop = document.getElementById("rangePopGroup");
    if (!pop) return; // no existe -> nada que hacer

    const cancel = document.getElementById("rpCancelGroup");
    const apply = document.getElementById("rpApplyGroup");
    const prev = document.getElementById("rpPrevGroup");
    const next = document.getElementById("rpNextGroup");
    const sideBtns = [...document.querySelectorAll("#rangePopGroup .rp-side button")];
    const calHead = document.getElementById("calHeadGroup");
    const calGrid = document.getElementById("calGridGroup");
    const title = document.getElementById("rpTitleGroup");
    const fromI = document.getElementById("rpFromGroup");
    const toI = document.getElementById("rpToGroup");

    if (!cancel || !apply || !prev || !next || !calHead || !calGrid || !title || !fromI || !toI)
      return;

    let view = new Date();
    view.setDate(1);
    let tmpStart = null, tmpEnd = null;

    function setApplyEnabled() {
      const ok = !!(tmpStart && tmpEnd);
      apply.classList.toggle("apply-disabled", !ok);
      apply.disabled = !ok;
    }
    function markPresetActive(id) {
      sideBtns.forEach(b => b.classList.toggle("active", b.dataset.preset === id));
    }

    function draw() {
      calHead.innerHTML = "";
      "lun mar mie jue vie s\u00E1b dom".split(" ").forEach(d => {
        const el = document.createElement("div");
        el.className = "dow";
        el.textContent = d;
        calHead.appendChild(el);
      });
      title.textContent = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(view);
      calGrid.innerHTML = "";
      const firstDow = (view.getDay() + 6) % 7;
      const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      const prevDays = firstDow;
      const prevDate = new Date(view);
      prevDate.setMonth(view.getMonth() - 1);
      const prevCount = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();

      function mkCell(day, off, dateObj) {
        const el = document.createElement("div");
        el.className = "cell" + (off ? " off" : "");
        el.textContent = String(day).padStart(2, "0");
        const key = C.isoDay(dateObj);
        const inSel = tmpStart && tmpEnd && new Date(key) >= new Date(tmpStart) && new Date(key) <= new Date(tmpEnd);
        const isSel = tmpStart === key || tmpEnd === key;
        if (inSel) el.classList.add("in");
        if (isSel) el.classList.add("sel");
        el.addEventListener("click", ev => {
          ev.stopPropagation();
          markPresetActive(null);
          if (!tmpStart || (tmpStart && tmpEnd)) {
            tmpStart = key; tmpEnd = null;
          } else {
            if (new Date(key) < new Date(tmpStart)) { tmpEnd = tmpStart; tmpStart = key; } else { tmpEnd = key; }
          }
          fromI.value = tmpStart || "";
          toI.value = tmpEnd || "";
          setApplyEnabled();
          draw();
        });
        calGrid.appendChild(el);
      }

      for (let i = prevDays; i > 0; i--) {
        const d = prevCount - i + 1;
        mkCell(d, true, new Date(view.getFullYear(), view.getMonth() - 1, d));
      }
      for (let d = 1; d <= daysInMonth; d++) {
        mkCell(d, false, new Date(view.getFullYear(), view.getMonth(), d));
      }
      const totalCells = prevDays + daysInMonth;
      const nextCells = 42 - totalCells;
      for (let d = 1; d <= nextCells; d++) {
        mkCell(d, true, new Date(view.getFullYear(), view.getMonth() + 1, d));
      }
      fromI.value = tmpStart || "";
      toI.value = tmpEnd || "";
      setApplyEnabled();
    }

    sideBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        markPresetActive(btn.dataset.preset);
        const now = new Date();
        const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        let from, to;
        switch (btn.dataset.preset) {
          case "today": from = to = day(now); break;
          case "yesterday": { const y = new Date(now); y.setDate(now.getDate() - 1); from = to = day(y); break; }
          case "thisweek": { const w = new Date(now); const dow = (w.getDay() + 6) % 7; w.setDate(w.getDate() - dow); from = day(w); to = day(now); break; }
          case "lastweek": { const w = new Date(now); const dow = (w.getDay() + 6) % 7; w.setDate(w.getDate() - dow - 7); from = day(w); const e = new Date(w); e.setDate(w.getDate() + 6); to = day(e); break; }
          case "thismonth": from = new Date(now.getFullYear(), now.getMonth(), 1); to = day(now); break;
          case "lastmonth": { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); from = s; to = e; break; }
        }
        tmpStart = C.isoDay(from); tmpEnd = C.isoDay(to);
        view = new Date(tmpStart + "T00:00:00"); view.setDate(1);
        draw();
      });
    });

    // Helper: posiciona un popup respecto a un bot\u00F3n/anchor
    function positionPopup(popEl, anchorEl) {
      if (!popEl || !anchorEl) return;
      // asegurar posicionamiento absoluto
      popEl.style.position = "absolute";
      // medir invisible para calcular tama\u00F1o sin parpadeo
      popEl.style.visibility = "hidden";
      popEl.classList.add("open");
      // forzar reflow
      const popRect = popEl.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      // calcular left/top y ajustar si se sale de la pantalla
      let left = anchorRect.left + window.scrollX;
      if (left + popRect.width > vw - 8) left = Math.max(8, vw - popRect.width - 8);
      if (left < 8) left = 8;
      const top = anchorRect.bottom + window.scrollY + 8;
      popEl.style.left = `${left}px`;
      popEl.style.top = `${top}px`;
      popEl.style.visibility = "visible";
      // mantener clase open (ya a\u00F1adida)
    }

    function open() {
      // inicializar con histRange o \u00FAltimos 7 d\u00EDas
      tmpStart = (histRange && histRange.from) || null;
      tmpEnd = (histRange && histRange.to) || null;
      if (!tmpStart || !tmpEnd) {
        const r = last7DaysRange();
        tmpStart = r.from; tmpEnd = r.to;
      }
      view = new Date(tmpStart + "T00:00:00"); view.setDate(1);
      draw();
      // posicionar respecto al bot\u00F3n global groupRangeOpen
      const anchor = document.getElementById("groupRangeOpen") || document.getElementById("rangeOpen");
      positionPopup(pop, anchor);
      pop.hidden = false;
    }
    function close() {
      pop.classList.remove("open");
      pop.hidden = true;
      pop.style.left = ""; pop.style.top = ""; pop.style.position = ""; pop.style.visibility = "";
    }

    // Exponer para abrir desde el bot\u00F3n global
    window.openGroupRangePicker = open;

    cancel.addEventListener("click", () => { close(); });
    prev.addEventListener("click", () => { view.setMonth(view.getMonth() - 1); draw(); });
    next.addEventListener("click", () => { view.setMonth(view.getMonth() + 1); draw(); });

    apply.addEventListener("click", () => {
      if (!(tmpStart && tmpEnd)) return;
      // emitir evento que ya manejan los donuts
      const from = new Date(tmpStart + "T00:00:00");
      const to = new Date(tmpEnd + "T00:00:00");
      document.dispatchEvent(new CustomEvent("metrics:groupRange", { detail: { from, to } }));
      close();
    });

    // inputs sincronizados
    [fromI, toI].forEach(inp => inp.addEventListener("input", () => {
      tmpStart = fromI.value || null;
      tmpEnd = toI.value || null;
      setApplyEnabled();
    }));

    // cerrar si clic fuera
    document.addEventListener("click", (e) => {
      if (!pop.contains(e.target) && e.target !== document.getElementById("groupRangeOpen")) {
        pop.classList.remove("open"); pop.hidden = true;
      }
    });

    // draw inicial
    draw();
  }

  // --- REEMPLAZO: animaci\u00F3n inline de "Limpiando" en el propio bot\u00F3n (sin overlay) ---
  // helper para guardar/restaurar texto sin quitar el \u00EDcono
  const saveOriginalBtn = (btn) => {
    if (!btn) return;
    if (!btn.dataset.original) btn.dataset.original = btn.innerHTML;
    if (!btn.dataset.originalLabel) {
      const label = btn.querySelector(".group-btn__label");
      btn.dataset.originalLabel = label ? label.textContent : btn.textContent;
    }
  };
  const restoreBtn = (btn) => {
    if (!btn) return;
    const label = btn.querySelector(".group-btn__label");
    if (label && btn.dataset.originalLabel !== undefined) {
      label.textContent = btn.dataset.originalLabel;
    } else if (btn.dataset.original) {
      btn.innerHTML = btn.dataset.original;
    }
    btn.classList.remove("loading");
    btn.dataset.broomActive = "0";
  };
  const setButtonLabel = (btn, text) => {
    if (!btn) return;
    const label = btn.querySelector(".group-btn__label");
    if (label) {
      if (!btn.dataset.originalLabel) btn.dataset.originalLabel = label.textContent;
      label.textContent = text;
    } else {
      if (!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent;
      btn.textContent = text;
    }
  };

  // UI-only: attach small animations/feedback to controls (safe: does not change logic)
  document.addEventListener("DOMContentLoaded", function () {
    try {
      const refreshBtn = document.getElementById("groupRefresh");
      const clearBtn = document.getElementById("groupClear");
      const rangeBtn = document.getElementById("groupRangeOpen");

      // guardar texto original
      saveOriginalBtn(refreshBtn);
      saveOriginalBtn(clearBtn);

      // Refresh: (sin cambios funcionales) - mantiene comportamiento de Actualizando\u2026
      if (refreshBtn) {
        refreshBtn.addEventListener("click", (ev) => {
          if (refreshBtn.classList.contains("loading")) return;
          refreshBtn.classList.add("loading");
          setButtonLabel(refreshBtn, "Actualizando\u2026");
          const tryFn =
            typeof window.updateSheet === "function"
              ? window.updateSheet
              : typeof window.refreshSheet === "function"
              ? window.refreshSheet
              : typeof window.refreshData === "function"
              ? window.refreshData
              : null;

          if (tryFn) {
            try {
              const r = tryFn();
              if (r && typeof r.then === "function") {
                r.finally(() => restoreBtn(refreshBtn));
              } else {
                setTimeout(() => restoreBtn(refreshBtn), 1400);
              }
            } catch (e) {
              setTimeout(() => restoreBtn(refreshBtn), 1200);
            }
          } else {
            document.dispatchEvent(new CustomEvent("metrics:refreshData"));
            const lastUpdateEl = document.getElementById("lastUpdate");
            if (lastUpdateEl) {
              const obs = new MutationObserver(() => {
                restoreBtn(refreshBtn);
                obs.disconnect();
              });
              obs.observe(lastUpdateEl, { childList: true, subtree: true });
              setTimeout(() => {
                try { obs.disconnect(); } catch (e) {}
                restoreBtn(refreshBtn);
              }, 8000);
            } else {
              setTimeout(() => restoreBtn(refreshBtn), 1500);
            }
          }
        });
      }

      // Clear: animaci\u00F3n usando el icono interno del bot\u00F3n
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          // evitar duplicados visuales
          if (clearBtn.dataset.broomActive === "1") return;
          clearBtn.dataset.broomActive = "1";

          // mostrar texto y estado
          clearBtn.classList.add("loading");
          setButtonLabel(clearBtn, "Limpiando\u2026");

          // Si la limpieza real es as\u00EDncrona y expone evento, esperamos a ese evento para restaurar.
          // Observamos 'metrics:groupClear:done' si existe (convenci\u00F3n local). Si no, fallback por timeout.
          let restored = false;
          const doRestore = () => {
            if (restored) return;
            restored = true;
            restoreBtn(clearBtn);
          };

          // fallback timeout corto (UI)
          const fb = setTimeout(() => doRestore(), 900);

          // listener para evento opcional que indique que la limpieza termin\u00F3
          const onDone = (e) => {
            clearTimeout(fb);
            doRestore();
            document.removeEventListener("metrics:groupClear:done", onDone);
          };
          document.addEventListener("metrics:groupClear:done", onDone);
        });
      }

      // Range icon click handler (sin cambios)
      if (rangeBtn) {
        rangeBtn.addEventListener("click", (e) => {
          e && e.stopPropagation && e.stopPropagation();
          try {
            if (typeof window.openGroupRangePicker === "function") {
              window.openGroupRangePicker();
            } else if (typeof window.openRangePicker === "function") {
              window.__openRangeFor = "group";
              window.openRangePicker();
            }
          } catch (err) {
            console.warn("groupRangeOpen click fallback failed", err);
          }
        });
      }
    } catch (err) {
      console.warn("UI animation init failed", err);
    }
  });

  // C\u00F3digo comentado: l\u00F3gica de animaci\u00F3n de escoba removida (ahora es inline en el bot\u00F3n Limpiar)

  /*
    Robust single-refresh handler: evita ejecuciones dobles y unifica
    la l\u00F3gica de "Actualizar" (usa loadData si existe, o llamadas conocidas).
  */
  (function () {
    // evita redefinir si ya se carg\u00F3 este bloque
    if (window.__metricsRefreshInit) return;
    window.__metricsRefreshInit = true;

    const saveOriginal = (btn) => saveOriginalBtn(btn);
    const restoreOriginal = (btn) => restoreBtn(btn);

    async function performGroupRefresh() {
      if (window.__metricsRefreshing) return; // ya en progreso
      window.__metricsRefreshing = true;
      const btn = document.getElementById("groupRefresh");
      try {
        saveOriginal(btn);
        if (btn) {
          btn.classList.add("loading");
          setButtonLabel(btn, "Actualizando\u2026");
        }

        // Priorizar funciones conocidas (si la app las expone)
        const fn =
          typeof window.updateSheet === "function"
            ? window.updateSheet
            : typeof window.refreshSheet === "function"
            ? window.refreshSheet
            : typeof window.refreshData === "function"
            ? window.refreshData
            : null;

        if (fn) {
          // si devuelve Promise, await; si no, esperar un breve timeout
          const r = fn();
          if (r && typeof r.then === "function") {
            await r;
          } else {
            await new Promise((r) => setTimeout(r, 1200));
          }
        } else if (typeof loadData === "function") {
          // fallback directo al loader interno
          await loadData();
          try { renderAllDonuts(); } catch(e){}
          try { renderHistoryStacked(); } catch(e){}
        } else {
          // \u00FAltimo recurso: emitir evento (otros handlers pueden reaccionar)
          document.dispatchEvent(new CustomEvent("metrics:refreshData"));
          await new Promise((r) => setTimeout(r, 1200));
        }
      } catch (e) {
        console.warn("performGroupRefresh error", e);
      } finally {
        restoreOriginal(document.getElementById("groupRefresh"));
        window.__metricsRefreshing = false;
      }
    }

    // Attach single handler (use onclick to avoid multiple addEventListener duplicates)
    const btn = document.getElementById("groupRefresh");
    if (btn) {
      saveOriginal(btn);
      btn.onclick = function (ev) {
        ev && ev.preventDefault && ev.preventDefault();
        performGroupRefresh();
      };
    }

    // Tambi\u00E9n exponer la funci\u00F3n globalmente por si otros scripts la quieren llamar
    window.performGroupRefresh = performGroupRefresh;
  })();

  // Wrapper eliminado: ahora el estado de carga se maneja directamente desde performGroupRefresh.

  /* Animaci\u00F3n de escoba desactivada: dejamos la funci\u00F3n como no-op para evitar el overlay */
  function broomSweepOverMetrics() {
    window.__broomRunning = false;
    return null;
  }

  // Integraci\u00F3n: cuando se pulsa el bot\u00F3n groupClear mostramos la escoba.
  // (Si ya existe handler que emite metrics:groupClear, esto solo a\u00F1ade la animaci\u00F3n UI.)
  document.addEventListener("DOMContentLoaded", () => {
    const btnClear = document.getElementById("groupClear");
    if (!btnClear) return;
    btnClear.addEventListener("click", () => {
      // mostrar texto/animaci\u00F3n existente (si aplica) y lanzar la escoba
      broomSweepOverMetrics(900); // duraci\u00F3n en ms
    });
  });
  document.addEventListener("theme:changed", applyThemeToCharts);
  window.addEventListener("themechange", applyThemeToCharts);

  // Exponer y asegurar attach del handler de la escoba (robusto si DOM ya est\u00E1 listo)
  window.broomSweepOverMetrics = broomSweepOverMetrics;

  // Ajusta en runtime la variable usada por el sticky mobile para alinear la barra de filtros.
  (function syncMobileStickyOffset() {
    const root = document.documentElement;
    const nav = document.getElementById("crmTopNav");
    if (!root || !nav) return;
    let rafId = null;

    const refreshVariable = () => {
      rafId = null;
      const styles = window.getComputedStyle(nav);
      if (styles.display === "none") return;
      const height = nav.offsetHeight || parseFloat(styles.height) || 0;
      if (height > 0) {
        root.style.setProperty("--mobile-top-nav-height", `${height}px`);
      }
    };

    const scheduleRefresh = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(refreshVariable);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", refreshVariable, { once: true });
    } else {
      refreshVariable();
    }

    window.addEventListener("resize", scheduleRefresh);
    window.addEventListener("orientationchange", scheduleRefresh);
  })();

  // Solo al hacer scroll se pega la barra: controlamos una clase en el body para móviles.
  (function handleMobileFilterStickiness() {
    const body = document.body;
    if (!body || body.dataset.page !== "metrics") return;
    const nav = document.getElementById("crmTopNav");
    const needsMobile = () =>
      window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    const getNavHeight = () => {
      if (!nav) return 0;
      const styles = window.getComputedStyle(nav);
      return styles.display === "none" ? 0 : nav.offsetHeight || 0;
    };
    let lastState = null;

    const updateState = () => {
      if (!needsMobile()) {
        if (lastState !== false) {
          body.classList.remove("filters-stuck");
          lastState = false;
        }
        return;
      }
      const scrolled = window.scrollY > getNavHeight();
      if (scrolled === lastState) return;
      lastState = scrolled;
      body.classList.toggle("filters-stuck", scrolled);
    };

    window.addEventListener("scroll", updateState, { passive: true });
    window.addEventListener("resize", updateState);
    window.addEventListener("orientationchange", updateState);
    updateState();
  })();

  (function attachBroomHandler() {
    function doAttach() {
      try {
        const btnClear = document.getElementById("groupClear");
        if (!btnClear) return;
        // evitar duplicados
        if (btnClear.__broomAttached) return;
        btnClear.__broomAttached = true;
        btnClear.addEventListener("click", () => {
          broomSweepOverMetrics(900);
        });
        console.debug("broom handler attached");
      } catch (e) {
        console.warn("attachBroomHandler failed", e);
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", doAttach);
    } else {
      doAttach();
    }
  })();
  let globalSparkTooltip = null;
  function getSparkTooltipElement() {
    if (!globalSparkTooltip) {
      const el = document.createElement("div");
      el.className = "spark-tooltip";
      el.innerHTML =
        '<div class="spark-tooltip__title"></div><div class="spark-tooltip__body"></div>';
      document.body.appendChild(el);
      globalSparkTooltip = el;
    }
    return globalSparkTooltip;
  }
  function renderSparkTooltip(context, canvas) {
    const tooltip = context.tooltip;
    const tooltipEl = getSparkTooltipElement();
    if (!tooltipEl) return;
    if (!tooltip || tooltip.opacity === 0) {
      tooltipEl.style.opacity = 0;
      return;
    }
    const title = tooltip.title?.[0] || "";
    const bodyLine = tooltip.body?.[0]?.lines?.[0] || "";
    const titleNode = tooltipEl.querySelector(".spark-tooltip__title");
    const bodyNode = tooltipEl.querySelector(".spark-tooltip__body");
    if (titleNode) titleNode.textContent = title;
    if (bodyNode) bodyNode.textContent = bodyLine;

    const rect = canvas.getBoundingClientRect();
    const caretX = rect.left + tooltip.caretX;
    const caretY = rect.top + tooltip.caretY;
    const width = tooltipEl.offsetWidth || 140;
    const height = tooltipEl.offsetHeight || 40;
    let left = caretX - width / 2;
    let top = caretY - height - 12;
    const viewportWidth = window.innerWidth;
    if (left < 8) left = 8;
    if (left + width > viewportWidth - 8) left = viewportWidth - width - 8;
    if (top < 8) top = caretY + 16;

    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.transform = "translate3d(0,0,0)";
  }

})();

// P\u00E1gina de Leads: filtros + tabla + KPIs (sin Chart.js)
(function () {
  const C = window.Common;

  let allRows = [],
    filteredRows = [];
  let shownCount = 0;
  let isScrollLoading = false;
  const SCROLL_TRIGGER_PX = 96;
  let listRange = null;
  const MOBILE_BREAKPOINT = 768;
  const isMobileViewport = () =>
    window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;

  // ====== OPCIONES FIJAS (requeridas) ======
  const OPTIONS_REGISTRO = ["Nuevo", "Duplicado"];
  const OPTIONS_ESTADO = [
    "Registrado",
    "Seguimiento",
    "No contesta", // \u2190 NUEVO
    "Visita a oficina",
    "Visita a proyecto",
    "Venta",
    "Cerrado",
    "Video llamada",
    "Re contacto",
    "Potencial",
    "No interesado",
    "Spam",
  ];

  // ------- util de esta p\u00E1gina -------
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
      "Asesor",
      "ASESOR",
      // columnas de comentarios
      "Comentario Ventas",
      "Comentario Leads",
      // === NOMBRES REALES EN TU SHEET + alias de compat ===
      "Comentario Lead", // hoja: M
      "Comentario del Sistema", // hoja: N
      "Comentario de Sistema", // compat por si exist\u00EDa sin "del"
    ];
    const map = {};
    want.forEach((w) => {
      const i = headerNorm.indexOf(C.norm(w));
      if (i >= 0) map[w] = headerReal[i];
    });
    return { data, columns: map };
  };

  const uniqueValues = (rows, key) => {
    const s = new Set();
    rows.forEach((r) => {
      const v = (r[key] ?? "").toString().trim();
      if (v) s.add(v);
    });
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  };

  const setLastUpdate = () =>
    (document.getElementById(
      "lastUpdate"
    ).textContent = `Actualizado: ${C.prettyDate(new Date())}`);

  const last7DaysRange = () => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - 6);
    return { from: C.isoDay(from), to: C.isoDay(to) };
  };

  function populateSelect(id, ops) {
    const sel = document.getElementById(id),
      cur = sel.value;
    sel.innerHTML = `<option value=""></option>`;
    ops.forEach((o) => {
      const el = document.createElement("option");
      el.value = o;
      el.textContent = o;
      sel.appendChild(el);
    });
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }

  function recalcKpis() {
    const total = allRows.length;

    // Estado = "Registrado"
    const registradosEstado = allRows.filter(
      (r) => C.norm(r["Estado"]) === "registrado"
    ).length;

    // Gestionados = cualquier Estado seleccionado distinto de "Registrado"
    const gestionados = allRows.filter((r) => {
      const v = C.norm(r["Estado"]);
      return v && v !== "registrado"; // no cuenta vac\u00EDo ni "Registrado"
    }).length;

    document.getElementById("kpiTotal").textContent =
      total.toLocaleString("es-PE");
    document.getElementById("kpiNuevos").textContent =
      registradosEstado.toLocaleString("es-PE");
    document.getElementById("kpiGestionados").textContent =
      gestionados.toLocaleString("es-PE");
  }

  function updateChips() {
    const total = allRows.length,
      fil = filteredRows.length;
    document.getElementById("chipFilas").textContent = `${fil.toLocaleString(
      "es-PE"
    )} / ${total.toLocaleString("es-PE")} filas`;
    document.getElementById(
      "chipMostrando"
    ).textContent = `Mostrando ${Math.min(shownCount, fil).toLocaleString(
      "es-PE"
    )}`;
  }

  // Igual que antes (permite mantener el valor actual aunque no est\u00E9 en la lista)
  function unionOptions(current, options) {
    const cur = (current ?? "").toString().trim();
    const arr =
      cur && !options.includes(cur) ? [cur, ...options] : [...options];
    return ["\u2014", ...arr];
  }

  // === Colores (clases) ===
  function applySelectColor(sel, columnName) {
    sel.className = "sel-inline";
    const v = C.norm(sel.value);

    if (columnName === "Registro") {
      if (v === "nuevo") sel.classList.add("opt-reg-nuevo");
      else if (v === "duplicado") sel.classList.add("opt-reg-duplicado");
    } else if (columnName === "Estado") {
      if (v === "registrado") sel.classList.add("opt-estado-registrado");
      else if (v === "seguimiento") sel.classList.add("opt-estado-seguimiento");
      else if (v === "no contesta")
        sel.classList.add("opt-estado-nocontesta"); // \u2190 NUEVO
      else if (v === "visita a oficina")
        sel.classList.add("opt-estado-visitaoficina");
      else if (v === "visita a proyecto")
        sel.classList.add("opt-estado-visitaproyecto");
      else if (v === "venta") sel.classList.add("opt-estado-venta");
      else if (v === "cerrado") sel.classList.add("opt-estado-cerrado");
      else if (v === "video llamada")
        sel.classList.add("opt-estado-videollamada");
      else if (v === "re contacto") sel.classList.add("opt-estado-recontacto");
      else if (v === "potencial") sel.classList.add("opt-estado-potencial");
      else if (v === "no interesado")
        sel.classList.add("opt-estado-nointeresado");
      else if (v === "spam") sel.classList.add("opt-estado-spam");
    } else if (columnName === "Registrado") {
      if (v === "si") sel.classList.add("opt-registrado-si");
      else if (v === "no") sel.classList.add("opt-registrado-no");
    }
  }

  // === Select \u201Ccl\u00E1sico\u201D como el tuyo (sin duplicar "\u2014") ===
  function makeSelect(options, value, onChange, columnName) {
    const sel = document.createElement("select");
    options.forEach((op) => {
      const o = document.createElement("option");
      o.value = op === "\u2014" ? "" : op;
      o.textContent = op;
      sel.appendChild(o);
    });
    sel.value = (value ?? "").toString();
    applySelectColor(sel, columnName);
    sel.addEventListener("change", async () => {
      const prev = value,
        newVal = sel.value;
      sel.disabled = true;
      try {
        await onChange(newVal);
        value = newVal;
        applySelectColor(sel, columnName);
      } catch (e) {
        console.error(e);
        alert("No se pudo actualizar en el Sheet: " + e.message);
        sel.value = prev;
        applySelectColor(sel, columnName);
      } finally {
        sel.disabled = false;
      }
    });
    sel.classList.add("sel-inline");
    return sel;
  }

  function makeEditableTextarea(value, onSave) {
    const ta = document.createElement("textarea");
    ta.className = "inline-text";
    ta.value = value ?? "";
    let timer;
    const commit = () => onSave(ta.value);
    ta.addEventListener("blur", commit);
    ta.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(commit, 800);
    });
    return ta;
  }

  const escapeSelector = (str) => {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(str);
    return String(str).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  };

  function renderTableChunk(append, options = {}) {
    const { maintainScroll = false } = options;
    const tbody = document.querySelector("#dataTable tbody");
    const wrap = document.querySelector(".table-wrap");
    const mobileView = isMobileViewport();
    const previousShown = shownCount;
    let prevScrollTop = 0;
    let prevScrollRange = 0;
    let scrollAnchor = null;

    if (maintainScroll && wrap) {
      prevScrollTop = wrap.scrollTop;
      prevScrollRange = Math.max(1, wrap.scrollHeight - wrap.clientHeight);
      const rows = Array.from(tbody?.querySelectorAll("tr") || []);
      const anchorRow = rows.find(
        (tr) => tr.offsetTop + tr.offsetHeight > wrap.scrollTop
      );
      if (anchorRow) {
        scrollAnchor = {
          key: anchorRow.dataset.rowKey || null,
          offset: wrap.scrollTop - anchorRow.offsetTop,
        };
      }
    }
    if (!append) {
      tbody.innerHTML = "";
      shownCount = 0;
      if (wrap && !maintainScroll) wrap.scrollTop = 0;
    }
    const fmt = new Intl.DateTimeFormat("es-PE", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const chunkSize =
      shownCount === 0
        ? mobileView
          ? C.N_PASO
          : C.N_INICIAL
        : C.N_PASO;
    const start = shownCount,
      end = Math.min(filteredRows.length, shownCount + chunkSize);

    for (let i = start; i < end; i++) {
      const r = filteredRows[i],
        tr = document.createElement("tr");
      tr.dataset.rowKey = String(r._idx);
      tr.classList.add("tr-anim");
      const outDate = Number.isNaN(r._ts)
        ? r["Hora de registro"] || ""
        : fmt.format(new Date(r._ts));

      const appendCell = (tr, val) => {
        const td = document.createElement("td");
        td.textContent = (val ?? "").toString();
        tr.appendChild(td);
      };

      // === ORDEN ORIGINAL ===
      appendCell(tr, outDate);
      appendCell(tr, r["Nombres"]);
      appendCell(tr, r["Celular"]);
      appendCell(tr, r["DNI"]);

      // Canal (chip)
      const tdCanal = document.createElement("td");
      const chip = document.createElement("span");
      chip.className = `canal-chip ${C.canalClass(r["Canal"])}`;
      chip.textContent = r["Canal"] || "(Sin dato)";
      tdCanal.appendChild(chip);
      tr.appendChild(tdCanal);

      appendCell(tr, r["Campa\u00F1a"]);
      appendCell(tr, r["Interes"]);

      // Registro (Nuevo / Duplicado)
      const regTd = document.createElement("td");
      regTd.appendChild(
        makeSelect(
          unionOptions(r["Registro"], OPTIONS_REGISTRO),
          r["Registro"],
          (v) => handleUpdate(i, "Registro", v, regTd),
          "Registro"
        )
      );
      tr.appendChild(regTd);

      // Estado (lista fija)
      const estTd = document.createElement("td");
      estTd.appendChild(
        makeSelect(
          unionOptions(r["Estado"], OPTIONS_ESTADO),
          r["Estado"],
          (v) => handleUpdate(i, "Estado", v, estTd),
          "Estado"
        )
      );
      tr.appendChild(estTd);

      // Registrado
      const regisTd = document.createElement("td");
      regisTd.appendChild(
        makeSelect(
          unionOptions(r["Registrado"], C.OPTIONS_REGISTRADO),
          r["Registrado"],
          (v) => handleUpdate(i, "Registrado", v, regisTd),
          "Registrado"
        )
      );
      tr.appendChild(regisTd);

      // Asesor
      const aseTd = document.createElement("td");
      aseTd.appendChild(
        makeSelect(
          unionOptions(r["Asesor"], C.OPTIONS_ASESOR),
          r["Asesor"],
          (v) => handleUpdate(i, "Asesor", v, aseTd),
          "Asesor"
        )
      );
      tr.appendChild(aseTd);

      // Comentario Ventas (editable)
      const comVTd = document.createElement("td");
      comVTd.appendChild(
        makeEditableTextarea(r["Comentario Ventas"], (v) =>
          handleUpdate(i, "Comentario Ventas", v, comVTd)
        )
      );
      tr.appendChild(comVTd);

      // Comentario Leads (solo lectura)
      const comLTd = document.createElement("td");
      const div = document.createElement("div");
      div.className = "comment-ro";
      div.textContent = r["Comentario Leads"] || "";
      comLTd.appendChild(div);
      tr.appendChild(comLTd);

      // Comentario de Sistema (solo lectura)
      const comSysTd = document.createElement("td");
      const divS = document.createElement("div");
      divS.className = "comment-ro";
      divS.textContent = r["Comentario de Sistema"] || "";
      comSysTd.appendChild(divS);
      tr.appendChild(comSysTd);

      tbody.appendChild(tr);
    }

    shownCount = end;
    document.getElementById("btnVerMas").style.display =
      shownCount < filteredRows.length ? "inline-block" : "none";
    updateChips();
    isScrollLoading = false;
    if (!append && maintainScroll && previousShown > shownCount) {
      const target = Math.min(previousShown, filteredRows.length);
      while (shownCount < target) {
        renderTableChunk(true, { maintainScroll: true });
      }
      return;
    }
    if (maintainScroll && wrap) {
      let applied = false;
      if (scrollAnchor?.key) {
        const target = tbody.querySelector(
          `tr[data-row-key="${CSS.escape(scrollAnchor.key)}"]`
        );
        if (target) {
          const nextTop = target.offsetTop + (scrollAnchor.offset || 0);
          wrap.scrollTop = Math.max(0, nextTop);
          applied = true;
        }
      }
      if (!applied) {
        const maxScrollable = Math.max(
          0,
          wrap.scrollHeight - wrap.clientHeight
        );
        const ratio = prevScrollRange ? prevScrollTop / prevScrollRange : 0;
        const nextScrollTop = Math.min(
          maxScrollable,
          Math.max(0, Math.round(ratio * maxScrollable))
        );
        wrap.scrollTop = nextScrollTop;
      }
    }
    if (!append && !mobileView) window.requestAnimationFrame(maybeAutoFill);
  }

  function maybeAutoFill() {
    if (isMobileViewport()) return;
    const wrap = document.querySelector(".table-wrap");
    if (!wrap) return;
    if (shownCount >= filteredRows.length) return;
    const distance =
      wrap.scrollHeight - (wrap.scrollTop + wrap.clientHeight);
    if (distance > SCROLL_TRIGGER_PX && wrap.scrollHeight > wrap.clientHeight)
      return;
    if (isScrollLoading) return;
    isScrollLoading = true;
    renderTableChunk(true);
    if (shownCount < filteredRows.length)
      window.requestAnimationFrame(maybeAutoFill);
  }

  function setupInfiniteScroll() {
    const wrap = document.querySelector(".table-wrap");
    if (!wrap || wrap.dataset.infiniteInit === "true") return;
    const handleScroll = () => {
      if (isScrollLoading) return;
      if (shownCount >= filteredRows.length) return;
      const distance =
        wrap.scrollHeight - (wrap.scrollTop + wrap.clientHeight);
      if (distance > SCROLL_TRIGGER_PX) return;
      isScrollLoading = true;
      window.requestAnimationFrame(() => {
        if (shownCount < filteredRows.length) {
          renderTableChunk(true);
        } else {
          isScrollLoading = false;
        }
      });
    };
    wrap.addEventListener("scroll", handleScroll, { passive: true });
    wrap.dataset.infiniteInit = "true";
  }

  // Renderiza TODO el resultado filtrado, no solo el primer bloque
  function renderAllFilteredRows() {
    if (isMobileViewport()) {
      renderTableChunk(false);
      return;
    }
    renderTableChunk(false);
    while (shownCount < filteredRows.length) {
      renderTableChunk(true);
    }
  }

  // Filtro r\u00E1pido: solo filas con Estado = "Registrado" (sin rango ni otros filtros)
  function filterToRegistradosAll() {
    // limpiar filtros de la toolbar y el rango
    document.getElementById("fSearch").value = "";
    ["fCanal", "fCamp", "fInteres"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    listRange = null;
    updateToolbarRangePill();

    // filtrar y ordenar como en applyFilters
    filteredRows = allRows
      .filter((r) => C.norm(r["Estado"]) === "registrado")
      .sort((a, b) => {
        const A = a._ts,
          B = b._ts;
        if (Number.isNaN(A) && Number.isNaN(B)) return b._idx - a._idx;
        if (Number.isNaN(A)) return 1;
        if (Number.isNaN(B)) return -1;
        return B - A;
      });

    shownCount = 0;
    renderAllFilteredRows(); // muestra todas las filas filtradas
    updateChips();

    // (eliminado) NO hacer scroll autom\u00E1tico
    // document.getElementById("dataTable")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Guardado SEGURO (como el original)
  async function handleUpdate(filteredIndex, columnName, newValue, cellTd) {
    const rowObj = filteredRows[filteredIndex],
      sheetRow = rowObj._idx + 2;

    await C.apiSetCell(sheetRow, columnName, newValue);
    const serverValue = await C.apiGetCell(sheetRow, columnName);
    if ((serverValue ?? "") !== (newValue ?? ""))
      throw new Error(
        `Verificaci\u00F3n fall\u00F3 (en Sheet: "${serverValue}" \u2260 enviado: "${newValue}")`
      );

    rowObj[columnName] = serverValue;
    const match = allRows.find((r) => r._idx === rowObj._idx);
    if (match) match[columnName] = serverValue;

    if (columnName === "Registro" || columnName === "Estado") recalcKpis();

    const ok = document.createElement("span");
    ok.className = "save-badge";
    ok.textContent = "\u2713 Guardado";
    cellTd.appendChild(ok);
    setTimeout(() => ok.remove(), 1500);

    setLastUpdate();
  }

  function updateToolbarRangePill() {
    const el = document.getElementById("tbRangePill");
    if (!listRange) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    const fromD = new Date(listRange.from + "T00:00:00");
    const toD = new Date(listRange.to + "T00:00:00");
    const compact = window.matchMedia("(max-width:700px)").matches;
    el.textContent = compact
      ? `${C.prettyDayShort(fromD)} \u2013 ${C.prettyDayShort(
          toD
        )} ${toD.getFullYear()}`
      : `${C.prettyDay(fromD)} \u2013 ${C.prettyDay(toD)}`;
    el.title = el.textContent;
    el.style.display = "inline-block";
  }

  function applyFilters(options = {}) {
    const { maintainScroll = false } = options;
    const vSearch = C.norm(document.getElementById("fSearch").value);
    const vCanal = document.getElementById("fCanal").value.trim(),
      vCamp = document.getElementById("fCamp").value.trim(),
      vInt = document.getElementById("fInteres").value.trim();

    const tsDesde = listRange
      ? new Date(listRange.from + "T00:00:00").getTime()
      : null;
    const tsHasta = listRange
      ? new Date(listRange.to + "T00:00:00").getTime()
      : null;

    filteredRows = allRows
      .filter((r) => {
        const d = r._dateOnly;
        const okFecha =
          (tsDesde ? d >= tsDesde : true) && (tsHasta ? d <= tsHasta : true);
        const blob = `${r["Nombres"]} ${r["Celular"]} ${r["DNI"]}`;
        const okSearch = vSearch ? C.norm(blob).includes(vSearch) : true;
        const okCanal = vCanal ? r["Canal"] === vCanal : true;
        const okCamp = vCamp ? r["Campa\u00F1a"] === vCamp : true;
        const okInt = vInt ? r["Interes"] === vInt : true;
        return okFecha && okSearch && okCanal && okCamp && okInt;
      })
      .sort((a, b) => {
        const A = a._ts,
          B = b._ts;
        if (Number.isNaN(A) && Number.isNaN(B)) return b._idx - a._idx;
        if (Number.isNaN(A)) return 1;
        if (Number.isNaN(B)) return -1;
        return B - A;
      });

    shownCount = 0;
    renderTableChunk(false, { maintainScroll });
    updateChips();
  }

  function clearAll() {
    document.getElementById("fSearch").value = "";
    ["fCanal", "fCamp", "fInteres"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    listRange = null;
    updateToolbarRangePill();
    applyFilters();
  }

  function captureFiltersState() {
    return {
      search: document.getElementById("fSearch")?.value || "",
      canal: document.getElementById("fCanal")?.value || "",
      camp: document.getElementById("fCamp")?.value || "",
      interes: document.getElementById("fInteres")?.value || "",
      range: listRange ? { ...listRange } : null,
    };
  }

  function restoreFiltersState(state) {
    if (!state) return;
    document.getElementById("fSearch").value = state.search || "";
    if (state.canal !== undefined)
      document.getElementById("fCanal").value = state.canal;
    if (state.camp !== undefined)
      document.getElementById("fCamp").value = state.camp;
    if (state.interes !== undefined)
      document.getElementById("fInteres").value = state.interes;
    listRange = state.range ? { ...state.range } : null;
    updateToolbarRangePill();
  }

  // ======== RANGO TOOLBAR (modal propio) ========
  function setupToolbarRangePicker() {
    const modal = document.getElementById("tbModal"),
      pop = document.getElementById("tbRangePop"),
      cancel = document.getElementById("tbRpCancel"),
      apply = document.getElementById("tbRpApply"),
      prev = document.getElementById("tbRpPrev"),
      next = document.getElementById("tbRpNext"),
      sideBtns = [...document.querySelectorAll("#tbRangePop .rp-side button")],
      calHead = document.getElementById("tbCalHead"),
      calGrid = document.getElementById("tbCalGrid"),
      title = document.getElementById("tbRpTitle"),
      fromI = document.getElementById("tbRpFrom"),
      toI = document.getElementById("tbRpTo");

    let view = new Date();
    view.setDate(1);
    let tmpStart = null,
      tmpEnd = null;
    const markPresetActive = (id) =>
      sideBtns.forEach((b) =>
        b.classList.toggle("active", b.dataset.preset === id)
      );
    const setApplyEnabled = () => {
      const ok = !!(tmpStart && tmpEnd);
      apply.classList.toggle("apply-disabled", !ok);
      apply.disabled = !ok;
    };

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

    function open() {
      tmpStart = (listRange && listRange.from) || null;
      tmpEnd = (listRange && listRange.to) || null;
      if (!tmpStart || !tmpEnd) {
        const r = last7DaysRange();
        tmpStart = r.from;
        tmpEnd = r.to;
      }
      view = new Date(tmpStart + "T00:00:00");
      view.setDate(1);
      draw();
      modal.classList.add("open");
    }
    function close() {
      modal.classList.remove("open");
    }
    window.openToolbarRangePicker = open;

    cancel.addEventListener("click", close);
    apply.addEventListener("click", () => {
      if (!(tmpStart && tmpEnd)) return;
      listRange = { from: tmpStart, to: tmpEnd };
      updateToolbarRangePill();
      applyFilters();
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
      const btn = document.getElementById("toolbarRangeBtn");
      if (modal.classList.contains("open")) {
        const pop = document.getElementById("tbRangePop");
        if (
          !pop.contains(e.target) &&
          e.target !== btn &&
          !btn.contains(e.target)
        )
          modal.classList.remove("open");
      }
    });
  }

  let initialLoadDone = false;

  async function loadData(options) {
    const opts = options instanceof Event ? {} : options ?? {};
    const preserveScroll = opts.preserveScroll ?? false;
    const preserveFilters = opts.preserveFilters ?? initialLoadDone;
    const savedFilters = preserveFilters ? captureFiltersState() : null;
    const btn = document.getElementById("refreshBtn");
    btn.disabled = true;
    btn.textContent = "Cargando\u2026";
    try {
      const rows = await C.fetchCSV(C.CSV_URL);
      const { data, columns } = mapColumns(rows);
      allRows = data
        .map((r, idx) => {
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
            Asesor: r[columns["Asesor"]] ?? r[columns["ASESOR"]] ?? "",
            "Comentario Ventas": r[columns["Comentario Ventas"]] ?? "",
            // Comentario Leads \u2190 hoja: "Comentario Lead" (con alias de compat)
            "Comentario Leads":
              r[columns["Comentario Lead"]] ??
              r[columns["Comentario Leads"]] ??
              "",
            // Comentario de Sistema \u2190 hoja: "Comentario del Sistema" (con alias)
            "Comentario de Sistema":
              r[columns["Comentario del Sistema"]] ??
              r[columns["Comentario de Sistema"]] ??
              "",
          };
        })
        .sort((a, b) => {
          const A = a._ts,
            B = b._ts;
          if (Number.isNaN(A) && Number.isNaN(B)) return b._idx - a._idx;
          if (Number.isNaN(A)) return 1;
          if (Number.isNaN(B)) return -1;
          return B - A;
        });

      recalcKpis();
      populateSelect("fCanal", uniqueValues(allRows, "Canal"));
      populateSelect("fCamp", uniqueValues(allRows, "Campa\u00F1a"));
      populateSelect("fInteres", uniqueValues(allRows, "Interes"));

      if (savedFilters) {
        restoreFiltersState(savedFilters);
      } else {
        listRange = last7DaysRange();
        updateToolbarRangePill();
      }

      applyFilters({ maintainScroll: preserveScroll && initialLoadDone });
      setLastUpdate();
      if (C.isFileOrigin())
        document.getElementById("hostWarn").style.display = "block";
    } catch (e) {
      console.error(e);
      alert("No se pudieron cargar los datos del Google Sheets.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Actualizar datos \u21BB";
      initialLoadDone = true;
    }
  }

  // ===== init =====
  document.addEventListener("DOMContentLoaded", () => {
    C.initThemeAndMenu();
    setupToolbarRangePicker();

    document.getElementById("refreshBtn").addEventListener("click", loadData);
    document
      .getElementById("btnVerMas")
      .addEventListener("click", () => renderTableChunk(true));
    document
      .getElementById("toolbarRangeBtn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        window.openToolbarRangePicker();
      });
    document
      .getElementById("clearFiltersBtn")
      .addEventListener("click", clearAll);
    // KPI "Usuarios nuevos" \u2192 click para filtrar Estado = Registrado (mostrar todos)
    const kpiNuevosCard = document.querySelector(".kpi.nuevos");
    if (kpiNuevosCard) {
      kpiNuevosCard.title = "Ver solo Estado = Registrado";
      kpiNuevosCard.addEventListener("click", filterToRegistradosAll);
    }

    const debounced = C.debounce(applyFilters, 250);
    ["fSearch", "fCanal", "fCamp", "fInteres"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener(
        el.tagName === "INPUT" ? "input" : "change",
        debounced
      );
    });

    setupInfiniteScroll();
    loadData().finally(() => {
      setInterval(() => {
        if (document.hidden) return;
        const refreshBtn = document.getElementById("refreshBtn");
        if (refreshBtn?.disabled) return;
        loadData({ preserveScroll: true, preserveFilters: true });
      }, 60_000);
    });
  });
})();

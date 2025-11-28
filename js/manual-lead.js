// js/manual-lead.js
(() => {
  const WEBHOOK_URL =
    "https://n8n.simbilaverde.pe/webhook/eacda9f0-afda-42e5-837f-40d057b11406";

  // ---- Elementos
  const addBtn = document.getElementById("addLeadBtn");
  const modal = document.getElementById("leadModal");
  const closeBtn = document.getElementById("leadClose");
  const cancelBtn = document.getElementById("leadCancel");
  const form = document.getElementById("leadForm");
  const submitBtn = document.getElementById("leadSubmit");
  const msg = document.getElementById("leadMsg");
  const refreshBtn = document.getElementById("refreshBtn");

  // Monto: select + input "otro"
  const montoSel = document.getElementById("lfMontoSelect");
  const montoOtroWrap = document.getElementById("lfMontoOtroWrap");
  const montoOtro = document.getElementById("lfMonto");

  if (!addBtn || !modal || !form || !submitBtn) return;

  // ---- Utils
  const val = (v) => {
    const t = (v ?? "").toString().trim();
    return t === "" ? null : t;
  };

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Enviando\u2026" : "Registrar";
  }

  // Deja solo d\u00EDgitos y un \u00FAnico punto decimal
  function sanitizeNumericString(s) {
    if (!s) return "";
    let cleaned = s.replace(/,/g, "").replace(/[^\d.]/g, "");
    const firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, "");
    }
    return cleaned;
  }

  // "12345.67" -> "12,345.67"
  function formatWithThousands(s) {
    if (!s) return "";
    const raw = sanitizeNumericString(s);
    if (raw === "") return "";
    const parts = raw.split(".");
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const dec = parts[1] ? `.${parts[1]}` : "";
    return int + dec;
  }

  // Formato para el payload: "S/.X,XXX[.cc]" | "al_contado" | null
  function formatSolesForPayload(value, preset) {
    if (preset === "al_contado") return "al_contado";
    if (preset === "3000" || preset === "5000" || preset === "10000") {
      const f = formatWithThousands(preset);
      return f ? `S/.${f}` : null;
    }
    if (preset === "otro") {
      const cleaned = sanitizeNumericString(value);
      if (!cleaned) return null;
      const f = formatWithThousands(cleaned);
      return f ? `S/.${f}` : null;
    }
    return null; // nada seleccionado
  }

  // ---- Modal open/close
  function openModal() {
    form.reset();
    msg.textContent = "";
    if (montoSel) montoSel.value = "";
    if (montoOtroWrap) montoOtroWrap.classList.add("hidden");
    modal.classList.add("open");
    setTimeout(
      () => form.querySelector("input,textarea,select,button")?.focus(),
      10
    );
  }
  function closeModal() {
    modal.classList.remove("open");
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("open") && e.key === "Escape") closeModal();
  });
  addBtn.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  // ---- Monto "Otro": mostrar input y formatear con comas mientras escribe
  montoSel?.addEventListener("change", () => {
    if (montoSel.value === "otro") {
      montoOtroWrap.classList.remove("hidden");
      setTimeout(() => montoOtro?.focus(), 0);
    } else {
      montoOtroWrap.classList.add("hidden");
      if (montoOtro) montoOtro.value = "";
    }
  });

  // Formateo en vivo con miles (no ponemos "S/." dentro del input)
  montoOtro?.addEventListener("input", (e) => {
    const el = e.target;
    const formatted = formatWithThousands(el.value);
    el.value = formatted;
    // Llevar el cursor al final (simple y suficiente)
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {}
  });

  // ---- Env\u00EDo
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    // Requeridos
    const nombre = form.nombreCompleto.value.trim();
    const dni = form.dni.value.trim();
    const celular = form.celular.value.trim();
    if (!nombre || !dni || !celular) {
      msg.textContent =
        "Completa los campos obligatorios (Nombre, DNI, Celular).";
      return;
    }

    const montoInicial = formatSolesForPayload(
      montoOtro?.value,
      montoSel?.value ?? ""
    );

    const payload = {
      nombreCompleto: nombre,
      dni,
      celular,
      correo: val(form.correo.value),
      comentario: val(form.comentario.value),
      montoInicial, // "S/.3,000"|"S/.4,000.50"|"al_contado"|null
      tiempoCompra: val(form.tiempoCompra?.value), // 'inmediata'|'a_futuro'|null
      anuncio: val(form.anuncio.value),
      tipoRegistro: val(form.tipoRegistro?.value) || "manual",
      source: "crm-manual",
      submittedAt: new Date().toISOString(),
    };

    try {
      setLoading(true);
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(
          `Error ${res.status}: ${t || "No se pudo registrar el lead."}`
        );
      }

      // \u00C9xito: mensaje y cerrar a los 2s
      msg.textContent = "\u2705 Registro Exitoso";
      setTimeout(() => {
        closeModal();
        refreshBtn?.click();
      }, 2000);
    } catch (err) {
      console.error(err);
      msg.textContent =
        "\u26A0\uFE0F Ocurri\u00F3 un error al enviar el lead. Reintenta en unos segundos.";
    } finally {
      setLoading(false);
    }
  });
})();

// Transici\u00F3n entre p\u00E1ginas con overlay (animaciones CSS)
(function () {
  const overlay = document.getElementById("pageTrans");
  if (!overlay) return;

  // Animaci\u00F3n de ENTRADA al llegar desde otra p\u00E1gina
  if (sessionStorage.getItem("pt-coming") === "1") {
    sessionStorage.removeItem("pt-coming");
    requestAnimationFrame(() => {
      overlay.classList.add("enter");
      const onEnterEnd = () => {
        overlay.classList.remove("enter");
      };
      overlay.addEventListener("animationend", onEnterEnd, { once: true });
      // Fallback por si no dispara el evento
      setTimeout(onEnterEnd, 350);
    });
  }

  function navigateWithFx(href) {
    // Evita navegar si ya est\u00E1s en la misma ruta
    if (new URL(href, location.href).pathname === location.pathname) return;

    const go = () => {
      sessionStorage.setItem("pt-coming", "1");
      location.href = href;
    };

    overlay.classList.add("leave");
    overlay.addEventListener("animationend", go, { once: true });
    // Fallback de seguridad
    setTimeout(go, 350);
  }

  // Intercepta <a data-nav> (Leads/M\u00E9tricas del men\u00FA)
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-nav]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    e.preventDefault();
    navigateWithFx(a.href);
  });
})();

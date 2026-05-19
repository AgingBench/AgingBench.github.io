/* ============================================================
   Lightbox — click any [data-zoomable] image to enlarge.
   Close with: click outside, click the × button, or press Esc.
   No deps. Mounts on every page that includes the script + the
   #lightbox overlay markup.
   ============================================================ */
(function () {
  "use strict";

  const overlay = document.getElementById("lightbox");
  if (!overlay) return;
  const img      = overlay.querySelector("#lightbox-image");
  const caption  = overlay.querySelector("#lightbox-caption");
  const closeBtn = overlay.querySelector(".lightbox-close");

  function open(src, alt) {
    img.src = src;
    img.alt = alt || "";
    caption.textContent = alt || "";
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    // Defer the .is-open class so the CSS transition fires.
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    document.body.style.overflow = "hidden";
  }

  function close() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    // Hide after the fade-out animation completes
    setTimeout(() => {
      overlay.hidden = true;
      img.src = "";
      caption.textContent = "";
      document.body.style.overflow = "";
    }, 200);
  }

  // Bind every zoomable image
  document.querySelectorAll("[data-zoomable]").forEach((el) => {
    el.style.cursor = "zoom-in";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      open(el.currentSrc || el.src, el.alt);
    });
  });

  // Close on overlay backdrop click (but not on the image itself)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener("click", close);

  // Esc to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });
})();

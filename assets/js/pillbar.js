/* ============================================================
   AgingBench · sticky pill-bar in-page nav

   Mounts on any page with <nav class="page-pillbar"> containing
   anchor links like <a href="#section-id">…</a>.
     - Highlights the section currently in view
     - Smooth-scrolls on click and updates URL hash
     - Auto-scrolls the active pill into view if the bar overflows
   ============================================================ */
(function () {
  "use strict";
  const links = document.querySelectorAll(".page-pillbar a[href^='#']");
  if (!links.length) return;

  const sections = new Map(); // section element -> anchor element
  links.forEach(a => {
    const id = a.getAttribute("href").slice(1);
    const sec = document.getElementById(id);
    if (sec) sections.set(sec, a);
  });
  if (!sections.size) return;

  // Highlight the section that's most centered in the viewport
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        links.forEach(a => a.classList.remove("is-active"));
        const a = sections.get(entry.target);
        if (a) {
          a.classList.add("is-active");
          // Keep the active pill visible if the bar is scrolled horizontally
          a.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }
      }
    });
  }, { rootMargin: "-30% 0px -60% 0px" });

  sections.forEach((_, sec) => observer.observe(sec));

  // Smooth-scroll on click; offset for the sticky bar height
  links.forEach(a => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href").slice(1);
      const sec = document.getElementById(id);
      if (!sec) return;
      e.preventDefault();
      sec.scrollIntoView({ behavior: "smooth", block: "start" });
      history.pushState(null, "", "#" + id);
    });
  });
})();

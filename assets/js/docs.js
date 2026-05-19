// Scroll-spy for the docs sidebar.
// Highlights the sidebar link whose section is currently in view.
(function () {
  const links = Array.from(document.querySelectorAll(".docs-side-nav a[data-spy]"));
  if (!links.length) return;

  const byId = new Map();
  const sections = [];
  for (const a of links) {
    const id = a.dataset.spy;
    const el = document.getElementById(id);
    if (!el) continue;
    byId.set(id, a);
    sections.push(el);
  }
  if (!sections.length) return;

  let activeId = null;
  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    for (const a of links) a.classList.toggle("active", a.dataset.spy === id);
  }

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.target.offsetTop - b.target.offsetTop);
      if (visible.length) {
        setActive(visible[0].target.id);
        return;
      }
      // Nothing crossing the band: fall back to the last section whose top
      // is above the band. Keeps the highlight stable between intersections.
      const y = window.scrollY + window.innerHeight * 0.25;
      let cur = sections[0];
      for (const s of sections) {
        if (s.offsetTop <= y) cur = s;
        else break;
      }
      setActive(cur.id);
    },
    {
      // a horizontal band near the top of the viewport
      rootMargin: "-15% 0px -70% 0px",
      threshold: 0,
    }
  );
  sections.forEach((s) => io.observe(s));

  // Initial state: respect the URL hash if present, otherwise the first section.
  const hashId = window.location.hash.replace(/^#/, "");
  if (hashId && byId.has(hashId)) setActive(hashId);
  else setActive(sections[0].id);
})();

(() => {
  const tabs = document.querySelectorAll('.demo-tab');
  const panels = document.querySelectorAll('.demo-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      panels.forEach((p) =>
        p.classList.toggle('active', p.dataset.panel === target)
      );
    });
  });

  const copyBtn = document.getElementById('copy-bibtex');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const block = document.getElementById('bibtex-block');
      if (!block) return;
      try {
        await navigator.clipboard.writeText(block.textContent.trim());
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => (copyBtn.textContent = original), 1800);
      } catch (e) {
        copyBtn.textContent = 'Copy failed';
      }
    });
  }
})();

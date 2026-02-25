(() => {
  const TAB_MAP = {
    smm: 'smm.html',
    siparis: 'siparis.html',
    sikayet: 'sikayet.html',
    rakip: 'rakip.html',
    resim: 'resim.html'
  };

  function initTabs({ root, frame, onChange }) {
    const buttons = Array.from(root.querySelectorAll('.tab-btn'));

    function setActive(tab) {
      buttons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
      frame.src = TAB_MAP[tab];
      frame.dataset.tab = tab;
      onChange?.(tab, TAB_MAP[tab]);
    }

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => setActive(btn.dataset.tab));
    });

    return {
      setActive,
      reload() {
        if (frame.src) frame.src = frame.src;
      }
    };
  }

  window.PatpatTabs = { initTabs };
})();

window.addEventListener('DOMContentLoaded', () => window.PatpatPuter?.autoMount?.({ page: 'Tabs', rootSelector: '.tabs-bar', enableImage: false }));

(() => {
  async function initOptionsPuter() {
    const modelSel = document.getElementById('aiModel');
    if (!modelSel) return;

    const suggested = ['gpt-4o','gpt-4o-mini','gpt-4-turbo','claude-3-5-sonnet','gemini-1.5-pro','deepseek-v3'];
    suggested.forEach((m) => {
      if (![...modelSel.options].some((o) => o.value === m)) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSel.appendChild(opt);
      }
    });

    const active = window.PatpatPuter?.getModel?.() || 'gpt-4o';
    modelSel.value = active;

    modelSel.addEventListener('change', async () => {
      await window.PatpatPuter?.setModel?.(modelSel.value || 'gpt-4o');
    });

    window.PatpatPuter?.autoMount?.({ page: 'Options', rootSelector: '.container', enableImage: false });
  }

  window.addEventListener('DOMContentLoaded', initOptionsPuter);
})();

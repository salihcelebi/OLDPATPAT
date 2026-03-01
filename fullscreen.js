(() => {
  async function openFullscreen(url) {
    const tab = await chrome.tabs.create({ url, active: true });
    return tab;
  }

  function requestIframeFullscreen(iframe) {
    const doc = iframe?.contentDocument;
    const el = doc?.documentElement;
    if (el?.requestFullscreen) return el.requestFullscreen();
    return Promise.resolve();
  }

  window.PatpatFullscreen = { openFullscreen, requestIframeFullscreen };
})();

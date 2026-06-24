(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const { alwaysOn } = await browser.storage.local.get('alwaysOn');

  document.getElementById('chk-always').checked = !!alwaysOn;

  document.getElementById('btn-toggle').addEventListener('click', () => {
    browser.tabs.sendMessage(tab.id, { type: 'toggle' });
    window.close();
  });

  document.getElementById('chk-always').addEventListener('change', e => {
    const val = e.target.checked;
    browser.storage.local.set({ alwaysOn: val });
    browser.tabs.sendMessage(tab.id, { type: 'setAlwaysOn', value: val });
  });
})();

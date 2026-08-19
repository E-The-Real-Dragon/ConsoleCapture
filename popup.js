const statusEl = document.getElementById("status");

function setStatus(text) {
  statusEl.textContent = text || "";
}

async function getTab() {
  const q = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return q?.[0] || null;
}

async function refresh() {
  const tab = await getTab();
  if (!tab?.id) {
    setStatus("No active tab.");
    return;
  }
  let host = tab.url || "tab";
  try {
    host = new URL(tab.url).hostname;
  } catch {
    /* keep */
  }
  try {
    const st = await chrome.runtime.sendMessage({ type: "ccStatus", tabId: tab.id });
    setStatus(host + " — " + (st?.count || 0) + " line(s) buffered.");
  } catch {
    setStatus(host + " — could not read buffer.");
  }
}

document.getElementById("btnSave").addEventListener("click", async () => {
  const tab = await getTab();
  if (!tab?.id) {
    setStatus("Open a normal page first.");
    return;
  }
  setStatus("Saving…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "ccSave", tabId: tab.id });
    setStatus(res?.message || res?.error || "Done.");
  } catch (err) {
    setStatus(String(err?.message || err));
  }
});

document.getElementById("btnClear").addEventListener("click", async () => {
  const tab = await getTab();
  if (!tab?.id) return;
  await chrome.runtime.sendMessage({ type: "ccClear", tabId: tab.id });
  setStatus("Buffer cleared. Reload the page to record again.");
});

refresh();

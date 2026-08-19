// ConsoleCapture — keep a per-tab log buffer and write an HTML dump.

const MAX_PER_TAB = 4000;
/** @type {Map<number, object[]>} */
const buffers = new Map();

function bufFor(tabId) {
  if (!buffers.has(tabId)) buffers.set(tabId, []);
  return buffers.get(tabId);
}

function addRecs(tabId, recs) {
  if (typeof tabId !== "number" || !Array.isArray(recs) || !recs.length) return;
  const buf = bufFor(tabId);
  for (const r of recs) buf.push(r);
  if (buf.length > MAX_PER_TAB) buf.splice(0, buf.length - MAX_PER_TAB);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function argText(arg) {
  if (!arg || typeof arg !== "object") return String(arg);
  if (arg.t === "array") {
    return "[" + (arg.v || []).map(argText).join(", ") + "]";
  }
  if (arg.t === "object" && arg.v && typeof arg.v === "object" && !arg.v.t) {
    try {
      return JSON.stringify(arg.v);
    } catch {
      return "[object]";
    }
  }
  return String(arg.v ?? "");
}

function recLine(rec) {
  return (rec.args || []).map(argText).join(" ");
}

async function listFamilyExtensions() {
  if (!chrome.management?.getAll) return [];
  try {
    const all = await chrome.management.getAll();
    return all
      .filter(
        (e) =>
          e.enabled &&
          e.type === "extension" &&
          /^(AdHaven|AdDrawer|PageVault|DeskDrawer|ConsoleCapture)\b/i.test(e.name || "")
      )
      .map((e) => ({
        name: e.name,
        version: e.version,
        id: e.id,
        enabled: e.enabled
      }));
  } catch {
    return [];
  }
}

function buildHtml(meta, recs) {
  const rows = recs
    .map((r) => {
      const line = esc(recLine(r));
      const stack = r.stack ? `<pre class="stack">${esc(r.stack)}</pre>` : "";
      return `<tr class="lv-${esc(r.level)}">
  <td>${esc(r.ts)}</td>
  <td>${esc(r.level)}</td>
  <td>${esc(r.frame || "")}</td>
  <td>${esc(r.source || "")}</td>
  <td>${line}${stack}</td>
</tr>`;
    })
    .join("\n");

  const json = JSON.stringify({ meta, recs }, null, 2);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Console capture — ${esc(meta.host || "page")}</title>
  <style>
    body { font: 14px/1.4 "Segoe UI", system-ui, sans-serif; margin: 1.2rem; background: #111; color: #eee; }
    h1 { font-size: 1.2rem; }
    .meta { background: #1b1b1b; padding: 10px 12px; border-radius: 8px; }
    .meta div { margin: 3px 0; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border-bottom: 1px solid #333; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { color: #9ad; }
    .lv-error td { color: #ff8a8a; }
    .lv-warn td { color: #ffd27a; }
    .stack { white-space: pre-wrap; font-size: 11px; color: #aaa; margin: 6px 0 0; }
    code, pre { font-family: Consolas, "Cascadia Mono", monospace; }
  </style>
</head>
<body>
  <h1>Console capture for Grok</h1>
  <p>This file is a snapshot of console output from one tab. The JSON block at the bottom is the same data.</p>
  <div class="meta">
    <div><strong>URL:</strong> ${esc(meta.url)}</div>
    <div><strong>Title:</strong> ${esc(meta.title)}</div>
    <div><strong>Host:</strong> ${esc(meta.host)}</div>
    <div><strong>Saved:</strong> ${esc(meta.savedAt)}</div>
    <div><strong>User agent:</strong> ${esc(meta.userAgent)}</div>
    <div><strong>Family extensions:</strong> ${esc(
      (meta.extensions || []).map((e) => e.name + " " + e.version).join(" | ") || "none listed"
    )}</div>
    <div><strong>Records:</strong> ${recs.length}</div>
  </div>
  <table>
    <thead><tr><th>Time</th><th>Level</th><th>Frame</th><th>Source</th><th>Message</th></tr></thead>
    <tbody>
${rows || '<tr><td colspan="5">No records captured. Reload the page with ConsoleCapture loaded, then reproduce the issue and save again.</td></tr>'}
    </tbody>
  </table>
  <h2>JSON for Grok</h2>
  <p>Copy everything inside the next block if asked.</p>
  <pre id="capture-json">${esc(json)}</pre>
</body>
</html>`;
}

async function captureTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["capture-main.js"],
      world: "MAIN"
    });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["capture-isolated.js"]
    });
  } catch {
    /* restricted page or no host access */
  }
  let dumped = [];
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "ccDumpPage" });
    if (Array.isArray(res?.recs)) dumped = res.recs;
  } catch {
    /* page may not have the content script yet */
  }
  if (dumped.length) addRecs(tabId, dumped);
  const recs = (buffers.get(tabId) || []).slice();
  const ext = await listFamilyExtensions();
  let host = "";
  try {
    host = new URL(tab.url || "").hostname;
  } catch {
    host = "";
  }
  const meta = {
    url: tab.url || "",
    title: tab.title || "",
    host,
    savedAt: new Date().toISOString(),
    userAgent: navigator.userAgent || "",
    extensions: ext,
    tabId
  };
  const html = buildHtml(meta, recs);
  const stamp = meta.savedAt.replace(/[:.]/g, "-").slice(0, 19);
  const filename = `ConsoleCapture/${stamp}_${(host || "page").replace(/[^\w.-]+/g, "_")}.html`;
  const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);
  const downloadId = await new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false, conflictAction: "uniquify" }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });
  return {
    ok: true,
    count: recs.length,
    path: filename,
    downloadId,
    message:
      recs.length
        ? `Saved ${recs.length} console line(s) to Downloads\\${filename.replace(/\//g, "\\")}`
        : `Saved an empty capture. ConsoleCapture must be running before the errors happen. Reload ConsoleCapture, reload the YouTube tab, wait for ads, then save again. File: Downloads\\${filename.replace(/\//g, "\\")}`
  };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  buffers.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ccAddLogs") {
    addRecs(sender.tab?.id, message.recs);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "ccSave") {
    (async () => {
      const tabId = message.tabId ?? sender.tab?.id;
      if (typeof tabId !== "number") {
        sendResponse({ ok: false, error: "No tab." });
        return;
      }
      try {
        sendResponse(await captureTab(tabId));
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true;
  }
  if (message?.type === "ccStatus") {
    const tabId = message.tabId;
    sendResponse({
      ok: true,
      count: typeof tabId === "number" ? (buffers.get(tabId) || []).length : 0
    });
    return false;
  }
  if (message?.type === "ccClear") {
    if (typeof message.tabId === "number") buffers.delete(message.tabId);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

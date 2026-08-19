// ConsoleCapture — isolated world. Forward MAIN-world records to the worker.
(() => {
  if (window.__ereConsoleCaptureIso) return;
  window.__ereConsoleCaptureIso = true;

  const SOURCE = "ere-console-capture";
  const pending = [];
  let dumpWait = null;

  function send(recs) {
    if (!recs || !recs.length) return;
    try {
      chrome.runtime.sendMessage({ type: "ccAddLogs", recs }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      pending.push(...recs);
    }
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== SOURCE) return;
    if (d.type === "log" && d.rec) send([d.rec]);
    if (d.type === "dump-ok" && dumpWait) {
      dumpWait(Array.isArray(d.recs) ? d.recs : []);
      dumpWait = null;
    }
  });

  chrome.runtime.onMessage.addListener((message, _s, sendResponse) => {
    if (message?.type !== "ccDumpPage") return;
    const timer = setTimeout(() => {
      if (dumpWait) {
        dumpWait([]);
        dumpWait = null;
      }
    }, 400);
    dumpWait = (recs) => {
      clearTimeout(timer);
      sendResponse({ ok: true, recs });
    };
    try {
      window.postMessage({ source: SOURCE, type: "dump" }, "*");
    } catch {
      sendResponse({ ok: false, recs: [] });
    }
    return true;
  });
})();

// ConsoleCapture — MAIN world. Wrap page console + window errors.
// Print through the native console so we never call into a site's own
// console interceptor (that made grok.com's Errors panel blame this file).
(() => {
  if (window.__ereConsoleCaptureMain) return;
  window.__ereConsoleCaptureMain = true;

  const SOURCE = "ere-console-capture";
  const MAX = 2000;
  const METHODS = ["log", "info", "debug", "warn", "error", "trace"];
  const buf = [];
  let reentry = false;

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return "";
    }
  }

  function nativeMethods() {
    const out = {};
    let iframe = null;
    try {
      iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "display:none!important;width:0;height:0;border:0";
      const root = document.documentElement || document.head;
      if (root) root.appendChild(iframe);
      const c = iframe.contentWindow && iframe.contentWindow.console;
      for (const m of METHODS) {
        if (c && typeof c[m] === "function") out[m] = c[m].bind(c);
      }
    } catch {
      /* ignore */
    }
    try {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch {
      /* ignore */
    }
    for (const m of METHODS) {
      if (typeof out[m] !== "function" && typeof console[m] === "function") {
        try {
          out[m] = Function.prototype.bind.call(console[m], console);
        } catch {
          out[m] = console[m];
        }
      }
    }
    return out;
  }

  const natives = nativeMethods();

  function serializeOne(value, depth) {
    if (value == null) return { t: value === null ? "null" : "undefined", v: String(value) };
    const typ = typeof value;
    if (typ === "string") return { t: "string", v: value };
    if (typ === "number" || typ === "boolean" || typ === "bigint") {
      return { t: typ, v: String(value) };
    }
    if (typ === "symbol") return { t: "symbol", v: String(value) };
    if (typ === "function") {
      return { t: "function", v: Function.prototype.toString.call(value).slice(0, 500) };
    }
    if (value instanceof Error) {
      return {
        t: "error",
        v: value.name + ": " + value.message,
        stack: String(value.stack || "")
      };
    }
    if (typeof Element !== "undefined" && value instanceof Element) {
      const tag = value.tagName || "element";
      const id = value.id ? "#" + value.id : "";
      const cls = value.className && typeof value.className === "string"
        ? "." + value.className.trim().split(/\s+/).slice(0, 4).join(".")
        : "";
      return { t: "element", v: "<" + String(tag).toLowerCase() + id + cls + ">" };
    }
    if (depth > 3) return { t: "object", v: "[Object]" };
    try {
      if (Array.isArray(value)) {
        return {
          t: "array",
          v: value.slice(0, 30).map((x) => serializeOne(x, depth + 1))
        };
      }
      const out = {};
      const keys = Object.keys(value).slice(0, 40);
      for (const k of keys) {
        try {
          out[k] = serializeOne(value[k], depth + 1);
        } catch (err) {
          out[k] = { t: "error", v: String(err && err.message ? err.message : err) };
        }
      }
      return { t: "object", v: out };
    } catch {
      try {
        return { t: "object", v: String(value) };
      } catch {
        return { t: "object", v: "[unserializable]" };
      }
    }
  }

  function push(level, args, extra) {
    const rec = {
      ts: nowIso(),
      href: String(location.href || ""),
      frame: window === window.top ? "top" : "iframe",
      level,
      args: Array.from(args || []).map((a) => serializeOne(a, 0)),
      stack: extra && extra.stack ? String(extra.stack) : "",
      source: extra && extra.source ? String(extra.source) : "page-console"
    };
    buf.push(rec);
    if (buf.length > MAX) buf.splice(0, buf.length - MAX);
    try {
      window.postMessage({ source: SOURCE, type: "log", rec }, "*");
    } catch {
      /* ignore */
    }
  }

  function wrap(method, level) {
    const print = natives[method];
    if (typeof print !== "function") return;
    console[method] = function () {
      if (!reentry) {
        reentry = true;
        try {
          push(level, arguments);
        } catch {
          /* never break the page */
        } finally {
          reentry = false;
        }
      }
      return print.apply(console, arguments);
    };
  }

  wrap("log", "log");
  wrap("info", "info");
  wrap("debug", "debug");
  wrap("warn", "warn");
  wrap("error", "error");
  wrap("trace", "trace");

  window.addEventListener("error", (ev) => {
    try {
      if (ev && ev.filename === undefined && ev.message === undefined && ev.error == null) {
        const t = ev.target;
        const src = t && (t.src || t.href) ? String(t.src || t.href) : "";
        push("error", ["Resource failed to load: " + src], { source: "window.error-resource" });
        return;
      }
      const err = ev.error;
      push(
        "error",
        [err || ev.message || "Uncaught error"],
        {
          stack: err && err.stack ? err.stack : "",
          source: "window.error " + String(ev.filename || "") + ":" + String(ev.lineno || "")
        }
      );
    } catch {
      /* ignore */
    }
  }, true);

  window.addEventListener("unhandledrejection", (ev) => {
    try {
      push("error", [ev.reason || "Unhandled promise rejection"], {
        stack: ev.reason && ev.reason.stack ? ev.reason.stack : "",
        source: "unhandledrejection"
      });
    } catch {
      /* ignore */
    }
  });

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== SOURCE || d.type !== "dump") return;
    try {
      window.postMessage({ source: SOURCE, type: "dump-ok", recs: buf.slice() }, "*");
    } catch {
      /* ignore */
    }
  });
})();

"use strict";
(() => {
  // node_modules/.pnpm/@open-wxa+wxa-runner-core@0.13.0/node_modules/@open-wxa/wxa-runner-core/dist/web.mjs
  function toJs(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  }
  function findPluginPage(build, pagePath) {
    for (const plugin of build.plugins) {
      const prefix = `__plugin__/${plugin.provider}/`;
      if (plugin.pages.includes(pagePath)) return { plugin, innerPath: pagePath.slice(prefix.length) };
    }
    return null;
  }
  function pluginScriptUrl(plugin, file) {
    return `/__wxa__/plugin/${encodeURIComponent(plugin.provider)}/${encodeURIComponent(plugin.version)}/${file}`;
  }
  function enableHotUpdate(hot) {
    return hot ? `<script>if (typeof __virtualDOM__ !== 'undefined' && __virtualDOM__.enableUpdateWxAppCode) __virtualDOM__.enableUpdateWxAppCode();<\/script>
` : "";
  }
  function appserviceHtml(build, launch2, options) {
    const wxConfig = {
      ...build.wxConfig,
      appLaunchInfo: { scene: 1001, path: launch2.path, query: launch2.query },
      ...options.isolated ? { isIsolateContext: true } : {}
    };
    const v = build.version;
    const pluginUrls = build.plugins.map((plugin) => pluginScriptUrl(plugin, "appservice.js"));
    const moduleUrls = build.modules.map((id) => `/__wxa__/module/${encodeURI(id)}?v=${v}`);
    const bootstrapUrl = `/__wxa__/service-bootstrap.js?v=${v}`;
    if (options.isolated) {
      const scripts = [...pluginUrls, ...moduleUrls, bootstrapUrl];
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>appservice</title>
<script>var __wxConfig = ${toJs(wxConfig)};<\/script>
<script src="/__wxa__/runtime/frame.js" data-kind="service" data-app-service="${escapeHtml(JSON.stringify(scripts))}"${options.hot ? ' data-hot="1"' : ""}><\/script>
<script src="/__baselib__/WAServiceMainContext.js"><\/script>
</head>
<body></body>
</html>`;
    }
    const modules = [...pluginUrls, ...moduleUrls].map((src) => `<script src="${src}"><\/script>`).join("\n");
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>appservice</title>
<script>var __wxConfig = ${toJs(wxConfig)};<\/script>
<script src="/__wxa__/runtime/frame.js" data-kind="service"><\/script>
<script src="/__baselib__/WAService.js"><\/script>
${enableHotUpdate(options.hot)}<script>
if (typeof define !== 'function') {
  console.error('[wxa-runner] \u57FA\u7840\u5E93\u6CA1\u6709\u5B8C\u6210\u521D\u59CB\u5316\uFF08define \u4E0D\u5B58\u5728\uFF09\uFF0C\u5F53\u524D\u57FA\u7840\u5E93\u7248\u672C\u53EF\u80FD\u4E0D\u53D7\u652F\u6301');
}
<\/script>
${modules}
<script src="${bootstrapUrl}"><\/script>
<script>parent.__wxaHost.frameLoaded('service', 0);<\/script>
</head>
<body></body>
</html>`;
  }
  function subcontextHtml(id, empty) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>subcontext ${id}</title>
<script src="/__wxa__/runtime/frame.js" data-kind="service" data-context-id="${id}"><\/script>
${empty ? "" : '<script src="/__baselib__/WASubContext.js"><\/script>\n'}<script>parent.__wxaContexts.loaded(${id});<\/script>
</head>
<body></body>
</html>`;
  }
  function webviewHtml(build, pagePath, webviewId, options) {
    const id = Number(webviewId) || 0;
    return `<!DOCTYPE html>
<html>
<head>
${webviewHead(build, pagePath, id, options.scripts)}
${enableHotUpdate(options.hot)}<script src="/__wxa__/page-frame.js?v=${build.version}"><\/script>
${pageWindow(build, pagePath).disableScroll ? "<style>body{overflow-y:hidden}</style>" : ""}
</head>
<body>
${scriptTags(options.scripts, "body")}<script>
(function () {
  var path = ${toJs(pagePath)};
  if (typeof __wxAppCode__[path + '.wxss'] === 'function') __wxAppCode__[path + '.wxss']();
  var generateFunc = $gwx('./' + path + '.wxml');
  if (generateFunc) {
    document.dispatchEvent(new CustomEvent('generateFuncReady', { detail: { generateFunc: generateFunc } }));
  } else {
    document.body.innerText = './' + path + '.wxml not found';
    console.error('[wxa-runner] ./' + path + '.wxml not found');
  }
  parent.__wxaHost.frameLoaded('webview', ${id});
})();
<\/script>
</body>
</html>`;
  }
  function workerScript(build, baseLib) {
    const modules = build.workerModules.map((id) => `/__wxa__/module/${encodeURI(id)}?v=${build.version}`);
    const prelude = `var __wxConfig = ${toJs(build.wxConfig)}; __wxConfig.env.USER_DATA_PATH = location.origin + "/__wxa__/usr/" + new URL(location.href).searchParams.get("session");
importScripts('/__wxa__/runtime/worker.js');
`;
    if (!baseLib.hasWorker) {
      const message = `[wxa-runner] \u57FA\u7840\u5E93 ${baseLib.version} \u91CC\u6CA1\u6709 WAWorker.js\uFF0CWorker \u4E0D\u80FD\u8FD0\u884C\u3002\u6362\u7528\u5F00\u53D1\u8005\u5DE5\u5177\u4E0B\u8F7D\u7684\u57FA\u7840\u5E93\uFF0C\u6216\u5347\u7EA7 wxa-runner \u5E26\u4E0A\u65B0\u7684\u5185\u7F6E\u57FA\u7840\u5E93`;
      return `${prelude}throw new Error(${toJs(message)});
`;
    }
    return `${prelude}var __wxaConsole = self.console;
importScripts('/__baselib__/WAWorker.js');
self.console = __wxaConsole;
importScripts(${modules.map((url) => toJs(url)).join(", ")});
`;
  }
  function pluginWebviewHtml(build, plugin, innerPath, pagePath, webviewId, options = {}) {
    const id = Number(webviewId) || 0;
    const html22 = plugin.files.get(`/${innerPath}.html`);
    const page = html22 ? new TextDecoder().decode(html22) : `<script>console.error(${JSON.stringify(`[wxa-runner] \u63D2\u4EF6 ${plugin.alias} \u91CC\u6CA1\u6709\u9875\u9762 ${innerPath}`)})<\/script>`;
    return `<!DOCTYPE html>
<html>
<head>
${webviewHead(build, pagePath, id, options.scripts)}
<script src="${pluginScriptUrl(plugin, "pageframe.js")}"><\/script>
${pageWindow(build, pagePath).disableScroll ? "<style>body{overflow-y:hidden}</style>" : ""}
</head>
<body>
${scriptTags(options.scripts, "body")}${page}
<script>parent.__wxaHost.frameLoaded('webview', ${id});<\/script>
</body>
</html>`;
  }
  function pageWindow(build, pagePath) {
    return { ...build.wxConfig.global?.window, ...build.wxConfig.page?.[pagePath + ".html"]?.window };
  }
  function webviewHead(build, pagePath, id, scripts) {
    const wxConfig = { ...build.wxConfig, window: pageWindow(build, pagePath) };
    return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${escapeHtml(pagePath)}</title>
<!-- \u5C0F\u7A0B\u5E8F\u6E32\u67D3\u5C42\u7684\u9ED8\u8BA4\u5B57\u53F7\u662F 16px\uFF1B\u4E0D\u58F0\u660E\u7684\u8BDD\u4F1A\u7EE7\u627F\u6D4F\u89C8\u5668\u8BBE\u7F6E\u91CC\u7684\u9ED8\u8BA4\u5B57\u53F7\u3002\u653E\u5728\u6700\u524D\u9762\uFF0C\u57FA\u7840\u5E93\u548C\u9875\u9762\u6837\u5F0F\u90FD\u80FD\u8986\u76D6\u5B83 -->
<style>html{font-size:16px}</style>
<!-- \u771F\u673A\u7684\u6EDA\u52A8\u6761\u662F\u4E0D\u5360\u5E03\u5C40\u7684\u6D6E\u5C42\uFF1B\u684C\u9762\u6D4F\u89C8\u5668\u7684\u5E38\u89C4\u6EDA\u52A8\u6761\u548C\u81EA\u5B9A\u4E49 ::-webkit-scrollbar \u4F1A\u6324\u7A84\u9875\u9762\uFF0C\u4E00\u5F8B\u9690\u85CF\u3002
     scrollbar-width \u4F18\u5148\u4E8E ::-webkit-scrollbar\uFF0C\u9875\u9762\u6837\u5F0F\u4E0D\u4F1A\u518D\u628A\u6EDA\u52A8\u6761\u52A0\u56DE\u6765 -->
<style>*{scrollbar-width:none}::-webkit-scrollbar{display:none}</style>
<!-- \u903B\u8F91\u5C42\u5EFA\u7684 2d\u3001webgl \u753B\u5E03\u642C\u8FDB wx-canvas \u540E\u94FA\u6EE1\u5B83\uFF08\u89C1 frame.ts \u7684 moveCanvasesIntoPages\uFF09\u3002
     \u57FA\u7840\u5E93\u8FD8\u4F1A\u6309\u903B\u8F91\u5C42\u91CC\u7684\u5E03\u5C40\u6539\u5B83\u7684\u4F4D\u7F6E\u548C\u663E\u9690\uFF0C\u8FD9\u91CC\u4E00\u5F8B\u538B\u4F4F\uFF1B\u89E6\u6478\u7167\u5E38\u4EA4\u7ED9 wx-canvas \u81EA\u5DF1\u7684 canvas -->
<style>.wxa-service-canvas{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;visibility:inherit!important;pointer-events:none}</style>
<script>var __wxConfig = ${toJs(wxConfig)};<\/script>
<script src="/__wxa__/runtime/frame.js" data-kind="webview" data-webview-id="${id}"><\/script>
${scriptTags(scripts, "head")}<script src="/__baselib__/WAWebview.js"><\/script>`;
  }
  function scriptTags(scripts, position) {
    return (scripts ?? []).filter((script2) => (script2.position ?? "body") === position).map((script2) => script2.src !== void 0 ? `<script src="${escapeHtml(script2.src)}"><\/script>
` : `<script>${script2.content.replace(/<\/script/gi, "<\\/script")}<\/script>
`).join("");
  }
  function escapeHtml(text) {
    return text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  }
  var PLUGIN_SCRIPT = /^\/__wxa__\/plugin\/([^/]+)\/([^/]+)\/(appservice\.js|pageframe\.js)$/;
  function routeApp(source2, url) {
    const { build } = source2;
    const pathname = safeDecode(url.pathname);
    if (pathname === null) return null;
    const query = url.searchParams;
    switch (pathname) {
      case "/__wxa__/appservice.html": {
        const launchPath = (query.get("path") || "").replace(/^\//, "");
        const launch2 = build.pages.includes(launchPath) ? { path: launchPath, query: Object.fromEntries(new URLSearchParams(query.get("query") || "")) } : { path: build.pages[0], query: {} };
        return html(appserviceHtml(build, launch2, { hot: source2.hot, isolated: source2.isolated }));
      }
      case "/__wxa__/subcontext.html": {
        const id = Number(query.get("id"));
        if (!Number.isInteger(id) || id <= 0) return { status: 400, type: "text", body: "\u5B50\u4E0A\u4E0B\u6587 id \u65E0\u6548" };
        return html(subcontextHtml(id, query.get("empty") === "1"));
      }
      case "/__wxa__/worker.js":
        return js(workerScript(build, source2.baseLib));
      case "/__wxa__/service-bootstrap.js":
        return js(build.serviceBootstrap);
      case "/__wxa__/service-templates.js":
        return js(build.serviceTemplates);
      case "/__wxa__/page-templates.js":
        return js(build.pageTemplates);
      case "/__wxa__/page-styles.js":
        return js(build.pageStyles);
      case "/__wxa__/page-frame.js":
        return js(build.pageFrame);
    }
    const webview = /^\/__wxa__\/webview\/(.+)\.html$/.exec(pathname);
    if (webview) {
      const pagePath = webview[1];
      if (!build.pages.includes(pagePath)) return null;
      const webviewId = Number(query.get("id"));
      const pluginPage = findPluginPage(build, pagePath);
      return html(pluginPage ? pluginWebviewHtml(build, pluginPage.plugin, pluginPage.innerPath, pagePath, webviewId, { scripts: source2.webviewScripts }) : webviewHtml(build, pagePath, webviewId, { hot: source2.hot, scripts: source2.webviewScripts }));
    }
    const pluginScript = PLUGIN_SCRIPT.exec(pathname);
    if (pluginScript) {
      const [, provider, version, file] = pluginScript;
      const code = build.plugins.find((plugin) => plugin.provider === provider && plugin.version === version)?.files.get(`/${file}`);
      return code ? { status: 200, type: "js", body: code } : null;
    }
    const pluginFile = /^\/__plugin__\/([^/]+)(\/.+)$/.exec(pathname);
    if (pluginFile) {
      const file = build.plugins.find((plugin) => plugin.provider === pluginFile[1])?.files.get(pluginFile[2]);
      return file ? { status: 200, type: extname(pluginFile[2]) || "application/octet-stream", body: file } : null;
    }
    const module = /^\/__wxa__\/module\/(.+\.js)$/.exec(pathname);
    if (module) {
      const id = module[1];
      if (!build.modules.includes(id) && !build.workerModules.includes(id)) {
        return { status: 404, type: "js", body: `console.error(${JSON.stringify(`[wxa-runner] \u6A21\u5757 ${id} \u4E0D\u5B58\u5728`)})` };
      }
      return js(source2.moduleScript(id));
    }
    return null;
  }
  var MIME_TYPES = {
    html: "text/html; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    text: "text/plain; charset=utf-8",
    json: "application/json; charset=utf-8",
    css: "text/css; charset=utf-8",
    wxss: "text/plain; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    wasm: "application/wasm"
  };
  function mimeType(type) {
    if (type.includes("/")) return type;
    return MIME_TYPES[type.replace(/^\./, "").toLowerCase()] ?? "application/octet-stream";
  }
  function extname(filePath) {
    const match = /\.[^./]+$/.exec(filePath);
    return match ? match[0] : "";
  }
  function html(body) {
    return { status: 200, type: "html", body };
  }
  function js(body) {
    return { status: 200, type: "js", body };
  }
  function safeDecode(pathname) {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return null;
    }
  }
  var storeSequence = 0;
  var textEncoder = new TextEncoder();
  var textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
  function normalizeEncoding(encoding) {
    switch (String(encoding).toLowerCase()) {
      case "utf8":
      case "utf-8":
        return "utf8";
      case "utf16le":
      case "utf-16le":
      case "ucs2":
      case "ucs-2":
        return "utf16le";
      case "latin1":
      case "binary":
        return "latin1";
      case "ascii":
        return "ascii";
      case "base64":
      case "base64url":
        return String(encoding).toLowerCase();
      case "hex":
        return "hex";
      default:
        throw new Error(`Unknown encoding: ${encoding}`);
    }
  }
  function encodeText(text, encoding) {
    const format = normalizeEncoding(encoding);
    if (format === "utf8") return textEncoder.encode(text);
    if (format === "base64" || format === "base64url") {
      let base64 = text.split("=", 1)[0].replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
      if (base64.length % 4 === 1) base64 = base64.slice(0, -1);
      base64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    }
    if (format === "hex") {
      const bytes2 = [];
      for (let index = 0; index + 1 < text.length; index += 2) {
        const pair = text.slice(index, index + 2);
        if (!/^[\da-f]{2}$/i.test(pair)) break;
        bytes2.push(parseInt(pair, 16));
      }
      return new Uint8Array(bytes2);
    }
    const bytes = new Uint8Array(text.length * (format === "utf16le" ? 2 : 1));
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (format === "utf16le") {
        bytes[index * 2] = code & 255;
        bytes[index * 2 + 1] = code >>> 8;
      } else bytes[index] = code & 255;
    }
    return bytes;
  }
  function decodeText(bytes, encoding) {
    const format = normalizeEncoding(encoding);
    if (format === "utf8") return textDecoder.decode(bytes);
    if (format === "hex") return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const chunks2 = [];
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      const chunk = bytes.subarray(offset, offset + 32768);
      const codes = [];
      for (let index = 0; index < chunk.length; index++) {
        if (format === "utf16le") {
          if (index + 1 < chunk.length) codes.push(chunk[index] | chunk[++index] << 8);
        } else codes.push(format === "ascii" ? chunk[index] & 127 : chunk[index]);
      }
      chunks2.push(String.fromCharCode(...codes));
    }
    const text = chunks2.join("");
    if (format === "base64") return btoa(text);
    if (format === "base64url") return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return text;
  }
  var FileStore = class {
    /** @param roots 预先创建的目录（如用户目录）。rmdir 不能删除它们和它们的上级目录：删掉之后再写 USER_DATA_PATH 都会失败 */
    constructor(roots = []) {
      this.etagPrefix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++storeSequence}-${Math.random().toString(36).slice(2)}`;
      this.version = 0;
      this.nodes = /* @__PURE__ */ new Map([["/", { dir: true, data: new Uint8Array(0), mtime: Date.now(), etag: "" }]]);
      this.operations = {
        readFile: ({ filePath, encoding }) => {
          const data = this.read(filePath);
          return encoding === void 0 ? { data: decodeText(data, "base64"), binary: true } : { data: decodeText(data, encoding) };
        },
        writeFile: (args) => this.writeEncoded(args, false),
        appendFile: (args) => this.writeEncoded(args, true),
        copyFile: ({ srcPath, destPath }) => {
          this.write(destPath, this.read(srcPath));
          return {};
        },
        rename: ({ oldPath, newPath }) => {
          const source2 = this.normalize(oldPath);
          const target = this.normalize(newPath);
          const node = this.existing(oldPath);
          this.assertNotRoot(source2);
          this.assertNotRoot(target);
          if (source2 === target) return {};
          const parent = target.slice(0, target.lastIndexOf("/")) || "/";
          if (!this.nodes.get(parent)?.dir) throw new Error(`no such file or directory ${newPath}`);
          if (node.dir && target.startsWith(source2 + "/")) throw new Error("invalid argument: directory moved into itself");
          const destination = this.nodes.get(target);
          if (destination) {
            if (destination.dir !== node.dir) throw new Error(`incompatible file type ${newPath}`);
            if (destination.dir && this.readdir(target).length) throw new Error(`directory not empty ${newPath}`);
          }
          const entries = [...this.nodes].filter(([key]) => key === source2 || node.dir && key.startsWith(source2 + "/"));
          for (const [key] of entries) this.nodes.delete(key);
          for (const [key, value] of entries) this.nodes.set(target + key.slice(source2.length), value);
          return {};
        },
        access: ({ path }) => {
          this.existing(path);
          return {};
        },
        stat: ({ path }) => {
          const node = this.existing(path);
          const stats = {
            mode: node.dir ? 16877 : 33188,
            size: node.data.length,
            lastAccessedTime: Math.floor(node.mtime / 1e3),
            lastModifiedTime: Math.floor(node.mtime / 1e3)
          };
          return { stats, ...stats };
        },
        getFileInfo: ({ filePath }) => ({ size: this.read(filePath).length }),
        mkdir: ({ dirPath, recursive }) => {
          this.mkdir(dirPath, !!recursive);
          return {};
        },
        readdir: ({ dirPath }) => ({ files: this.readdir(dirPath) }),
        unlink: ({ filePath }) => {
          this.remove(filePath, { dir: false });
          return {};
        },
        rmdir: ({ dirPath, recursive }) => {
          this.assertNotRoot(dirPath);
          this.remove(dirPath, { dir: true, recursive: !!recursive });
          return {};
        }
      };
      this.roots = roots.map((root2) => this.normalize(root2));
      for (const root2 of this.roots) this.mkdir(root2, true);
    }
    normalize(filePath) {
      const stripped = String(filePath || "").replace(/^[a-z]+:\/\/[^/]*/i, "");
      const parts = [];
      for (const part of stripped.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
      }
      return "/" + parts.join("/");
    }
    stat(filePath) {
      return this.nodes.get(this.normalize(filePath));
    }
    mkdir(dirPath, recursive = false) {
      const target = this.normalize(dirPath);
      if (this.nodes.has(target)) throw new Error(`file already exists ${dirPath}`);
      const parent = target.slice(0, target.lastIndexOf("/")) || "/";
      if (!this.nodes.get(parent)?.dir) {
        if (!recursive) throw new Error(`no such file or directory ${dirPath}`);
        this.mkdir(parent, true);
      }
      this.nodes.set(target, { dir: true, data: new Uint8Array(0), mtime: Date.now(), etag: "" });
    }
    write(filePath, input, append = false) {
      const data = typeof input === "string" ? textEncoder.encode(input) : new Uint8Array(input);
      const target = this.normalize(filePath);
      const parent = target.slice(0, target.lastIndexOf("/")) || "/";
      if (!this.nodes.get(parent)?.dir) throw new Error(`no such file or directory ${filePath}`);
      const existing = this.nodes.get(target);
      if (existing?.dir) throw new Error(`illegal operation on a directory ${filePath}`);
      let contents = data;
      if (append && existing) {
        contents = new Uint8Array(existing.data.length + data.length);
        contents.set(existing.data);
        contents.set(data, existing.data.length);
      }
      this.nodes.set(target, { dir: false, data: contents, mtime: Date.now(), etag: `${this.etagPrefix}-${++this.version}` });
    }
    read(filePath) {
      const node = this.stat(filePath);
      if (!node) throw new Error(`no such file or directory, open ${filePath}`);
      if (node.dir) throw new Error(`illegal operation on a directory ${filePath}`);
      return node.data;
    }
    readdir(dirPath) {
      const target = this.normalize(dirPath);
      if (!this.nodes.get(target)?.dir) throw new Error(`no such file or directory ${dirPath}`);
      const prefix = target === "/" ? "/" : target + "/";
      return [...this.nodes.keys()].filter((key) => key.startsWith(prefix) && key !== target && !key.slice(prefix.length).includes("/")).map((key) => key.slice(prefix.length));
    }
    remove(filePath, options) {
      const target = this.normalize(filePath);
      const node = this.nodes.get(target);
      if (!node) throw new Error(`no such file or directory ${filePath}`);
      if (node.dir !== options.dir) throw new Error(options.dir ? `not a directory ${filePath}` : `operation not permitted ${filePath}`);
      if (node.dir) {
        const children = this.readdir(target);
        if (children.length && !options.recursive) throw new Error(`directory not empty ${filePath}`);
        for (const key of [...this.nodes.keys()]) if (key.startsWith(target + "/")) this.nodes.delete(key);
      }
      this.nodes.delete(target);
    }
    /** 文件 API 经开发服务器调用的操作，参数和返回值的字段名与基础库一致 */
    execute(operation, args) {
      if (!Object.prototype.hasOwnProperty.call(this.operations, operation)) {
        throw new Error(`unsupported filesystem operation ${operation}`);
      }
      return this.operations[operation](args);
    }
    writeEncoded(args, append) {
      this.write(args.filePath, encodeText(args.data ?? "", args.binary ? "base64" : args.encoding || "utf8"), append);
      return {};
    }
    existing(filePath) {
      const node = this.stat(filePath);
      if (!node) throw new Error(`no such file or directory ${filePath}`);
      return node;
    }
    assertNotRoot(dirPath) {
      const target = this.normalize(dirPath);
      const prefix = target === "/" ? "/" : target + "/";
      if (this.roots.some((root2) => root2 === target || root2.startsWith(prefix))) {
        throw new Error(`operation not permitted ${dirPath}`);
      }
    }
  };

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/providerAppResources.js
  var MAX_PROVIDER_APP_RESOURCE_MESSAGE_BYTES = 16 * 1024 * 1024;

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/boundedRequestBuffer.js
  var REQUEST_BUFFER_MAX_BYTES = 32 * 1024 * 1024;
  var REQUEST_BUFFER_MAX_FIELD_BYTES = 8 * 1024 * 1024;
  var textEncoder2 = new TextEncoder();

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/proxyPermissions.js
  var ALLOWED_ORIGINS = ["*://localhost/*", "*://127.0.0.1/*"];
  var ALLOWED_ORIGINS_LIST = [...ALLOWED_ORIGINS];

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/domScrolling.js
  function scrollElementInPage(direction, distance, targetLabel, containerPolicy = "self") {
    let element = this?.nodeType === 3 ? this.parentElement : this;
    const targetDocument = element?.nodeType === 9 ? element : null;
    if (targetDocument)
      element = targetDocument.scrollingElement;
    if (!element || element.isConnected === false) {
      return { error: "Cannot resolve scroll container: " + targetLabel };
    }
    const startingElement = element;
    let ancestorDistance = 0;
    function scrollMetrics(candidate) {
      const scrollTop = Number(candidate?.scrollTop);
      const scrollHeight = Number(candidate?.scrollHeight);
      const clientHeight = Number(candidate?.clientHeight);
      if (!Number.isFinite(scrollTop) || !Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight)) {
        return null;
      }
      const ownerDocument = candidate.ownerDocument;
      const isRootScroller = !!ownerDocument && candidate === ownerDocument.scrollingElement;
      const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
      let overflowAllowsScroll = true;
      try {
        const overflowY = ownerDocument?.defaultView?.getComputedStyle(candidate).overflowY;
        if (!isRootScroller && (overflowY === "visible" || overflowY === "clip")) {
          overflowAllowsScroll = false;
        }
      } catch {
      }
      return {
        scrollTop,
        scrollHeight,
        clientHeight,
        maxScrollTop,
        isRootScroller,
        usable: isRootScroller || maxScrollTop > 0 && overflowAllowsScroll
      };
    }
    function documentFallback(documentRef) {
      const windowRef = documentRef.defaultView;
      const visited = /* @__PURE__ */ new Set();
      const viewportWidth = Number(windowRef?.innerWidth) || Number(element?.clientWidth) || 0;
      const viewportHeight = Number(windowRef?.innerHeight) || Number(element?.clientHeight) || 0;
      const points = [
        [viewportWidth / 2, viewportHeight / 2],
        [viewportWidth / 2, viewportHeight * 0.75],
        [viewportWidth / 2, viewportHeight * 0.25]
      ];
      function containerDepth(candidate) {
        if (candidate === documentRef.body || candidate === documentRef.documentElement)
          return 0;
        let depth = 0;
        let cursor = candidate;
        while (cursor && cursor !== documentRef.body && cursor !== documentRef.documentElement) {
          depth += 1;
          cursor = cursor.parentElement;
        }
        return depth;
      }
      function canMove(metrics2) {
        if (direction === "up" || direction === "top")
          return metrics2.scrollTop > 0;
        return metrics2.scrollTop < metrics2.maxScrollTop;
      }
      let sampledPageContainer;
      for (const [x, y] of points) {
        let candidate = null;
        try {
          candidate = documentRef.elementFromPoint?.(x, y) ?? null;
        } catch {
        }
        while (candidate && candidate.nodeType === 1) {
          if (!visited.has(candidate)) {
            visited.add(candidate);
            const candidateMetrics = scrollMetrics(candidate);
            if (candidateMetrics?.usable && candidateMetrics.maxScrollTop > 0 && canMove(candidateMetrics)) {
              const resolved = {
                element: candidate,
                metrics: candidateMetrics,
                distance: containerDepth(candidate)
              };
              if (candidate === documentRef.body || candidate === documentRef.documentElement) {
                sampledPageContainer ??= resolved;
              } else {
                return resolved;
              }
            }
          }
          candidate = candidate.parentElement;
        }
      }
      if (sampledPageContainer)
        return sampledPageContainer;
      let best;
      const candidates = Array.from(documentRef.querySelectorAll?.("*") ?? []).slice(0, 1e4);
      for (const candidate of candidates) {
        const candidateMetrics = scrollMetrics(candidate);
        if (!candidateMetrics?.usable || candidateMetrics.maxScrollTop <= 0 || !canMove(candidateMetrics)) {
          continue;
        }
        let rect;
        let style;
        try {
          rect = candidate.getBoundingClientRect();
          style = windowRef?.getComputedStyle(candidate);
        } catch {
          continue;
        }
        if (!rect || rect.width <= 0 || rect.height <= 0 || style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") {
          continue;
        }
        const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const area = visibleWidth * visibleHeight;
        if (area <= 0)
          continue;
        const depth = containerDepth(candidate);
        if (!best || depth < best.distance || depth === best.distance && area > best.area) {
          best = { element: candidate, metrics: candidateMetrics, distance: depth, area };
        }
      }
      return best ? { element: best.element, metrics: best.metrics, distance: best.distance } : null;
    }
    function selectorFor(candidate) {
      const documentRef = candidate?.ownerDocument;
      if (!documentRef || candidate.nodeType !== 1)
        return "";
      if (candidate === documentRef.documentElement)
        return "html";
      if (candidate === documentRef.body)
        return "body";
      const escapeCss = (value) => documentRef.defaultView?.CSS?.escape ? documentRef.defaultView.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (character) => "\\" + character);
      if (candidate.id) {
        const idSelector = "#" + escapeCss(String(candidate.id));
        try {
          if (documentRef.querySelectorAll(idSelector).length === 1)
            return idSelector;
        } catch {
        }
      }
      const path = [];
      let cursor = candidate;
      while (cursor && cursor.nodeType === 1 && path.length < 8) {
        const tag = String(cursor.tagName || "").toLowerCase();
        if (!tag)
          break;
        const parent = cursor.parentElement;
        if (!parent) {
          path.unshift(tag);
          break;
        }
        const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === cursor.tagName);
        const index = siblings.indexOf(cursor) + 1;
        path.unshift(siblings.length > 1 ? tag + ":nth-of-type(" + index + ")" : tag);
        cursor = parent;
        if (cursor === documentRef.documentElement) {
          path.unshift("html");
          break;
        }
      }
      return path.join(" > ");
    }
    let metrics = scrollMetrics(element);
    if (!metrics)
      return { error: "Element is not scrollable: " + targetLabel };
    if (targetDocument) {
      const fallback = documentFallback(targetDocument);
      if (fallback) {
        element = fallback.element;
        metrics = fallback.metrics;
        ancestorDistance = fallback.distance;
      }
    }
    if (!metrics.usable && containerPolicy === "nearest") {
      let candidate = element.parentElement;
      while (candidate) {
        ancestorDistance += 1;
        const candidateMetrics = scrollMetrics(candidate);
        if (candidateMetrics?.usable) {
          element = candidate;
          metrics = candidateMetrics;
          break;
        }
        candidate = candidate.parentElement;
      }
    }
    if (!metrics.usable && !metrics.isRootScroller) {
      return {
        error: "Element is not scrollable: " + targetLabel + (containerPolicy === "nearest" ? " (no scrollable ancestor found)" : "")
      };
    }
    let targetTop;
    switch (direction) {
      case "top":
        targetTop = 0;
        break;
      case "bottom":
        targetTop = metrics.maxScrollTop;
        break;
      case "up":
        targetTop = Math.max(0, metrics.scrollTop - Math.abs(distance));
        break;
      default:
        targetTop = Math.min(metrics.maxScrollTop, metrics.scrollTop + Math.abs(distance));
        break;
    }
    if (typeof element.scrollTo === "function") {
      try {
        element.scrollTo({
          top: targetTop,
          left: Number(element.scrollLeft) || 0,
          behavior: "instant"
        });
      } catch {
        element.scrollTop = targetTop;
      }
    } else {
      element.scrollTop = targetTop;
    }
    const actualScrollTop = Number(element.scrollTop);
    if (!metrics.isRootScroller && targetTop !== metrics.scrollTop && actualScrollTop === metrics.scrollTop) {
      return { error: "Element is not scrollable: " + targetLabel };
    }
    return {
      scrollY: Math.round(actualScrollTop),
      scrollHeight: metrics.scrollHeight,
      clientHeight: metrics.clientHeight,
      maxScrollY: Math.round(metrics.maxScrollTop),
      scrollYBefore: Math.round(metrics.scrollTop),
      scrollYAfter: Math.round(actualScrollTop),
      moved: actualScrollTop !== metrics.scrollTop,
      atTop: actualScrollTop <= 0,
      atBottom: actualScrollTop >= metrics.maxScrollTop,
      target: targetLabel,
      resolvedContainer: targetDocument && element === targetDocument.body && element !== startingElement ? "document-body" : targetDocument && element !== startingElement ? "document-descendant" : element === startingElement ? "self" : "nearest-scrollable-ancestor",
      ancestorDistance,
      ...targetDocument && element !== startingElement ? { containerSelector: selectorFor(element) } : {}
    };
  }
  var SCROLL_ELEMENT_IN_PAGE_SOURCE = scrollElementInPage.toString();

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/domInspection.js
  function inspectElementsInPage(selector, filter, styles, maxResults, invalidSelectorHint, includeOuterHTML = false) {
    const context = this?.nodeType === 3 ? this.parentElement : this;
    const documentRef = context?.nodeType === 9 ? context : context?.ownerDocument;
    if (!documentRef)
      return { error: "page_inspect cannot resolve the target document" };
    const scanLimit = 1e4;
    let candidates;
    if (context?.nodeType === 9) {
      const effectiveSelector = selector ?? "*";
      try {
        candidates = Array.from(documentRef.querySelectorAll(effectiveSelector));
      } catch (error) {
        return {
          error: 'Invalid CSS selector "' + effectiveSelector + '": ' + (error instanceof Error ? error.message : String(error)) + ". " + invalidSelectorHint
        };
      }
    } else if (context?.nodeType === 1 && context.isConnected !== false) {
      candidates = [context];
    } else {
      return { error: "page_inspect target is detached from the document" };
    }
    const candidateCount = candidates.length;
    const scanTruncated = filter !== "all" && candidateCount > scanLimit;
    candidates = filter === "all" ? candidates.slice(0, maxResults) : scanTruncated ? candidates.slice(0, scanLimit) : candidates;
    const windowRef = documentRef.defaultView;
    const viewportWidth = Number(windowRef?.innerWidth) || 0;
    const viewportHeight = Number(windowRef?.innerHeight) || 0;
    function round(value) {
      return Math.round(value * 1e3) / 1e3;
    }
    function controlState(element) {
      const state = {};
      for (const name of ["checked", "selected", "pressed", "expanded", "disabled", "readonly"]) {
        const value = element.getAttribute?.("aria-" + name);
        if (value === "true" || value === "false" || value === "mixed" && (name === "checked" || name === "pressed")) {
          state[name] = { value: value === "mixed" ? "mixed" : value === "true", source: "aria" };
        }
      }
      const tag = String(element.tagName || "").toLowerCase();
      const type = String(element.type || "").toLowerCase();
      if (tag === "input" && (type === "checkbox" || type === "radio")) {
        state.checked = {
          value: type === "checkbox" && element.indeterminate ? "mixed" : Boolean(element.checked),
          source: "native"
        };
      }
      if (tag === "option")
        state.selected = { value: Boolean(element.selected), source: "native" };
      if (["button", "input", "select", "textarea", "option", "optgroup", "fieldset"].includes(tag)) {
        const disabled = element.matches?.(":disabled") ?? Boolean(element.disabled);
        if (disabled || !state.disabled)
          state.disabled = { value: disabled, source: "native" };
      }
      if (tag === "textarea" || tag === "input" && [
        "text",
        "search",
        "tel",
        "url",
        "email",
        "password",
        "date",
        "month",
        "week",
        "time",
        "datetime-local",
        "number"
      ].includes(type)) {
        if (element.readOnly || !state.readonly) {
          state.readonly = { value: Boolean(element.readOnly), source: "native" };
        }
      }
      return state;
    }
    function escapeCss(value) {
      if (windowRef?.CSS && typeof windowRef.CSS.escape === "function") {
        return windowRef.CSS.escape(value);
      }
      return value.replace(/[^a-zA-Z0-9_-]/g, (character) => "\\" + character);
    }
    function selectorFor(element) {
      if (element.id) {
        const idSelector = "#" + escapeCss(String(element.id));
        try {
          if (documentRef.querySelectorAll(idSelector).length === 1)
            return idSelector;
        } catch {
        }
      }
      const path = [];
      let cursor = element;
      while (cursor && cursor.nodeType === 1 && path.length < 8) {
        const tag = String(cursor.tagName || "").toLowerCase();
        if (!tag)
          break;
        const parent = cursor.parentElement;
        if (!parent) {
          path.unshift(tag);
          break;
        }
        const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === cursor.tagName);
        const index = siblings.indexOf(cursor) + 1;
        path.unshift(siblings.length > 1 ? tag + ":nth-of-type(" + index + ")" : tag);
        cursor = parent;
        if (cursor === documentRef.documentElement) {
          path.unshift("html");
          break;
        }
      }
      return path.join(" > ");
    }
    function readStyle(style, property) {
      const cssValue = style.getPropertyValue?.(property);
      if (cssValue)
        return String(cssValue);
      const camelName = property.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      return String(style[camelName] ?? "");
    }
    function isScrollable(element, style) {
      const canScrollX = Number(element.scrollWidth) > Number(element.clientWidth) && !["visible", "clip"].includes(String(style.overflowX));
      const canScrollY = Number(element.scrollHeight) > Number(element.clientHeight) && !["visible", "clip"].includes(String(style.overflowY));
      return canScrollX || canScrollY;
    }
    function nearestScrollContainer(element) {
      let candidate = element;
      let ancestorDistance = 0;
      while (candidate && candidate.nodeType === 1) {
        const style = windowRef.getComputedStyle(candidate);
        if (isScrollable(candidate, style)) {
          return {
            selector: selectorFor(candidate),
            tag: String(candidate.tagName || "").toLowerCase(),
            ancestorDistance,
            scrollWidth: Number(candidate.scrollWidth) || 0,
            scrollHeight: Number(candidate.scrollHeight) || 0,
            clientWidth: Number(candidate.clientWidth) || 0,
            clientHeight: Number(candidate.clientHeight) || 0,
            scrollLeft: Number(candidate.scrollLeft) || 0,
            scrollTop: Number(candidate.scrollTop) || 0,
            overflowX: String(style.overflowX || ""),
            overflowY: String(style.overflowY || "")
          };
        }
        candidate = candidate.parentElement;
        ancestorDistance += 1;
      }
      return void 0;
    }
    function hitTargetInfo(element, rect, visible, style) {
      const left = Math.max(0, Number(rect.left) || 0);
      const right = Math.min(viewportWidth, Number(rect.right) || 0);
      const top = Math.max(0, Number(rect.top) || 0);
      const bottom = Math.min(viewportHeight, Number(rect.bottom) || 0);
      const x = round(left + Math.max(0, right - left) / 2);
      const y = round(top + Math.max(0, bottom - top) / 2);
      let hit = null;
      try {
        hit = visible ? documentRef.elementFromPoint?.(x, y) ?? null : null;
        const visited = /* @__PURE__ */ new Set();
        while (hit?.shadowRoot?.elementFromPoint && !visited.has(hit)) {
          visited.add(hit);
          const inner = hit.shadowRoot.elementFromPoint(x, y);
          if (!inner || inner === hit)
            break;
          hit = inner;
        }
      } catch {
      }
      let composedHit = hit;
      while (composedHit && composedHit !== element) {
        composedHit = composedHit.parentElement || composedHit.getRootNode?.().host;
      }
      const topmost = !!hit && (!!composedHit || element.contains?.(hit));
      const target = hit ? {
        selector: selectorFor(hit),
        tag: String(hit.tagName || "").toLowerCase(),
        text: String(hit.innerText ?? hit.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120)
      } : void 0;
      return {
        point: { x, y },
        topmost,
        receivesPointerEvents: visible && style.pointerEvents !== "none" && topmost,
        ...target ? { target } : {},
        ...!topmost && target ? { occludedBy: target } : {}
      };
    }
    const matches = [];
    let count = filter === "all" ? candidateCount : 0;
    for (const element of candidates) {
      const style = windowRef.getComputedStyle(element);
      const scrollWidth = Number(element.scrollWidth) || 0;
      const scrollHeight = Number(element.scrollHeight) || 0;
      const clientWidth = Number(element.clientWidth) || 0;
      const clientHeight = Number(element.clientHeight) || 0;
      const horizontalOverflow = Math.max(0, scrollWidth - clientWidth);
      const verticalOverflow = Math.max(0, scrollHeight - clientHeight);
      const scrollable = isScrollable(element, style);
      const included = filter === "all" || filter === "overflowing" && (horizontalOverflow > 0 || verticalOverflow > 0) || filter === "horizontal-overflow" && horizontalOverflow > 0 || filter === "vertical-overflow" && verticalOverflow > 0 || filter === "scrollable" && scrollable;
      if (!included)
        continue;
      if (filter !== "all")
        count += 1;
      if (matches.length >= maxResults)
        continue;
      const rect = element.getBoundingClientRect();
      const opacity = Number(style.opacity);
      const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && (!Number.isFinite(opacity) || opacity > 0) && rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
      const computedStyle = {};
      for (const property of styles)
        computedStyle[property] = readStyle(style, property);
      const scrollContainer = nearestScrollContainer(element);
      const hitTest = hitTargetInfo(element, rect, visible, style);
      const state = controlState(element);
      matches.push({
        selector: selectorFor(element),
        tag: String(element.tagName || "").toLowerCase(),
        text: String(element.innerText ?? element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 240),
        visible,
        hitTest,
        ...Object.keys(state).length ? { state } : {},
        boundingBox: {
          x: round(rect.x),
          y: round(rect.y),
          width: round(rect.width),
          height: round(rect.height),
          top: round(rect.top),
          right: round(rect.right),
          bottom: round(rect.bottom),
          left: round(rect.left)
        },
        computedStyle,
        scroll: {
          scrollWidth,
          scrollHeight,
          clientWidth,
          clientHeight,
          overflowX: String(style.overflowX || ""),
          overflowY: String(style.overflowY || ""),
          horizontalOverflow,
          verticalOverflow
        },
        ...scrollContainer ? { scrollContainer } : {},
        ...includeOuterHTML ? { outerHTML: String(element.outerHTML ?? "").slice(0, 3e3) } : {}
      });
    }
    return {
      ...selector !== void 0 ? { selector } : {},
      filter,
      candidateCount,
      count,
      matches,
      truncated: scanTruncated || count > matches.length,
      ...scanTruncated ? { scanTruncated: true } : {}
    };
  }
  var INSPECT_ELEMENTS_IN_PAGE_SOURCE = inspectElementsInPage.toString();

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/deviceEmulation.js
  function getDeviceChromeViewConfig(emulation) {
    const platform = emulation.platform === "Android" || emulation.platform === "OpenHarmony" ? "android" : "ios";
    const sideBarWidth = getDeviceSideBarWidth(emulation.presetName, emulation.orientation);
    return {
      platform,
      statusBarHeight: sideBarWidth ? 0 : emulation.orientation === "landscape" ? 24 : emulation.safeAreaInsets.top,
      bottomBarHeight: emulation.safeAreaInsets.bottom,
      ...sideBarWidth ? { sideBarWidth } : {},
      safeAreaInsets: { ...emulation.safeAreaInsets },
      cutout: platform === "ios" ? emulation.appearance.cutout : "none"
    };
  }
  var IPHONE_DUO_SIDE_BAR_WIDTH = 84;
  function getDeviceSideBarWidth(preset, orientation) {
    if (preset === "iphone-duo-folded" || preset === "iphone-duo-unfolded" && orientation === "landscape") {
      return IPHONE_DUO_SIDE_BAR_WIDTH;
    }
    return 0;
  }
  var IPHONE_SAFARI_26_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  var IPHONE_SAFARI_27_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1";
  var ANDROID_CHROME_152_USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36";
  var DEVICE_PRESETS = {
    "iphone-duo-folded": {
      width: 466,
      height: 678,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: IPHONE_SAFARI_27_USER_AGENT,
      platform: "iPhone",
      platformVersion: "27.0",
      architecture: "",
      model: "iPhone",
      safeAreaInsets: { top: 0, right: 84, bottom: 34, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 84, bottom: 21, left: 0 },
      appProfileModel: "iPhone Duo",
      appProfileOs: "ios",
      appearance: { cutout: "side-camera" }
    },
    "iphone-duo-unfolded": {
      width: 669,
      height: 951,
      defaultOrientation: "landscape",
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: IPHONE_SAFARI_27_USER_AGENT,
      platform: "iPhone",
      platformVersion: "27.0",
      architecture: "",
      model: "iPhone",
      safeAreaInsets: { top: 80, right: 0, bottom: 34, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 84, bottom: 34, left: 0 },
      appProfileModel: "iPhone Duo",
      appProfileOs: "ios",
      appearance: { cutout: "none" }
    },
    "iphone-17-pro": {
      width: 402,
      height: 874,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: IPHONE_SAFARI_26_USER_AGENT,
      platform: "iPhone",
      platformVersion: "26.0",
      architecture: "",
      model: "iPhone",
      safeAreaInsets: { top: 62, right: 0, bottom: 34, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 62, bottom: 21, left: 62 },
      appProfileModel: "iPhone 17 Pro",
      appProfileOs: "ios",
      appearance: { cutout: "dynamic-island" }
    },
    "iphone-17e": {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: IPHONE_SAFARI_26_USER_AGENT,
      platform: "iPhone",
      platformVersion: "26.0",
      architecture: "",
      model: "iPhone",
      safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 47, bottom: 21, left: 47 },
      appProfileModel: "iPhone 17e",
      appProfileOs: "ios",
      appearance: { cutout: "notch" }
    },
    "pixel-11": {
      width: 412,
      height: 923,
      deviceScaleFactor: 2.625,
      mobile: true,
      userAgent: ANDROID_CHROME_152_USER_AGENT,
      platform: "Android",
      platformVersion: "17",
      architecture: "arm",
      model: "Pixel 11",
      safeAreaInsets: { top: 30, right: 0, bottom: 24, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 24, bottom: 0, left: 24 },
      appProfileModel: "Pixel 11",
      appProfileOs: "android",
      appearance: { cutout: "none" }
    },
    "ipad-mini-a17-pro": {
      width: 744,
      height: 1133,
      deviceScaleFactor: 2,
      // iPad Safari 默认使用 desktop-class UA，但仍保留真实触摸能力。
      mobile: false,
      touch: true,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      platform: "macOS",
      platformVersion: "10.15.7",
      architecture: "x86",
      model: "",
      safeAreaInsets: { top: 24, right: 0, bottom: 20, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 24, bottom: 20, left: 24 },
      appProfileModel: "iPad mini (A17 Pro)",
      appProfileOs: "ios",
      appearance: { cutout: "none" }
    },
    "galaxy-s26": {
      width: 360,
      height: 780,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: ANDROID_CHROME_152_USER_AGENT,
      platform: "Android",
      platformVersion: "16",
      architecture: "arm",
      model: "SM-S942B",
      safeAreaInsets: { top: 30, right: 0, bottom: 24, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 24, bottom: 0, left: 24 },
      appProfileModel: "SM-S942B",
      appProfileOs: "android",
      appearance: { cutout: "none" }
    },
    "pura-x-max": {
      // 单一视口覆盖展开内屏；横屏时即为设备常用的 939 × 664 vp 形态。
      width: 664,
      height: 939,
      deviceScaleFactor: 2.75,
      mobile: true,
      userAgent: "Mozilla/5.0 (Phone;OpenHarmony 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 ArkWeb/6.0.0.42 Mobile",
      platform: "OpenHarmony",
      platformVersion: "6.0",
      architecture: "",
      model: "HUAWEI Pura X Max",
      safeAreaInsets: { top: 30, right: 0, bottom: 24, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 24, bottom: 0, left: 24 },
      appProfileModel: "HUAWEI Pura X Max",
      appProfileOs: "android",
      appearance: { cutout: "none" }
    },
    "iphone-15-pro": {
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      platformVersion: "17.0",
      architecture: "",
      model: "iPhone",
      safeAreaInsets: { top: 59, right: 0, bottom: 34, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 59, bottom: 21, left: 59 },
      appProfileModel: "iPhone 15 Pro",
      appProfileOs: "ios",
      appearance: { cutout: "dynamic-island" }
    },
    "iphone-se": {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      platformVersion: "16.0",
      architecture: "",
      model: "iPhone",
      safeAreaInsets: { top: 20, right: 0, bottom: 0, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      appProfileModel: "iPhone SE",
      appProfileOs: "ios",
      appearance: { cutout: "none" }
    },
    "pixel-8": {
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      mobile: true,
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      platform: "Android",
      platformVersion: "14",
      architecture: "",
      model: "Pixel 8",
      safeAreaInsets: { top: 30, right: 0, bottom: 24, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 24, bottom: 0, left: 24 },
      appProfileModel: "Pixel 8",
      appProfileOs: "android",
      appearance: { cutout: "none" }
    },
    "ipad-mini": {
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      // iPad 现行 Safari UA 默认 desktop class，mobile flag 设 false 以匹配真机表现
      mobile: false,
      touch: true,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "macOS",
      platformVersion: "10.15.7",
      architecture: "x86",
      model: "",
      safeAreaInsets: { top: 24, right: 0, bottom: 20, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 24, bottom: 20, left: 24 },
      appProfileModel: "iPad mini",
      appProfileOs: "ios",
      appearance: { cutout: "none" }
    },
    "galaxy-s23": {
      width: 360,
      height: 780,
      deviceScaleFactor: 3,
      mobile: true,
      userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      platform: "Android",
      platformVersion: "14",
      architecture: "",
      model: "SM-S911B",
      safeAreaInsets: { top: 30, right: 0, bottom: 24, left: 0 },
      landscapeSafeAreaInsets: { top: 0, right: 24, bottom: 0, left: 24 },
      appProfileModel: "SM-S911B",
      appProfileOs: "android",
      appearance: { cutout: "none" }
    }
  };
  function resolveEmulationConfig(input) {
    if (input.preset && !(input.preset in DEVICE_PRESETS)) {
      throw new Error(`set_device_emulation: unknown preset "${input.preset}". Available: ${Object.keys(DEVICE_PRESETS).join(", ")}`);
    }
    const preset = input.preset ? DEVICE_PRESETS[input.preset] : void 0;
    const width = input.width ?? preset?.width;
    const height = input.height ?? preset?.height;
    if (!width || !height) {
      throw new Error('set_device_emulation: must provide either "preset" or both "width" and "height"');
    }
    const mobile = input.mobile ?? preset?.mobile ?? true;
    const orientation = input.orientation ?? preset?.defaultOrientation ?? "portrait";
    const scale = input.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error('set_device_emulation: "scale" must be a finite positive number');
    }
    const [finalWidth, finalHeight] = orientation === "landscape" ? [height, width] : [width, height];
    const userAgent = input.userAgent ?? preset?.userAgent ?? "";
    if (!userAgent) {
      throw new Error('set_device_emulation: "userAgent" is required when no preset is used (preset supplies a default)');
    }
    const safeAreaInsets = orientation === "landscape" ? preset?.landscapeSafeAreaInsets ?? {
      top: preset?.safeAreaInsets.left ?? 0,
      right: preset?.safeAreaInsets.top ?? 0,
      bottom: preset?.safeAreaInsets.right ?? 0,
      left: preset?.safeAreaInsets.bottom ?? 0
    } : preset?.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const appearance = {
      cutout: orientation === "landscape" ? "none" : preset?.appearance.cutout ?? "none"
    };
    return {
      width: finalWidth,
      height: finalHeight,
      deviceScaleFactor: input.deviceScaleFactor ?? preset?.deviceScaleFactor ?? (mobile ? 2 : 1),
      scale,
      mobile,
      userAgent,
      platform: preset?.platform ?? (mobile ? "iPhone" : "macOS"),
      platformVersion: preset?.platformVersion ?? "",
      architecture: preset?.architecture ?? "",
      model: preset?.model ?? "",
      touch: input.touch ?? preset?.touch ?? mobile,
      orientation,
      safeAreaInsets,
      appearance,
      presetName: input.preset
    };
  }

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/rootWebViewNavigation.js
  var SHELL_BODY = btoa('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body></body></html>');
  var MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/pageDragging.js
  function dragBetweenPointsInPage(from, points, pointerType) {
    const target = document.elementFromPoint(from.x, from.y);
    if (!target) {
      return {
        dragged: false,
        steps: 0,
        error: `No element found at drag start point (${from.x}, ${from.y})`
      };
    }
    if (points.length === 0) {
      return { dragged: false, steps: 0, error: "Drag path must contain at least one point" };
    }
    const view = target.ownerDocument.defaultView ?? window;
    const realm = view;
    const pointerId = 1;
    const pointerInit = (point, buttons, pressure) => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      view,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      button: 0,
      buttons,
      pointerId,
      pointerType,
      isPrimary: true,
      pressure,
      width: 1,
      height: 1
    });
    const dispatchPointer = (type, point, buttons, pressure) => {
      if (typeof realm.PointerEvent !== "function")
        return false;
      target.dispatchEvent(new realm.PointerEvent(type, pointerInit(point, buttons, pressure)));
      return true;
    };
    const dispatchMouse = (type, point, buttons) => {
      if (typeof realm.MouseEvent !== "function")
        return false;
      target.dispatchEvent(new realm.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
        button: 0,
        buttons
      }));
      return true;
    };
    const createTouch = (point) => {
      const init = {
        identifier: pointerId,
        target,
        clientX: point.x,
        clientY: point.y,
        screenX: point.x,
        screenY: point.y,
        pageX: point.x + view.scrollX,
        pageY: point.y + view.scrollY,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 0.5
      };
      return typeof realm.Touch === "function" ? new realm.Touch(init) : init;
    };
    const dispatchTouch = (type, point) => {
      if (typeof realm.TouchEvent !== "function")
        return false;
      const touch = createTouch(point);
      const activeTouches = type === "touchend" ? [] : [touch];
      target.dispatchEvent(new realm.TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch]
      }));
      return true;
    };
    let dispatched = dispatchPointer("pointerdown", from, 1, 0.5);
    dispatched = pointerType === "touch" ? dispatchTouch("touchstart", from) || dispatched : dispatchMouse("mousedown", from, 1) || dispatched;
    for (const point of points) {
      dispatched = dispatchPointer("pointermove", point, 1, 0.5) || dispatched;
      dispatched = pointerType === "touch" ? dispatchTouch("touchmove", point) || dispatched : dispatchMouse("mousemove", point, 1) || dispatched;
    }
    const end = points[points.length - 1];
    dispatched = pointerType === "touch" ? dispatchTouch("touchend", end) || dispatched : dispatchMouse("mouseup", end, 0) || dispatched;
    dispatched = dispatchPointer("pointerup", end, 0, 0) || dispatched;
    return dispatched ? { dragged: true, steps: points.length } : { dragged: false, steps: 0, error: "This page does not support synthetic drag events" };
  }
  var DRAG_BETWEEN_POINTS_IN_PAGE_SOURCE = dragBetweenPointsInPage.toString();

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/pagePressing.js
  var PAGE_PRESS_KEY_DESCRIPTORS = Object.freeze({
    Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    Delete: { key: "Delete", code: "Delete", keyCode: 46 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    Home: { key: "Home", code: "Home", keyCode: 36 },
    End: { key: "End", code: "End", keyCode: 35 },
    PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
    PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
    Space: { key: " ", code: "Space", keyCode: 32, text: " " }
  });

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/axSnapshot.js
  var PAGE_SNAPSHOT_QUERY_MAX_BYTES = 256 * 1024;

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/browserActionProtocol.js
  var SEND_REQUEST_MAX_TOTAL_FILE_BYTES = 40 * 1024 * 1024;
  var SEND_REQUEST_MAX_TOTAL_BASE64_FILE_BYTES = 7 * 1024 * 1024;
  var TAB_ID_REQUIRED_ACTIONS = [
    "tab_checkpoint",
    "capture_checkpoint",
    "get_requests",
    "get_logs",
    "get_events",
    "set_mock",
    "get_mocks",
    "page_screenshot",
    "tab_close",
    "page_click",
    "page_drag",
    "page_type",
    "page_scroll",
    "page_hover",
    "page_eval",
    "page_inspect",
    "page_snapshot",
    "page_press",
    "page_wait",
    "page_navigate",
    "page_upload",
    "page_download",
    "page_frames",
    "set_device_emulation",
    "set_app_profile",
    "set_timezone",
    "run_actions"
  ];
  var TAB_ID_REQUIRED_ACTION_SET = new Set(TAB_ID_REQUIRED_ACTIONS);
  var EXTENSION_BROWSER_ACTIONS = {
    tab_checkpoint: true,
    capture_checkpoint: true,
    get_requests: true,
    get_logs: true,
    get_events: true,
    set_mock: true,
    get_mocks: true,
    set_rule: true,
    get_rules: true,
    get_capabilities: true,
    send_request: true,
    browser_release: true,
    page_screenshot: true,
    tab_open: true,
    tab_close: true,
    tab_list: true,
    tab_group: true,
    page_click: true,
    page_drag: true,
    page_type: true,
    page_scroll: true,
    page_hover: true,
    page_eval: true,
    page_runtime: true,
    page_inspect: true,
    page_snapshot: true,
    page_press: true,
    page_wait: true,
    page_navigate: true,
    page_upload: true,
    page_frames: true,
    set_device_emulation: true,
    set_app_profile: true,
    set_timezone: true,
    get_cookie: true,
    set_cookie: true,
    request_permission: true,
    run_actions: true
  };
  var BROWSER_CAPABILITY_ACTIONS = {
    ...EXTENSION_BROWSER_ACTIONS,
    page_download: true
  };

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/agentChat.js
  var AGENT_CHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  var AGENT_CHAT_MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

  // skills/wechat-miniprogram/scripts/runtime/browserDevice.ts
  function browserDevice(url, viewport2) {
    let selection;
    try {
      const parsed = JSON.parse(url.searchParams.get("deviceSelection") || "null");
      if (parsed && typeof parsed === "object") selection = parsed;
    } catch {
    }
    const preset = selection?.preset === "ios-adaptive" ? "iphone-17-pro" : selection?.preset === "android-adaptive" ? "pixel-11" : selection?.preset;
    const orientation = selection?.orientation;
    const configured = typeof preset === "string" && Object.hasOwn(DEVICE_PRESETS, preset) && (orientation === void 0 || orientation === "portrait" || orientation === "landscape");
    const name = configured ? preset : "iphone-17-pro";
    const config = resolveEmulationConfig({ enabled: true, preset: name, ...configured && (orientation === "portrait" || orientation === "landscape") ? { orientation } : {} });
    const chrome = getDeviceChromeViewConfig(config);
    const adaptive = !configured || selection?.preset === "ios-adaptive" || selection?.preset === "android-adaptive";
    const device = {
      model: DEVICE_PRESETS[name].appProfileModel,
      system: `${chrome.platform === "ios" ? "iOS" : "Android"} ${config.platformVersion}`,
      platform: chrome.platform,
      screenWidth: adaptive ? viewport2.width : config.width,
      screenHeight: adaptive ? viewport2.height : config.height,
      pixelRatio: config.deviceScaleFactor,
      statusBarHeight: chrome.statusBarHeight,
      safeAreaBottom: chrome.bottomBarHeight
    };
    return { device, chrome, adaptive, configured };
  }

  // node_modules/.pnpm/@mearl+browser-core@3.0.0-beta.10/node_modules/@mearl/browser-core/dist/deviceChromeView.js
  function installDeviceChromeView(root2, config, options = {}) {
    const ownerDocument = root2.ownerDocument;
    const browser = ownerDocument.defaultView ?? window;
    const NativeDate = browser.Date;
    const nativeNow = NativeDate.now.bind(NativeDate);
    const labels = {
      screenshot: "Screenshot",
      copied: "Copied",
      downloaded: "Downloaded",
      captureFailed: "Capture failed",
      bottomAction: "App simulation settings",
      ...options.labels
    };
    const state = {
      statusBarVisible: true,
      statusBarBackground: "#ffffff",
      textColor: "#0f131a",
      bottomActionEnabled: false,
      timeOffsetMs: null,
      ...options.initialState
    };
    const normalizedBarHeight = (value) => {
      if (!Number.isFinite(value))
        return 0;
      return Math.min(200, Math.max(0, Math.round(value)));
    };
    const statusBarHeight = normalizedBarHeight(config.statusBarHeight);
    const bottomBarHeight = normalizedBarHeight(config.bottomBarHeight);
    const sideBarWidth = normalizedBarHeight(config.sideBarWidth ?? 0);
    const cutout = config.platform === "ios" ? config.cutout : "none";
    const sideBarTimeTop = cutout === "side-camera" ? 77 : 25;
    const sideBarIndicatorsTop = cutout === "side-camera" ? 101 : 49;
    const cutoutMarkup = cutout === "none" ? "" : cutout === "dynamic-island" ? `<button id="device-cutout" type="button" data-kind="${cutout}" data-state="idle"><svg id="cutout-camera" viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 5.5 7.7 3.8h4.6l1.2 1.7h2.2c1 0 1.8.8 1.8 1.8v7c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8v-7c0-1 .8-1.8 1.8-1.8z"/><circle cx="10" cy="10.5" r="3.2"/></svg><svg id="cutout-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.2 3.2 7.8-7.8"/></svg></button>` : `<span id="device-cutout" data-kind="${cutout}" aria-hidden="true"></span>`;
    const statusIndicatorsMarkup = sideBarWidth > 0 ? `<svg id="duo-status-icon" viewBox="0 0 48 48" aria-hidden="true"><path id="duo-battery-arc" d="M6.7 34A20 20 0 1 1 41.3 34"/><g id="duo-wifi"><path d="M15.5 21Q24 13.5 32.5 21M19.5 25.5Q24 21.5 28.5 25.5"/><path d="M21.5 29.5Q24 27.4 26.5 29.5L24.7 31.7Q24 32.5 23.3 31.7Z"/></g><g id="duo-signal-arc"><circle cx="14" cy="41.3" r="1.8"/><circle cx="21" cy="43.8" r="1.8"/><circle cx="28" cy="43.8" r="1.8"/><circle cx="35" cy="41.3" r="1.8"/></g></svg>` : `<svg id="signal" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="6" width="3" height="6" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
          <svg id="wifi" viewBox="1 3.8 22 17.2"><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M12 20h.01"/></svg>
          <svg id="battery" viewBox="0 0 28 13"><rect id="battery-outline" x=".65" y=".65" width="23" height="11.7" rx="3.1"/><rect id="battery-level" x="2.35" y="2.35" width="19.6" height="8.3" rx="1.7"/><path id="battery-cap" d="M25 4.1c1.1.35 1.7 1.15 1.7 2.4s-.6 2.05-1.7 2.4z"/></svg>`;
    root2.innerHTML = `<style>
    :host {
      all: initial !important;
      position: fixed !important;
      inset: 0 !important;
      display: block !important;
      z-index: 2147483600 !important;
      overflow: visible !important;
      pointer-events: none !important;
      contain: layout style !important;
      isolation: isolate !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      pointer-events: none !important;
    }
    #device-chrome {
      position: absolute;
      inset: 0;
      overflow: visible;
      color: #0f131a;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", sans-serif;
      font-synthesis: none;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
      user-select: none;
    }
    .system-bar {
      position: absolute;
      left: 0;
      right: 0;
      background: #ffffff;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    #status-bar {
      top: 0;
      height: calc(${statusBarHeight}px + 1px);
      min-height: 0;
      overflow: visible;
    }
    #status-content {
      position: relative;
      z-index: 1;
      height: ${statusBarHeight}px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 21px 0 27px;
      font-size: 15px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: -.25px;
      font-variant-numeric: tabular-nums;
    }
    #time {
      position: relative;
      z-index: 1;
      min-width: 54px;
      text-align: left;
    }
    #status-indicators {
      position: relative;
      z-index: 1;
      height: 14px;
      display: flex;
      align-items: center;
      gap: 6.5px;
    }
    #status-indicators svg {
      display: block;
      overflow: visible;
      fill: none;
      stroke: currentColor;
    }
    #signal {
      width: 18px;
      height: 12px;
      fill: currentColor !important;
      stroke: none !important;
    }
    #wifi {
      width: 18px;
      height: 14px;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    #battery {
      width: 28px;
      height: 13px;
      stroke-width: 1.25;
    }
    #battery-outline { opacity: .42; }
    #battery-level { fill: currentColor; stroke: none; }
    #battery-cap { fill: currentColor; stroke: none; opacity: .45; }
    #device-cutout {
      appearance: none;
      position: absolute;
      left: 50%;
      z-index: 2;
      display: var(--mearl-device-cutout-display, block);
      border: 0;
      padding: 0;
      max-height: 100%;
      transform: translateX(-50%);
      background: #000;
      color: #fff;
      box-shadow: inset 0 0 0 .5px rgba(255, 255, 255, .08);
    }
    #device-cutout[data-kind="dynamic-island"] {
      top: 50%;
      width: 126px;
      height: min(37px, calc(100% - 4px));
      display: var(--mearl-device-cutout-display, flex);
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%);
      border-radius: 999px;
      pointer-events: auto !important;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: width 320ms cubic-bezier(.34, 1.56, .64, 1), transform 160ms ease;
    }
    #device-cutout[data-kind="dynamic-island"]:active {
      transform: translate(-50%, -50%) scale(.97);
    }
    #device-cutout[data-kind="dynamic-island"]:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    #device-cutout[data-kind="dynamic-island"][data-state="copied"],
    #device-cutout[data-kind="dynamic-island"][data-state="downloaded"],
    #device-cutout[data-kind="dynamic-island"][data-state="failed"] {
      width: 154px;
      padding: 0 10px;
      justify-content: space-between;
    }
    #cutout-camera, #cutout-check {
      display: none;
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    #device-cutout[data-state="copied"] #cutout-camera,
    #device-cutout[data-state="downloaded"] #cutout-camera,
    #device-cutout[data-state="failed"] #cutout-camera,
    #device-cutout[data-state="copied"] #cutout-check,
    #device-cutout[data-state="downloaded"] #cutout-check,
    #device-cutout[data-state="failed"] #cutout-check {
      display: block;
    }
    #device-cutout[data-kind="notch"] {
      top: 0;
      width: 164px;
      height: min(31px, 100%);
      border-radius: 0 0 18px 18px;
    }
    #device-chrome[data-cutout="side-camera"] #status-content {
      padding-right: 64px;
    }
    #device-cutout[data-kind="side-camera"] {
      top: 50%;
      right: 18px;
      left: auto;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      transform: translateY(-50%);
    }
    #device-chrome[data-side-bar="true"] #status-bar {
      left: auto;
      right: 0;
      width: ${sideBarWidth}px;
      height: 100%;
      border-left: 1px solid rgba(15, 23, 42, .06);
    }
    #device-chrome[data-side-bar="true"] #status-content {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      padding: 0;
    }
    #device-chrome[data-side-bar="true"] #device-cutout[data-kind="side-camera"] {
      display: none;
    }
    #device-chrome[data-side-bar="true"][data-cutout="side-camera"] #status-bar::after {
      content: "";
      position: fixed;
      top: 25px;
      right: ${Math.max(0, Math.round((sideBarWidth - 36) / 2))}px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: radial-gradient(circle at center, #243f86 0 1.5px, #050505 2.5px);
      box-shadow: inset 0 0 0 .5px rgba(255, 255, 255, .08);
    }
    #device-chrome[data-side-bar="true"] #time {
      position: absolute;
      top: ${sideBarTimeTop}px;
      left: 0;
      width: 100%;
      min-width: 0;
      text-align: center;
      font-size: 13px;
    }
    #device-chrome[data-side-bar="true"] #status-indicators {
      position: absolute;
      top: ${sideBarIndicatorsTop}px;
      left: 50%;
      width: 44px;
      height: 44px;
      transform: translateX(-50%);
      display: block;
    }
    #duo-status-icon {
      width: 44px;
      height: 44px;
      fill: none;
      stroke: currentColor;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    #duo-wifi { stroke-width: 2.5; }
    #duo-wifi path:last-child { fill: currentColor; stroke: none; }
    #duo-status-icon circle { fill: currentColor; stroke: none; }
    #device-chrome[data-side-bar="true"] #bottom-bar { right: ${sideBarWidth}px; }
    #bottom-bar {
      bottom: 0;
      height: ${bottomBarHeight}px;
      min-height: 0;
      background: transparent;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    #gesture-surface {
      appearance: none;
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 166px;
      max-width: calc(100% - 32px);
      height: 24px;
      transform: translateX(-50%);
      border: 0;
      padding: 0;
      background: transparent;
      color: inherit;
    }
    #gesture-surface[data-interactive="true"] {
      pointer-events: auto !important;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    #gesture-surface[data-interactive="true"]:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: -2px;
    }
    #gesture-indicator {
      position: absolute;
      left: 50%;
      bottom: 8px;
      width: 134px;
      max-width: 100%;
      height: 5px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: currentColor;
      opacity: .92;
      transition: transform 120ms ease, opacity 120ms ease;
    }
    #gesture-surface[data-interactive="true"]:hover #gesture-indicator {
      opacity: 1;
      transform: translateX(-50%) scaleX(1.05);
    }
    #device-chrome[data-platform="android"] {
      font-family: Roboto, "Noto Sans SC", "Segoe UI", sans-serif;
    }
    #device-chrome[data-platform="android"] #status-content {
      padding: 0 12px;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0;
    }
    #device-chrome[data-platform="android"] #status-indicators {
      gap: 5px;
      transform: scale(.86);
      transform-origin: right center;
    }
    #device-chrome[data-platform="android"] #gesture-indicator {
      bottom: 6px;
      width: 108px;
      height: 4px;
      opacity: .82;
    }
    @media(prefers-reduced-motion: reduce) {
      #device-cutout, #gesture-indicator { transition: none; }
    }
  </style>
  <div id="device-chrome" data-platform="${config.platform}" data-cutout="${cutout}" data-side-bar="${sideBarWidth > 0}">
    <div id="status-bar" class="system-bar" data-mearl-device-status-bar>
      <div id="status-content">
        <span id="time"></span>
        ${cutoutMarkup}
        <span id="status-indicators" aria-hidden="true">
          ${statusIndicatorsMarkup}
        </span>
      </div>
    </div>
    <div id="bottom-bar" class="system-bar" data-mearl-device-bottom-bar>
      <button id="gesture-surface" type="button" data-interactive="false" disabled aria-hidden="true"><span id="gesture-indicator" aria-hidden="true"></span></button>
    </div>
  </div>`;
    const deviceChrome = root2.querySelector("#device-chrome");
    const statusBar = root2.querySelector("#status-bar");
    const statusContent = root2.querySelector("#status-content");
    const time = root2.querySelector("#time");
    const cutoutButton = root2.querySelector("#device-cutout");
    const cutoutStatusPath = root2.querySelector("#cutout-check path");
    const gestureSurface = root2.querySelector("#gesture-surface");
    let screenshotPending = false;
    let resetTimer = null;
    let destroyed = false;
    const updateTime = () => {
      if (!time)
        return;
      const now = new NativeDate(nativeNow() + (state.timeOffsetMs ?? 0));
      time.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    };
    updateTime();
    const timeTimer = browser.setInterval(updateTime, 3e4);
    const setCutoutState = (nextState) => {
      if (!cutoutButton || cutoutButton.tagName !== "BUTTON")
        return;
      cutoutButton.dataset.state = nextState;
      const label = nextState === "copied" ? labels.copied : nextState === "downloaded" ? labels.downloaded : nextState === "failed" ? labels.captureFailed : labels.screenshot;
      cutoutButton.setAttribute("aria-label", label);
      cutoutButton.title = label;
      cutoutStatusPath?.setAttribute("d", nextState === "failed" ? "M5.5 5.5l9 9m0-9-9 9" : "m4.5 10.5 3.2 3.2 7.8-7.8");
    };
    const screenshotBlob = (data) => {
      const binary = browser.atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new browser.Blob([bytes], { type: "image/png" });
    };
    const downloadScreenshot = (blob) => {
      const link = ownerDocument.createElement("a");
      const objectUrl = browser.URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `mearl-screenshot-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.png`;
      link.style.display = "none";
      ownerDocument.body.appendChild(link);
      link.click();
      link.remove();
      browser.setTimeout(() => browser.URL.revokeObjectURL(objectUrl), 1e3);
    };
    const applyState = () => {
      if (statusBar) {
        statusBar.style.display = state.statusBarVisible || sideBarWidth > 0 ? "" : "none";
        statusBar.style.background = state.statusBarBackground;
      }
      if (statusContent && sideBarWidth > 0) {
        statusContent.style.visibility = state.statusBarVisible ? "" : "hidden";
      }
      if (deviceChrome)
        deviceChrome.style.color = state.textColor;
      if (gestureSurface) {
        const interactive = Boolean(state.bottomActionEnabled && options.onBottomAction);
        gestureSurface.dataset.interactive = String(interactive);
        gestureSurface.disabled = !interactive;
        gestureSurface.setAttribute("aria-hidden", String(!interactive));
        if (interactive) {
          gestureSurface.setAttribute("aria-label", labels.bottomAction);
          gestureSurface.title = labels.bottomAction;
        } else {
          gestureSurface.removeAttribute("aria-label");
          gestureSurface.removeAttribute("title");
        }
      }
    };
    if (cutoutButton?.tagName === "BUTTON") {
      setCutoutState("idle");
      cutoutButton.disabled = !options.captureScreenshot;
      cutoutButton.addEventListener("click", () => {
        if (destroyed || !options.captureScreenshot || screenshotPending || cutoutButton.dataset.state !== "idle") {
          return;
        }
        screenshotPending = true;
        cutoutButton.setAttribute("aria-busy", "true");
        void options.captureScreenshot().then(({ data }) => screenshotBlob(data)).then(async (blob) => {
          const ClipboardItemConstructor = browser.ClipboardItem;
          if (browser.navigator.clipboard?.write && ClipboardItemConstructor) {
            try {
              await browser.navigator.clipboard.write([
                new ClipboardItemConstructor({ "image/png": blob })
              ]);
              setCutoutState("copied");
              return;
            } catch {
            }
          }
          downloadScreenshot(blob);
          setCutoutState("downloaded");
        }).catch(() => setCutoutState("failed")).finally(() => {
          screenshotPending = false;
          if (destroyed)
            return;
          cutoutButton.setAttribute("aria-busy", "false");
          resetTimer = browser.setTimeout(() => {
            resetTimer = null;
            if (!screenshotPending)
              setCutoutState("idle");
          }, 1600);
        });
      });
    }
    gestureSurface?.addEventListener("click", () => {
      if (!destroyed && state.bottomActionEnabled)
        options.onBottomAction?.();
    });
    applyState();
    return {
      updateState(nextState) {
        if (destroyed)
          return;
        Object.assign(state, nextState);
        applyState();
        updateTime();
      },
      destroy() {
        if (destroyed)
          return;
        destroyed = true;
        browser.clearInterval(timeTimer);
        if (resetTimer !== null)
          browser.clearTimeout(resetTimer);
        root2.replaceChildren();
      }
    };
  }

  // skills/wechat-miniprogram/scripts/runtime/clientGeometry.ts
  function installClientGeometry(host2, chrome) {
    const side = chrome.sideBarWidth ?? 0;
    if (!side) return;
    const invoke = host2.api.invoke.bind(host2.api);
    host2.api.invoke = (api, ...args) => {
      const update = (result2) => {
        if (!result2 || typeof result2 !== "object") return result2;
        if (["getSystemInfo", "getSystemInfoSync", "getSystemInfoAsync", "getWindowInfo"].includes(api) && typeof result2.windowWidth === "number") {
          return {
            ...result2,
            windowWidth: Math.max(0, host2.device.screenWidth - side),
            ...result2.safeArea ? { safeArea: { ...result2.safeArea, right: result2.safeArea.right - side, width: result2.safeArea.width - side } } : {},
            ...result2.safeAreaInsets ? { safeAreaInsets: { ...result2.safeAreaInsets, right: side } } : {}
          };
        }
        if (api === "getMenuButtonBoundingClientRect" && typeof result2.left === "number") return { ...result2, left: result2.left - side, right: result2.right - side };
        return result2;
      };
      const result = invoke(api, ...args);
      return result && typeof result.then === "function" ? result.then(update) : update(result);
    };
  }

  // skills/wechat-miniprogram/scripts/runtime/clientViewport.ts
  function installClientViewport(win, chrome) {
    const root2 = win;
    const style = win.document.createElement("style");
    style.textContent = `
html,body,#wxa-root,.wxa-stage,.wxa-device-slot{width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;gap:0!important;box-sizing:border-box!important}
html,body{background:#fff!important;overflow:hidden!important}
.wxa-stage,.wxa-device-slot{display:block!important}
.wxa-device{position:relative!important;left:0!important;top:0!important;width:100%!important;height:100%!important;transform:none!important;border:0!important;border-radius:0!important;box-shadow:none!important}
.wxa-statusbar:not(.is-hidden){display:block!important;padding:0!important}
.wxa-navbar,.wxa-pages,.wxa-tabbar,.wxa-overlay{width:calc(100% - ${chrome.sideBarWidth ?? 0}px)!important}
.wxa-capsule{left:auto!important;right:${7 + (chrome.sideBarWidth ?? 0)}px!important}
.wxa-notch,.wxa-home-indicator,.wxa-toolbar{display:none!important}
`;
    win.document.head.appendChild(style);
    const beforeLaunch = root2.__wxa_before_launch__;
    root2.__wxa_before_launch__ = async (api) => {
      const host2 = root2.__wxaHost;
      const statusBar = win.document.querySelector(".wxa-statusbar");
      const mount = win.document.createElement("div");
      mount.setAttribute("data-mearl-miniprogram-chrome", "");
      statusBar.replaceChildren();
      win.document.body.appendChild(mount);
      const view = installDeviceChromeView(mount.attachShadow({ mode: "open" }), chrome);
      installClientGeometry(host2, chrome);
      const update = () => {
        const appearance = win.getComputedStyle(statusBar);
        view.updateState({ statusBarVisible: true, statusBarBackground: appearance.backgroundColor, textColor: appearance.color });
      };
      const observer = new MutationObserver(update);
      observer.observe(statusBar, { attributes: true, attributeFilter: ["style", "class"] });
      win.addEventListener("pagehide", () => {
        observer.disconnect();
        view.destroy();
      }, { once: true });
      update();
      if (typeof beforeLaunch === "function") await beforeLaunch(api);
    };
  }

  // skills/wechat-miniprogram/scripts/runtime/networkProtocol.ts
  var NETWORK_CHUNK_BYTES = 128 * 1024;
  var NETWORK_RESPONSE_CHUNK_BYTES = 256 * 1024;
  var NETWORK_RPC_TIMEOUT_MS = 15e4;

  // skills/wechat-miniprogram/scripts/runtime/browserNetwork.ts
  var encode = (bytes) => {
    let text = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(text);
  };
  var decode = (data) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  function fetchNetworkRequest(request, rpc, proxyUrl) {
    const contentType = request.headers.get("content-type");
    const headers = proxyUrl ? JSON.parse(request.headers.get("x-wxa-headers") || "{}") : Object.fromEntries(request.headers);
    if (proxyUrl && contentType && !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
      headers["content-type"] = contentType;
    }
    return fetchNetwork({ url: proxyUrl ?? request.url, method: request.method, headers, body: request.body, signal: request.signal }, rpc);
  }
  async function* chunks(body, signal) {
    if (!body) return;
    const reader = body.getReader();
    const abort = () => {
      void reader.cancel(signal?.reason).catch(() => {
      });
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      let buffer = new Uint8Array(NETWORK_CHUNK_BYTES);
      let length = 0;
      for (; ; ) {
        signal?.throwIfAborted();
        const part = await reader.read();
        signal?.throwIfAborted();
        if (part.done) break;
        for (let offset = 0; offset < part.value.length; ) {
          const count = Math.min(buffer.length - length, part.value.length - offset);
          buffer.set(part.value.subarray(offset, offset + count), length);
          length += count;
          offset += count;
          if (length === buffer.length) {
            yield buffer;
            buffer = new Uint8Array(NETWORK_CHUNK_BYTES);
            length = 0;
          }
        }
      }
      if (length) yield buffer.subarray(0, length);
    } finally {
      signal?.removeEventListener("abort", abort);
      await reader.cancel().catch(() => {
      });
      reader.releaseLock();
    }
  }
  async function fetchNetwork(input, rpc) {
    const { signal } = input;
    signal?.throwIfAborted();
    const transferId = crypto.randomUUID();
    let registered = false;
    let released = false;
    let streamController;
    const release = async () => {
      if (released) return;
      released = true;
      signal?.removeEventListener("abort", abort);
      if (registered) await rpc({ stage: "release", transferId }).catch(() => {
      });
    };
    const abort = () => {
      streamController?.error(signal?.reason ?? new DOMException("Request aborted", "AbortError"));
      streamController = void 0;
      void release();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const request = async (stage, body) => {
      signal?.throwIfAborted();
      registered = true;
      return rpc({ stage, transferId, url: input.url, method: input.method, headers: input.headers, ...body?.length ? { body: encode(body) } : {} }, signal);
    };
    const iterator = chunks(input.body, signal);
    try {
      const first = await iterator.next();
      const second = first.done ? { done: true, value: void 0 } : await iterator.next();
      let result;
      if (second.done) result = await request("fetch", first.done ? void 0 : first.value);
      else {
        const capability = await request("begin");
        let offset2 = 0;
        const write = async (body2) => {
          if (offset2 + body2.length > capability.maxBytes) throw new Error(`Request body exceeds the configured ${capability.maxBytes} byte limit`);
          const accepted = await rpc({ stage: "write", transferId, offset: offset2, body: encode(body2) }, signal);
          if (accepted.offset !== offset2 + body2.length) throw new Error("Invalid upload acknowledgement");
          offset2 = accepted.offset;
        };
        await write(first.value);
        await write(second.value);
        for await (const body2 of iterator) await write(body2);
        result = await rpc({ stage: "send", transferId }, signal);
      }
      signal?.throwIfAborted();
      const headers = {
        "x-wxa-headers": encodeURIComponent(JSON.stringify(result.headers)),
        "x-wxa-set-cookie": encodeURIComponent(JSON.stringify(result.cookies)),
        "content-type": result.headers["content-type"] || "application/octet-stream"
      };
      if (result.kind === "inline" || input.method.toUpperCase() === "HEAD" || [204, 205, 304].includes(result.status)) {
        if (result.kind === "inline") registered = false;
        await release();
        return new Response(input.method.toUpperCase() === "HEAD" || [204, 205, 304].includes(result.status) ? null : decode(result.body || ""), { status: result.status, headers });
      }
      let offset = 0;
      const body = new ReadableStream({
        start(controller) {
          streamController = controller;
        },
        async pull(controller) {
          try {
            signal?.throwIfAborted();
            const part = await rpc({ stage: "read", transferId, offset }, signal);
            signal?.throwIfAborted();
            const bytes = decode(part.body);
            if (part.offset !== offset || !bytes.length || bytes.length > NETWORK_RESPONSE_CHUNK_BYTES || offset + bytes.length > result.bytes) throw new Error("Invalid response chunk");
            offset += bytes.length;
            controller.enqueue(bytes);
            if (offset === result.bytes) {
              controller.close();
              streamController = void 0;
              await release();
            }
          } catch (error) {
            if (streamController) controller.error(error);
            streamController = void 0;
            await release();
          }
        },
        async cancel() {
          streamController = void 0;
          await release();
        }
      });
      return new Response(body, { status: result.status, headers });
    } catch (error) {
      await release();
      throw error;
    } finally {
      await iterator.return(void 0);
    }
  }

  // skills/wechat-miniprogram/scripts/runtime/browserBridge.ts
  function createNetworkRpc(win) {
    const pending = /* @__PURE__ */ new Map();
    let sequence = 0;
    let connected = false;
    const send = (message) => win.postMessage({ channel: "mearl-wxa", ...message }, "*");
    const sendRequest = (id, input) => send({ operation: "request", id, input });
    win.addEventListener("message", (event) => {
      if (event.source !== win || event.data?.channel !== "mearl-wxa") return;
      const message = event.data;
      if (message.operation === "ready" && !connected) {
        connected = true;
        for (const [id, item] of pending) sendRequest(id, item.input);
      } else if (message.operation === "reply" && connected) {
        const item = pending.get(message.id);
        item?.dispose();
        if (message.error) item?.reject(new Error(message.error));
        else item?.resolve(message.result);
      }
    });
    return (input, signal) => {
      signal?.throwIfAborted();
      const id = String(++sequence);
      return new Promise((resolve, reject) => {
        const dispose = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          pending.delete(id);
        };
        const abort = () => {
          dispose();
          reject(signal?.reason ?? new DOMException("Request aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
          dispose();
          reject(new Error("Browser host request timed out"));
        }, NETWORK_RPC_TIMEOUT_MS);
        pending.set(id, { input, resolve, reject, dispose });
        signal?.addEventListener("abort", abort, { once: true });
        if (connected) sendRequest(id, input);
        else if (pending.size === 1) send({ operation: "connect" });
      });
    };
  }

  // skills/wechat-miniprogram/scripts/runtime/browserInput.ts
  function installMiniProgramInput(win) {
    const ignoreCompatibilityMouse = (event) => {
      const capabilities = event.sourceCapabilities;
      if (capabilities?.firesTouchEvents) event.stopImmediatePropagation();
    };
    for (const type of ["mousedown", "mousemove", "mouseup"]) win.addEventListener(type, ignoreCompatibilityMouse, true);
  }

  // skills/wechat-miniprogram/scripts/runtime/browser.ts
  var root = window;
  var nativeFetch = window.fetch.bind(window);
  var snapshot = root.__mearlWxaSnapshot;
  var viewport = { width: innerWidth, height: innerHeight };
  var runtimeDevice = browserDevice(new URL(location.href), viewport);
  if (runtimeDevice.adaptive) {
    root.addEventListener("resize", () => {
      const size = { screenWidth: innerWidth, screenHeight: innerHeight };
      Object.assign(runtimeDevice.device, size);
      if (root.__wxaHost) Object.assign(root.__wxaHost.device, size);
    });
  }
  var origin = "https://mearl-wxa.invalid";
  var launch = root.location.hash.slice(1) || new URL(root.location.href).searchParams.get("launch") || "";
  var source = { build: snapshot.build, moduleScript: (id) => snapshot.modules[id], baseLib: snapshot.baseLib, isolated: snapshot.isolated, hot: false };
  var networkRpc = createNetworkRpc(root);
  var storage = window.localStorage;
  var sessions = /* @__PURE__ */ new Map();
  var blobs = /* @__PURE__ */ new Map();
  var decode2 = (data) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  function virtualUrl(value, base = "/") {
    return new URL(String(value).replace(/^null\//, "/"), new URL(base, origin));
  }
  function resource(url) {
    if (url.origin !== origin) return null;
    const routed = routeApp(source, url);
    if (routed) return { ...routed, type: mimeType(routed.type) };
    const pathname = decodeURIComponent(url.pathname);
    const stored = /^\/__wxa__\/(?:usr|tmp)\/([^/]+)\//.exec(pathname);
    if (stored) {
      try {
        return { body: fileStore(stored[1]).read(pathname), type: mimeType(extname(pathname)), status: 200 };
      } catch {
        return null;
      }
    }
    const file = snapshot.resources[pathname] || snapshot.resources[pathname.replace(/^\/__wxa__\/webview\//, "/")];
    return file ? { body: decode2(file.data), type: file.type || mimeType(extname(pathname)), status: 200 } : null;
  }
  function script(url) {
    const response = resource(url);
    if (!response || response.status !== 200) throw new Error(`Missing script: ${url.pathname}`);
    let code = typeof response.body === "string" ? response.body : new TextDecoder().decode(response.body);
    if (url.pathname.startsWith("/__wxa__/runtime/")) {
      code = `(function(location,history){${code}
})(window.__mearlWxa.location(window),window.__mearlWxa.history);`;
      if (url.pathname.endsWith("/host.js") && snapshot.setup) {
        if ((code.match(/import\(\w+\)/g) || []).length !== 1) throw new Error("Unsupported runner setup loader");
        code = code.replace(/import\(\w+\)/g, "Promise.resolve(window.__mearlWxa.setup)");
      }
    }
    return code + "\n//# sourceURL=" + origin + url.pathname;
  }
  function blobUrl(url, isScript = false) {
    const key = (isScript ? "script:" : "") + url.href;
    if (blobs.has(key)) return blobs.get(key);
    const response = resource(url);
    if (!response) return "data:,";
    const blob = new Blob([isScript ? script(url) : response.body], { type: response.type });
    const value = URL.createObjectURL(blob);
    blobs.set(key, value);
    return value;
  }
  function html2(url) {
    const response = resource(url);
    if (!response) throw new Error(`Missing mini-program page: ${url.pathname}`);
    let text = String(response.body);
    text = text.replace(/<script\b([^>]*?)\s+src="([^"]+)"([^>]*)><\/script>/g, (_match, before, src, after) => {
      const code = script(virtualUrl(src, url.href)).replace(/<\/script/gi, "<\\/script");
      return `<script${before}${after}>${code}<\/script>`;
    });
    const prelude = `<script>window.__mearlWxa=parent.__mearlWxa;window.__mearlWxa.install(window,${JSON.stringify(url.href)});<\/script>`;
    return text.replace(/<head>/i, "<head>" + prelude);
  }
  function fileStore(session) {
    if (!/^[a-z0-9-]{1,80}$/i.test(session)) throw new Error("Invalid filesystem session");
    if (!sessions.has(session)) sessions.set(session, new FileStore([`/__wxa__/usr/${session}`, `/__wxa__/tmp/${session}`]));
    return sessions.get(session);
  }
  function filesystemSession(url, method) {
    if (url.origin !== origin || method !== "POST") return;
    return /^\/__wxa__\/fs\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  }
  function fileOperation(session, body) {
    try {
      const { operation, args } = JSON.parse(body);
      return { result: fileStore(session).execute(operation, args || {}) };
    } catch (error) {
      return { error: String(error) };
    }
  }
  async function fetchResource(value, init = {}, base = "/") {
    const input = Object.prototype.toString.call(value) === "[object Request]" ? value : virtualUrl(String(value), base);
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    if (/^(?:blob:|data:)/.test(request.url)) return nativeFetch(request);
    const url = new URL(request.url);
    const method = request.method;
    if (url.pathname === "/__wxa__/app-info.json") {
      return Response.json({
        version: snapshot.build.version,
        appid: snapshot.appid,
        baseLibVersion: snapshot.baseLib.version,
        wxConfig: snapshot.build.wxConfig,
        pages: snapshot.build.pages,
        device: runtimeDevice.device,
        liveReload: false,
        externalServiceWorker: true,
        socketProxy: false,
        pageTransition: true,
        ...snapshot.setup ? { setup: { env: snapshot.setupEnv } } : {}
      });
    }
    const session = filesystemSession(url, method);
    if (session) return Response.json(fileOperation(session, await request.text()));
    const temporary = /^\/__wxa__\/tmp\/([^/]+)\/?$/.exec(url.pathname);
    if (temporary && method === "POST") {
      const path = `/__wxa__/tmp/${temporary[1]}/${crypto.randomUUID()}.${url.searchParams.get("type") || "bin"}`;
      fileStore(temporary[1]).write(path, new Uint8Array(await request.arrayBuffer()));
      return Response.json({ url: origin + path });
    }
    const stored = /^\/__wxa__\/(?:usr|tmp)\/([^/]+)\//.exec(url.pathname);
    if (stored) {
      const files = fileStore(stored[1]);
      if (method === "DELETE") {
        files.remove(url.pathname, { dir: false });
        return new Response(null);
      }
      try {
        return new Response(method === "HEAD" ? null : files.read(url.pathname));
      } catch {
        return new Response(null, { status: 404 });
      }
    }
    const proxy = /^\/__wxa__\/proxy\/(https?)\/(.+)$/.exec(url.pathname);
    if (proxy || url.origin !== origin) {
      return fetchNetworkRequest(request, networkRpc, proxy ? `${proxy[1]}://${proxy[2]}${url.search}` : void 0);
    }
    if (url.pathname.startsWith("/__wxa__/mock/")) return new Response(null, { status: 204 });
    const response = resource(url);
    return response ? new Response(response.body, { status: response.status, headers: { "content-type": response.type } }) : new Response("Resource not found", { status: 404 });
  }
  function install(win, path) {
    if (win !== root) installMiniProgramInput(win);
    win.__mearlWxa = host;
    win.__mearlWxaPath = path;
    Object.defineProperty(win, "localStorage", { value: storage, configurable: true });
    Object.defineProperty(win, "sessionStorage", { value: storage, configurable: true });
    Object.defineProperty(win.navigator, "serviceWorker", { value: void 0, configurable: true });
    win.fetch = (value, init) => fetchResource(value, init, path);
    const frameSrc = Object.getOwnPropertyDescriptor(win.HTMLIFrameElement.prototype, "src");
    Object.defineProperty(win.HTMLIFrameElement.prototype, "src", { ...frameSrc, set(value) {
      const url = virtualUrl(value, path);
      if (url.origin !== origin) throw new Error("External web-view is not supported by this sandbox host");
      this.srcdoc = html2(url);
    } });
    const asset = (value, isScript) => {
      if (/^(?:data:|blob:)/.test(value)) return value;
      const url = virtualUrl(value, path);
      return url.origin === origin ? blobUrl(url, isScript) : value;
    };
    for (const [type, name, isScript] of [[win.HTMLScriptElement, "src", true], [win.HTMLImageElement, "src", false], [win.HTMLMediaElement, "src", false], [win.HTMLLinkElement, "href", false]]) {
      const descriptor = Object.getOwnPropertyDescriptor(type.prototype, name);
      if (descriptor?.set) Object.defineProperty(type.prototype, name, { ...descriptor, set(value) {
        descriptor.set.call(this, asset(value, isScript));
      } });
    }
    const setAttribute = win.Element.prototype.setAttribute;
    const css = (value) => value.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (_match, _quote, url) => `url("${asset(url, false)}")`);
    win.Element.prototype.setAttribute = function(name, value) {
      if (name === "src" && ["IFRAME", "SCRIPT", "IMG", "AUDIO", "VIDEO"].includes(this.tagName)) {
        this.src = value;
        return;
      }
      return setAttribute.call(this, name, name === "style" ? css(value) : value);
    };
    const textContent = Object.getOwnPropertyDescriptor(win.Node.prototype, "textContent");
    Object.defineProperty(win.Node.prototype, "textContent", { ...textContent, set(value) {
      textContent.set.call(this, this.tagName === "STYLE" ? css(value) : value);
    } });
    const appendChild = win.Node.prototype.appendChild;
    win.Node.prototype.appendChild = function(child) {
      if (this.tagName === "STYLE" && child.nodeType === 3) child.textContent = css(child.textContent || "");
      return appendChild.call(this, child);
    };
    win.XMLHttpRequest = class {
      status = 0;
      responseText = "";
      response;
      readyState = 0;
      url = "";
      method = "GET";
      async = true;
      onload;
      onreadystatechange;
      onerror;
      open(method, url, async = true) {
        this.method = method.toUpperCase();
        this.url = url;
        this.async = async;
      }
      send(body = "") {
        const url = virtualUrl(this.url, path);
        const session = filesystemSession(url, this.method);
        const response = session ? { status: 200, body: JSON.stringify(fileOperation(session, body)) } : resource(url);
        this.status = response?.status ?? 404;
        this.response = this.responseText = response ? typeof response.body === "string" ? response.body : new TextDecoder().decode(response.body) : "";
        this.readyState = 4;
        const notify = () => {
          this.onreadystatechange?.();
          this.onload?.();
        };
        if (this.async) queueMicrotask(notify);
        else notify();
      }
      setRequestHeader() {
      }
      getResponseHeader() {
        return null;
      }
      abort() {
      }
    };
  }
  var host = {
    install,
    location(win) {
      const url = virtualUrl(win.__mearlWxaPath || "/" + launch);
      return { origin, href: url.href, pathname: url.pathname, search: url.search, protocol: "https:", host: url.host, reload: () => root.location.reload() };
    },
    history: { replaceState(_state, _title, value) {
      const url = virtualUrl(value);
      root.__mearlWxaPath = url.href;
      root.history.replaceState(null, "", "#" + url.search);
    } },
    setup: null
  };
  install(root, origin + "/" + launch);
  installClientViewport(root, runtimeDevice.chrome);
  if (snapshot.setup) {
    const setupScript = document.createElement("script");
    setupScript.textContent = snapshot.setup;
    document.head.appendChild(setupScript);
    host.setup = root.__mearlWxaSetup;
  }
  var entry = document.createElement("script");
  entry.textContent = script(virtualUrl("/__wxa__/runtime/host.js"));
  document.body.appendChild(entry);
})();

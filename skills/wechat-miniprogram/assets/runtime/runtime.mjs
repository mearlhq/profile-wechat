#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/process.js
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function linuxProcessStat(pid) {
  const stat2 = readFileSync(`/proc/${pid}/stat`, "utf8");
  const end = stat2.lastIndexOf(")");
  const fields = stat2.slice(end + 2).trim().split(/\s+/);
  const group = Number(fields[2]);
  const threads = Number(fields[17]);
  if (end < 0 || !/^[A-Za-z]$/.test(fields[0]) || !Number.isSafeInteger(group) || group < 0 || !Number.isSafeInteger(threads) || threads < 0 || !/^\d+$/.test(fields[19] ?? ""))
    throw new Error("Invalid Linux process stat");
  return { state: fields[0], group, threads, identity: fields[19] };
}
function linuxProcessExited({ state, threads }) {
  return threads <= 1 && (state === "Z" || state === "X" || state === "x");
}
function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1)
    return void 0;
  try {
    if (process.platform === "linux") {
      return linuxProcessStat(pid).identity;
    }
    const result = process.platform === "win32" ? spawnSync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CreationDate.ToUniversalTime().Ticks`
    ], { encoding: "utf8", timeout: 2e3, windowsHide: true }) : spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      timeout: 2e3
    });
    return result.status === 0 ? result.stdout.trim() || void 0 : void 0;
  } catch {
    return void 0;
  }
}
function isProcessOwnerAlive(owner) {
  if (!isAlive(owner.pid))
    return false;
  if (typeof owner.processIdentity !== "string")
    return true;
  const current = processIdentity(owner.pid);
  return current === void 0 || current === owner.processIdentity;
}
function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || !pid || pid <= 0)
    return false;
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      try {
        return !linuxProcessExited(linuxProcessStat(pid));
      } catch {
        return true;
      }
    }
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
var init_process = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/process.js"() {
  }
});

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/paths.js
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
function hashKey(key) {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
function keyedDir(subdir) {
  return join(DAEMON_HOME, subdir);
}
function keyedConfigFile(subdir, key) {
  return join(keyedDir(subdir), `${hashKey(key)}.json`);
}
var DAEMON_HOME;
var init_paths = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/paths.js"() {
    DAEMON_HOME = join(homedir(), ".mearl");
  }
});

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/registry.js
import { closeSync, existsSync, linkSync, openSync, statSync, mkdirSync, readFileSync as readFileSync2, writeFileSync, renameSync, rmSync, readdirSync as readdirSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";
import { randomUUID } from "node:crypto";
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 448 });
  }
}
function pauseForLock() {
  Atomics.wait(lockWaitBuffer, 0, 0, LOCK_WAIT_MS);
}
function readRecordUnlocked(file) {
  try {
    if (!existsSync(file))
      return null;
    const parsed = JSON.parse(readFileSync2(file, "utf-8"));
    return parsed && typeof parsed.pid === "number" ? parsed : null;
  } catch {
    return null;
  }
}
function removeRecordUnlocked(file) {
  rmSync(file, { force: true });
}
function removeStaleLock(lockDir) {
  const ownerFile = join2(lockDir, "owner.json");
  const owner = readRecordUnlocked(ownerFile);
  if (owner) {
    if (isAlive(owner.pid))
      return false;
  } else {
    try {
      if (Date.now() - statSync(lockDir).mtimeMs < OWNER_WRITE_GRACE_MS)
        return false;
    } catch {
      return true;
    }
  }
  try {
    rmSync(lockDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
function withRecordLock(file, operation) {
  ensureDir(dirname(file));
  const lockDir = `${file}.registry.lock`;
  const ownerFile = join2(lockDir, "owner.json");
  const token = randomUUID();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    try {
      mkdirSync(lockDir, { mode: 448 });
    } catch (error) {
      if (error.code !== "EEXIST")
        throw error;
      if (!removeStaleLock(lockDir)) {
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for registry lock: ${file}`, { cause: error });
        }
        pauseForLock();
      }
      continue;
    }
    let ownerFd = null;
    try {
      ownerFd = openSync(ownerFile, "wx", 384);
      writeFileSync(ownerFd, JSON.stringify({ pid: process.pid, token }));
    } catch (error) {
      if (ownerFd !== null)
        closeSync(ownerFd);
      ownerFd = null;
      if (error.code === "EEXIST") {
        if (Date.now() >= deadline) {
          throw new Error(`Timed out acquiring registry lock: ${file}`, { cause: error });
        }
        pauseForLock();
        continue;
      }
      throw error;
    } finally {
      if (ownerFd !== null)
        closeSync(ownerFd);
    }
    try {
      return operation();
    } finally {
      const owner = readRecordUnlocked(ownerFile);
      if (owner?.token === token)
        rmSync(lockDir, { recursive: true, force: true });
    }
  }
}
function readRecord(file) {
  return readRecordUnlocked(file);
}
function removeRecordIfPid(file, pid) {
  try {
    return withRecordLock(file, () => {
      const record = readRecordUnlocked(file);
      if (record?.pid !== pid)
        return false;
      removeRecordUnlocked(file);
      return true;
    });
  } catch {
    return false;
  }
}
var LOCK_WAIT_MS, LOCK_TIMEOUT_MS, OWNER_WRITE_GRACE_MS, lockWaitBuffer;
var init_registry = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/registry.js"() {
    init_process();
    LOCK_WAIT_MS = 10;
    LOCK_TIMEOUT_MS = 5e3;
    OWNER_WRITE_GRACE_MS = 1e3;
    lockWaitBuffer = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  }
});

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/log.js
var DEFAULT_MAX_LOG_BYTES;
var init_log = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/log.js"() {
    DEFAULT_MAX_LOG_BYTES = 5 * 1024 * 1024;
  }
});

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/daemon.js
var init_daemon = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/daemon.js"() {
    init_process();
    init_registry();
    init_log();
  }
});

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/command.js
import { AsyncLocalStorage } from "node:async_hooks";
var ownedCommands;
var init_command = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/command.js"() {
    init_process();
    ownedCommands = new AsyncLocalStorage();
  }
});

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/index.js
var init_dist = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/index.js"() {
    init_process();
    init_paths();
    init_registry();
    init_log();
    init_daemon();
    init_command();
  }
});

// skills/wechat-miniprogram/scripts/runtime/snapshot.ts
var snapshot_exports = {};
__export(snapshot_exports, {
  createSnapshotBuilder: () => createSnapshotBuilder
});
import { readFileSync as readFileSync5, readdirSync as readdirSync3 } from "node:fs";
import { join as join4 } from "node:path";
import { AppBuilder, MiniProgram, findRuntimeDir, findSetupFile, bundleSetup } from "@open-wxa/wxa-runner-core";
import { resolveBaseLib, usesIsolatedContext } from "@open-wxa/wxa-runner-extractor";
function staticFiles(root, prefix = "") {
  return readdirSync3(join4(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
    const relative = prefix + entry.name;
    return entry.isDirectory() ? staticFiles(root, relative + "/") : entry.isFile() ? [relative] : [];
  });
}
async function createSnapshotBuilder(options) {
  const project = new MiniProgram(options.projectPath);
  const baseLib = resolveBaseLib();
  const runtimeDir = findRuntimeDir();
  const setupFile = options.setup === false ? null : options.setup || findSetupFile(project.projectPath);
  const adapter = readFileSync5(new URL("./browser.js", import.meta.url), "utf8");
  const libraries = {};
  for (const [prefix, directory] of [["/__baselib__/", baseLib.dir], ["/__wxa__/runtime/", runtimeDir]]) {
    for (const file of readdirSync3(directory)) {
      if (file.endsWith(".js")) libraries[prefix + file] = { data: readFileSync5(join4(directory, file)).toString("base64"), type: "text/javascript" };
    }
  }
  const builder = new AppBuilder(project);
  return {
    builder,
    async build() {
      const build = await builder.build();
      if (Object.keys(project.readAppJson().plugins || {}).length) throw new Error("WeChat plugins are not supported by the local browser host yet");
      if (build.workerModules.length) throw new Error("Mini-program Workers are not supported by the local browser host yet");
      const resources = { ...libraries };
      let bytes = 0;
      for (const file of staticFiles(project.root)) {
        if (/\.(?:js|wxml|wxs|wxss|map|ts|less|s[ac]ss)$/.test(file)) continue;
        const data = readFileSync5(join4(project.root, file));
        bytes += data.length;
        if (bytes > 48 * 1024 * 1024) throw new Error("Project static assets exceed the 48 MiB browser snapshot limit");
        resources["/" + file] = { data: data.toString("base64"), type: "" };
      }
      const modules = Object.fromEntries(build.modules.map((id) => [id, builder.getModuleScript(id)]));
      let setup = null;
      if (setupFile) {
        const { transform } = await import("esbuild");
        setup = (await transform(await bundleSetup(setupFile), { format: "iife", globalName: "__mearlWxaSetup", target: "chrome141" })).code;
      }
      const setupEnv = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key.startsWith("WXA_") && value !== void 0));
      const snapshot = { build: { ...build, plugins: [] }, modules, resources, setup, setupEnv, appid: project.appid, baseLib: { version: baseLib.version, hasWorker: false }, isolated: usesIsolatedContext(baseLib.version) };
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mearl \xB7 WeChat</title></head><body><div id="wxa-root"></div><script>window.__mearlWxaSnapshot=${escapeScript(JSON.stringify(snapshot))};
${escapeScript(adapter)}</script></body></html>`;
      return { html, pages: build.pages };
    }
  };
}
var escapeScript;
var init_snapshot = __esm({
  "skills/wechat-miniprogram/scripts/runtime/snapshot.ts"() {
    "use strict";
    escapeScript = (value) => value.replace(/<\/script/gi, "<\\/script");
  }
});

// skills/wechat-miniprogram/scripts/runtime/networkProtocol.ts
var NETWORK_CHUNK_BYTES, NETWORK_RESPONSE_CHUNK_BYTES;
var init_networkProtocol = __esm({
  "skills/wechat-miniprogram/scripts/runtime/networkProtocol.ts"() {
    "use strict";
    NETWORK_CHUNK_BYTES = 128 * 1024;
    NETWORK_RESPONSE_CHUNK_BYTES = 256 * 1024;
  }
});

// skills/wechat-miniprogram/scripts/runtime/network.ts
var network_exports = {};
__export(network_exports, {
  NetworkTransfers: () => NetworkTransfers,
  networkTransfers: () => networkTransfers,
  requestNetwork: () => requestNetwork
});
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, rename, rm, stat, readdir, open, access } from "node:fs/promises";
import { join as join7 } from "node:path";
function bodyLimit() {
  const value = Number(process.env.MEARL_WECHAT_NETWORK_MAX_BYTES ?? 128 * 1024 * 1024);
  if (!Number.isSafeInteger(value) || value < NETWORK_RESPONSE_CHUNK_BYTES || value > 2 * 1024 ** 3) throw new Error("MEARL_WECHAT_NETWORK_MAX_BYTES must be between 256 KiB and 2 GiB");
  return value;
}
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
function requestNetwork(input) {
  return networkTransfers.run(input);
}
var TTL, ID, NetworkTransfers, networkTransfers;
var init_network = __esm({
  "skills/wechat-miniprogram/scripts/runtime/network.ts"() {
    "use strict";
    init_dist();
    init_networkProtocol();
    TTL = 5 * 6e4;
    ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
    NetworkTransfers = class {
      constructor(directory = keyedDir("wechat-network")) {
        this.directory = directory;
      }
      directory;
      path(id) {
        if (typeof id !== "string" || !ID.test(id)) throw new Error("Invalid network transfer ID");
        return join7(this.directory, id);
      }
      async save(path, value) {
        const temporary = join7(path, `meta.${process.pid}`);
        await writeFile(temporary, JSON.stringify(value), { mode: 384 });
        await rename(temporary, join7(path, "meta.json"));
      }
      async load(path) {
        if (await exists(join7(path, "cancel"))) throw new Error("Network transfer was cancelled");
        const value = JSON.parse(await readFile(join7(path, "meta.json"), "utf8"));
        if (value.expires < Date.now()) throw new Error("Network transfer expired");
        return value;
      }
      async cleanupExpired() {
        await mkdir(this.directory, { recursive: true, mode: 448 });
        for (const id of await readdir(this.directory)) {
          if (!ID.test(id)) continue;
          const path = this.path(id);
          try {
            if ((await stat(join7(path, "meta.json"))).mtimeMs + TTL > Date.now()) continue;
          } catch {
            try {
              if ((await stat(path)).mtimeMs + TTL > Date.now()) continue;
            } catch {
              continue;
            }
          }
          await this.release(id);
          await rm(path, { recursive: true, force: true });
        }
      }
      async release(id) {
        const path = this.path(id);
        if (!await exists(path)) return { released: true };
        await writeFile(join7(path, "cancel"), "", { mode: 384 }).catch(() => {
        });
        if (!await exists(join7(path, "busy"))) await rm(path, { recursive: true, force: true });
        return { released: true };
      }
      async run(input) {
        const path = this.path(input.transferId);
        if (input.stage === "release") return this.release(input.transferId);
        if (input.stage === "begin" || input.stage === "fetch") {
          await this.cleanupExpired();
          const url = new URL(String(input.url));
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Expected an HTTP(S) request URL without credentials");
          if (Buffer.byteLength(JSON.stringify(input.headers || {})) > 64 * 1024 || url.href.length > 16 * 1024) throw new Error("Network request headers or URL are too large");
          await mkdir(path, { mode: 448 });
          try {
            const transfer = { url: url.href, method: String(input.method || "GET").toUpperCase(), headers: input.headers || {}, phase: "upload", uploaded: 0, expires: Date.now() + TTL, maxBytes: bodyLimit() };
            await writeFile(join7(path, "upload"), "", { mode: 384 });
            await this.save(path, transfer);
            if (input.stage === "begin") return { transferId: input.transferId, maxBytes: transfer.maxBytes, chunkBytes: NETWORK_CHUNK_BYTES };
            if (input.body) await this.run({ stage: "write", transferId: input.transferId, offset: 0, body: input.body });
            return await this.send(input.transferId);
          } catch (error) {
            await this.release(input.transferId);
            throw error;
          }
        }
        if (input.stage === "send") return this.send(input.transferId);
        const lock = await open(join7(path, "busy"), "wx", 384);
        try {
          const transfer = await this.load(path);
          const offset = input.offset;
          if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid network chunk offset");
          if (input.stage === "write") {
            if (transfer.phase !== "upload" || typeof input.body !== "string" || input.body.length > Math.ceil(NETWORK_CHUNK_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.body)) throw new Error("Invalid upload chunk");
            const bytes = Buffer.from(input.body, "base64");
            if (!bytes.length || bytes.length > NETWORK_CHUNK_BYTES || offset > transfer.uploaded) throw new Error("Invalid upload chunk offset or size");
            if (offset + bytes.length > transfer.maxBytes) throw new Error(`Request body exceeds the configured ${transfer.maxBytes} byte limit`);
            const file2 = await open(join7(path, "upload"), "r+");
            try {
              if (offset < transfer.uploaded) {
                const previous = Buffer.alloc(bytes.length);
                await file2.read(previous, 0, previous.length, offset);
                if (offset + bytes.length > transfer.uploaded || !previous.equals(bytes)) throw new Error("Upload retry differs from the accepted chunk");
              } else {
                let written = 0;
                while (written < bytes.length) written += (await file2.write(bytes, written, bytes.length - written, offset + written)).bytesWritten;
                transfer.uploaded += bytes.length;
              }
            } finally {
              await file2.close();
            }
            transfer.expires = Date.now() + TTL;
            await this.save(path, transfer);
            return { transferId: input.transferId, offset: offset + bytes.length };
          }
          if (input.stage !== "read" || transfer.phase !== "complete") throw new Error("Network transfer is not ready to read");
          const file = await open(join7(path, "response"), "r");
          try {
            const size = (await file.stat()).size;
            if (offset >= size) throw new Error("Invalid response chunk offset");
            const bytes = Buffer.alloc(Math.min(NETWORK_RESPONSE_CHUNK_BYTES, size - offset));
            const result = await file.read(bytes, 0, bytes.length, offset);
            transfer.expires = Date.now() + TTL;
            await this.save(path, transfer);
            return { transferId: input.transferId, offset, body: bytes.subarray(0, result.bytesRead).toString("base64") };
          } finally {
            await file.close();
          }
        } finally {
          await lock.close();
          await rm(join7(path, "busy"), { force: true });
          if (await exists(join7(path, "cancel"))) await rm(path, { recursive: true, force: true });
        }
      }
      async send(id) {
        const path = this.path(id);
        const lock = await open(join7(path, "busy"), "wx", 384);
        const controller = new AbortController();
        const cancel = setInterval(() => {
          void exists(join7(path, "cancel")).then((found) => {
            if (found) controller.abort(new Error("Network transfer was cancelled"));
          });
        }, 100);
        const timeout = setTimeout(() => controller.abort(new Error("Network request timed out after 120 seconds")), 12e4);
        let keep = false;
        let upload;
        try {
          const transfer = await this.load(path);
          if (transfer.phase !== "upload") throw new Error("Network transfer was already sent");
          transfer.phase = "sending";
          transfer.expires = Date.now() + TTL;
          await this.save(path, transfer);
          if (transfer.uploaded && !["GET", "HEAD"].includes(transfer.method)) upload = createReadStream(join7(path, "upload"));
          const response = await fetch(transfer.url, { method: transfer.method, headers: transfer.headers, body: upload, ...upload ? { duplex: "half" } : {}, signal: controller.signal });
          const headers = Object.fromEntries(response.headers);
          const cookies = response.headers.getSetCookie();
          if (Buffer.byteLength(JSON.stringify({ headers, cookies })) > 64 * 1024) throw new Error("Network response headers are too large");
          const file = await open(join7(path, "response"), "w", 384);
          let bytes = 0;
          try {
            const reader = response.body?.getReader();
            for (; ; ) {
              const part = await reader?.read();
              if (!part || part.done) break;
              bytes += part.value.length;
              if (bytes > transfer.maxBytes) {
                await reader.cancel();
                throw new Error(`Response body exceeds the configured ${transfer.maxBytes} byte limit`);
              }
              let written = 0;
              while (written < part.value.length) written += (await file.write(part.value, written, part.value.length - written)).bytesWritten;
            }
          } finally {
            await file.close();
          }
          const metadata = { transferId: id, status: response.status, headers, cookies, bytes };
          if (bytes <= NETWORK_RESPONSE_CHUNK_BYTES) return { ...metadata, kind: "inline", body: (await readFile(join7(path, "response"))).toString("base64") };
          transfer.phase = "complete";
          transfer.expires = Date.now() + TTL;
          await this.save(path, transfer);
          keep = true;
          return { ...metadata, kind: "resource" };
        } catch (error) {
          controller.abort();
          throw error;
        } finally {
          clearInterval(cancel);
          clearTimeout(timeout);
          upload?.destroy();
          await lock.close();
          await rm(join7(path, "busy"), { force: true });
          if (!keep || await exists(join7(path, "cancel"))) await rm(path, { recursive: true, force: true });
        }
      }
    };
    networkTransfers = new NetworkTransfers();
  }
});

// skills/wechat-miniprogram/scripts/runtime/cli.ts
import { readFileSync as readFileSync7 } from "node:fs";

// skills/wechat-miniprogram/scripts/runtime/index.ts
init_dist();
import { pathToFileURL } from "node:url";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, writeFileSync as writeFileSync3, renameSync as renameSync2, rmSync as rmSync3 } from "node:fs";
import { basename as basename2, dirname as dirname3, join as join5 } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";

// skills/wechat-miniprogram/scripts/runtime/project.ts
import { existsSync as existsSync2, readFileSync as readFileSync3, realpathSync } from "node:fs";
import { isAbsolute, join as join3, resolve, dirname as dirname2, basename } from "node:path";
var PROJECT_OUTPUTS = ["", "dist/dev/mp-weixin", "unpackage/dist/dev/mp-weixin", "dist"];
function projectIdentity(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("projectPath is required");
  let directory = resolve(value);
  const missing = [];
  for (; ; ) {
    try {
      return resolve(realpathSync(directory), ...missing);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code || "") || dirname2(directory) === directory) throw error;
      missing.unshift(basename(directory));
      directory = dirname2(directory);
    }
  }
}
function runtimeProjectPaths(value) {
  const directory = projectIdentity(value);
  return [...new Set(PROJECT_OUTPUTS.map((part) => projectIdentity(join3(directory, part))))];
}
function findProjectDirectory(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("projectPath is required");
  const directory = realpathSync(resolve(value));
  const matches = PROJECT_OUTPUTS.map((part) => join3(directory, part)).filter((candidate) => {
    const configFile = join3(candidate, "project.config.json");
    const config = existsSync2(configFile) ? JSON.parse(readFileSync3(configFile, "utf8")) : {};
    return existsSync2(resolve(candidate, config.miniprogramRoot || "", "app.json"));
  });
  if (matches.includes(directory)) return directory;
  if (matches.length === 1) return realpathSync(matches[0]);
  if (matches.length > 1) throw new Error("Multiple mini-program outputs found; select the output directory explicitly");
  return null;
}
function projectDirectory(value) {
  const directory = findProjectDirectory(value);
  if (directory) return directory;
  throw new Error("No app.json found. Build the project for mp-weixin, then select its output directory.");
}
function runtimeOptions(input) {
  for (const key of Object.keys(input)) {
    if (!["projectPath", "setup"].includes(key)) throw new Error(`Unknown runtime option: ${key}`);
  }
  const projectPath = projectDirectory(input.projectPath);
  if (input.setup !== void 0 && input.setup !== false && (typeof input.setup !== "string" || !input.setup.trim())) {
    throw new Error("setup must be a file path or false");
  }
  const setup = typeof input.setup === "string" ? realpathSync(isAbsolute(input.setup) ? input.setup : resolve(projectPath, input.setup)) : input.setup;
  return { projectPath, ...setup === void 0 ? {} : { setup } };
}
function compilerError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(/(?:-86|bad cpu type|exec format error)/i.test(message) ? "The selected WeChat compiler cannot run on this CPU. On Apple Silicon, wxa-runner can reuse compatible compilers from WeChat DevTools. Set WXA_DEVTOOLS_PATH if DevTools is installed outside the default location, or set WXA_WCC and WXA_WCSC to an executable pair. The npm fallback for macOS uses Intel binaries and requires Rosetta.\n" + message : message);
}

// skills/wechat-miniprogram/scripts/runtime/lock.ts
init_dist();
import { randomUUID as randomUUID2 } from "node:crypto";
import { readFileSync as readFileSync4, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
async function acquireLock(file, timeoutMs, label, signal) {
  const token = randomUUID2();
  const deadline = Date.now() + timeoutMs;
  const owner = () => {
    try {
      return JSON.parse(readFileSync4(file, "utf8"));
    } catch {
      return void 0;
    }
  };
  for (; ; ) {
    signal?.throwIfAborted();
    const acquired = withRecordLock(file, () => {
      const current = owner();
      if (current && isProcessOwnerAlive(current)) return false;
      writeFileSync2(file, JSON.stringify({ pid: process.pid, processIdentity: processIdentity(process.pid), token }), { mode: 384 });
      return true;
    });
    if (acquired) return () => withRecordLock(file, () => {
      if (owner()?.token === token) rmSync2(file, { force: true });
    });
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
}

// skills/wechat-miniprogram/scripts/runtime/index.ts
var LIFECYCLE_TIMEOUT_MS = 45e3;
function previewFiles(projectPath) {
  const configFile = keyedConfigFile("wechat", projectPath);
  const snapshotFile = join5(keyedDir("plugin-previews"), "wxa", basename2(configFile, ".json") + ".html");
  return { configFile, snapshotFile, projectPath };
}
function registeredPreview(projectPath) {
  const [direct, ...outputs] = runtimeProjectPaths(projectPath).map(previewFiles);
  if (existsSync3(direct.snapshotFile) || readRecord(direct.configFile)?.projectPath === direct.projectPath) return direct;
  const matches = outputs.filter((output) => existsSync3(output.snapshotFile) || readRecord(output.configFile)?.projectPath === output.projectPath);
  if (matches.length > 1) throw new Error("Multiple mini-program previews found; select the output directory explicitly");
  return matches[0] ?? direct;
}
function checkPreviousCompiler({ configFile, projectPath }) {
  const record = readRecord(configFile);
  if (record?.projectPath !== projectPath || record.transport !== "native-messaging") return;
  if (isAlive(record.pid)) throw new Error("A previous mini-program compiler still owns this preview. Stop it from the previous installation before continuing.");
  removeRecordIfPid(configFile, record.pid);
}
async function compileRuntime(input) {
  const options = runtimeOptions(input);
  const preview = previewFiles(options.projectPath);
  const { configFile, snapshotFile } = preview;
  const release = await acquireLock(`${configFile}.lifecycle.lock`, LIFECYCLE_TIMEOUT_MS, "the mini-program preview");
  const revision = randomUUID3();
  const temporary = `${snapshotFile}.${revision}`;
  try {
    checkPreviousCompiler(preview);
    const { createSnapshotBuilder: createSnapshotBuilder2 } = await Promise.resolve().then(() => (init_snapshot(), snapshot_exports));
    const compiler = await createSnapshotBuilder2(options);
    try {
      const { html, pages } = await compiler.build();
      const bytes = Buffer.byteLength(html);
      if (bytes > 96 * 1024 * 1024) throw new Error("Mini-program snapshot exceeds the browser size limit");
      mkdirSync2(dirname3(snapshotFile), { recursive: true, mode: 448 });
      writeFileSync3(temporary, html, { mode: 384 });
      renameSync2(temporary, snapshotFile);
      const url = pathToFileURL(snapshotFile);
      url.searchParams.set("revision", revision);
      return { url: url.href, projectPath: options.projectPath, bytes, pages };
    } finally {
      compiler.builder.dispose();
    }
  } catch (error) {
    throw compilerError(error);
  } finally {
    try {
      rmSync3(temporary, { force: true });
    } finally {
      release();
    }
  }
}
function runtimeState(input) {
  const { snapshotFile, projectPath } = registeredPreview(input.projectPath);
  if (!existsSync3(snapshotFile)) throw new Error("Mini-program preview is unavailable. Run the project again to generate it.");
  return { url: pathToFileURL(snapshotFile).href, projectPath };
}

// skills/wechat-miniprogram/scripts/runtime/check.ts
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync4, mkdtempSync, readdirSync as readdirSync4, readFileSync as readFileSync6, rmSync as rmSync4 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join6 } from "node:path";
import { AppBuilder as AppBuilder2, MiniProgram as MiniProgram2, findRuntimeDir as findRuntimeDir2 } from "@open-wxa/wxa-runner-core";
import { resolveBaseLib as resolveBaseLib2 } from "@open-wxa/wxa-runner-extractor";
async function checkRuntime() {
  const baseLib = resolveBaseLib2();
  for (const file of readdirSync4(baseLib.dir).filter((file2) => file2.endsWith(".js"))) readFileSync6(join6(baseLib.dir, file));
  findRuntimeDir2();
  const directory = mkdtempSync(join6(tmpdir(), "mearl-wechat-check-"));
  let builder;
  try {
    mkdirSync3(join6(directory, "pages/index"), { recursive: true });
    for (const [file, content] of Object.entries({
      "app.json": JSON.stringify({ pages: ["pages/index/index"] }),
      "app.js": "App({})",
      "pages/index/index.js": "Page({})",
      "pages/index/index.wxml": "<view>ready</view>",
      "pages/index/index.wxss": "view{color:#333}"
    })) writeFileSync4(join6(directory, file), content);
    builder = new AppBuilder2(new MiniProgram2(directory));
    await builder.build();
    return { ready: true, baseLibVersion: baseLib.version, nodeVersion: process.versions.node };
  } catch (error) {
    throw compilerError(error);
  } finally {
    builder?.dispose();
    rmSync4(directory, { recursive: true, force: true });
  }
}

// skills/wechat-miniprogram/scripts/runtime/cli.ts
var [command, payload = "{}"] = process.argv.slice(2);
try {
  const input = JSON.parse(payload === "--stdin" ? readFileSync7(0, "utf8") : payload);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object");
  console.log = console.error;
  const result = command === "check" ? await checkRuntime() : command === "compile" ? await compileRuntime(input) : command === "state" ? runtimeState(input) : command === "request" ? await (await Promise.resolve().then(() => (init_network(), network_exports))).requestNetwork(input) : (() => {
    throw new Error("Unknown mini-program runtime command");
  })();
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

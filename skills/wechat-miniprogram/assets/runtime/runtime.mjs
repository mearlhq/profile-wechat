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
function keyedLogFile(subdir, key) {
  return join(keyedDir(subdir), `${hashKey(key)}.log`);
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
function writeRecordUnlocked(file, record) {
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(record), { mode: 384 });
    renameSync(tmp, file);
  } catch (error) {
    try {
      rmSync(tmp, { force: true });
    } catch {
    }
    throw error;
  }
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
function writeRecord(file, record) {
  withRecordLock(file, () => writeRecordUnlocked(file, record));
}
function claimRecord(file, record) {
  return withRecordLock(file, () => {
    const candidate = `${file}.${process.pid}.${randomUUID()}.claim`;
    try {
      writeFileSync(candidate, JSON.stringify(record), { mode: 384 });
      linkSync(candidate, file);
      return true;
    } catch (error) {
      if (error.code === "EEXIST")
        return false;
      throw error;
    } finally {
      rmSync(candidate, { force: true });
    }
  });
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
function removeInvalidRecord(file) {
  try {
    return withRecordLock(file, () => {
      if (!existsSync(file) || readRecordUnlocked(file))
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
import { existsSync as existsSync2, statSync as statSync2, renameSync as renameSync2, readFileSync as readFileSync3, readdirSync as readdirSync3, rmSync as rmSync2 } from "node:fs";
function rotateLogIfNeeded(logFile, maxBytes = DEFAULT_MAX_LOG_BYTES) {
  try {
    if (!existsSync2(logFile))
      return;
    if (statSync2(logFile).size < maxBytes)
      return;
    renameSync2(logFile, `${logFile}.1`);
  } catch {
  }
}
function tailFile(logFile, lines) {
  try {
    if (!existsSync2(logFile))
      return "";
    const content = readFileSync3(logFile, "utf-8");
    return content.split("\n").slice(-lines).join("\n").trim();
  } catch {
    return "";
  }
}
var DEFAULT_MAX_LOG_BYTES;
var init_log = __esm({
  "node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/log.js"() {
    DEFAULT_MAX_LOG_BYTES = 5 * 1024 * 1024;
  }
});

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/daemon.js
import { spawn } from "node:child_process";
import { closeSync as closeSync2, openSync as openSync2 } from "node:fs";
import { dirname as dirname2 } from "node:path";
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
function createDaemon(opts) {
  const { name, scriptPath, configFile, logFile, foregroundArgs = [], readyTimeoutMs = 15e3, formatInfo, startingRecord } = opts;
  const tag = `[${name}]`;
  const startLockFile = `${configFile}.start.lock`;
  function running() {
    const rec = readRecord(configFile);
    return rec && isAlive(rec.pid) ? rec : null;
  }
  function printInfo(rec) {
    const extra = formatInfo?.(rec);
    if (extra)
      console.log(extra);
  }
  async function start() {
    const live = running();
    if (live) {
      const state = live.daemonState === "starting" ? "starting" : "running";
      console.log(`${tag} Already ${state} (pid ${live.pid})`);
      printInfo(live);
      return;
    }
    const existingLock = readRecord(startLockFile);
    if (existingLock && isAlive(existingLock.pid)) {
      console.log(`${tag} Start already in progress (pid ${existingLock.pid})`);
      return;
    }
    if (existingLock)
      removeRecordIfPid(startLockFile, existingLock.pid);
    else
      removeInvalidRecord(startLockFile);
    const lockPid = process.pid;
    if (!claimRecord(startLockFile, { pid: lockPid, startedAt: (/* @__PURE__ */ new Date()).toISOString() })) {
      const competingLock = readRecord(startLockFile);
      if (competingLock && isAlive(competingLock.pid)) {
        console.log(`${tag} Start already in progress (pid ${competingLock.pid})`);
        return;
      }
      if (competingLock)
        removeRecordIfPid(startLockFile, competingLock.pid);
      else
        removeInvalidRecord(startLockFile);
      if (!claimRecord(startLockFile, { pid: lockPid, startedAt: (/* @__PURE__ */ new Date()).toISOString() })) {
        const currentLock = readRecord(startLockFile);
        if (currentLock && isAlive(currentLock.pid)) {
          console.log(`${tag} Start already in progress (pid ${currentLock.pid})`);
          return;
        }
        console.error(`${tag} Failed to acquire startup lock: ${startLockFile}`);
        process.exitCode = 1;
        return;
      }
    }
    const stale = readRecord(configFile);
    if (stale && !isAlive(stale.pid))
      removeRecordIfPid(configFile, stale.pid);
    else if (!stale)
      removeInvalidRecord(configFile);
    ensureDir(dirname2(configFile));
    ensureDir(dirname2(logFile));
    rotateLogIfNeeded(logFile);
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const logFd = openSync2(logFile, "a");
    let child;
    try {
      child = spawn(process.execPath, [scriptPath, "--foreground", ...foregroundArgs], {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: process.env,
        windowsHide: true
      });
    } catch (error) {
      removeRecordIfPid(startLockFile, lockPid);
      throw error;
    } finally {
      closeSync2(logFd);
    }
    child.unref();
    const childPid = child.pid;
    if (!childPid) {
      removeRecordIfPid(startLockFile, lockPid);
      console.error(`${tag} Failed to start: spawned process has no pid`);
      process.exitCode = 1;
      return;
    }
    writeRecord(startLockFile, { pid: childPid, startedAt });
    claimRecord(configFile, {
      ...startingRecord?.(childPid, startedAt) ?? { pid: childPid, startedAt },
      daemonState: "starting"
    });
    removeRecordIfPid(startLockFile, childPid);
    const deadline = Date.now() + readyTimeoutMs;
    while (Date.now() < deadline) {
      if (!isAlive(childPid)) {
        removeRecordIfPid(configFile, childPid);
        console.error(`${tag} Failed to start. Recent log:`);
        const log = tailFile(logFile, 20);
        if (log)
          console.error(log);
        console.error(`(full log: ${logFile})`);
        process.exitCode = 1;
        return;
      }
      const rec = readRecord(configFile);
      if (rec && rec.pid === childPid && rec.daemonState !== "starting") {
        console.log(`${tag} Started in background (pid ${childPid})`);
        console.log(`${tag} Logs: ${logFile}`);
        printInfo(rec);
        return;
      }
      await sleep(200);
    }
    console.error(`${tag} Start timed out after ${Math.round(readyTimeoutMs / 1e3)}s. Check the log: ${logFile}`);
    process.exitCode = 1;
  }
  async function stop(expectedPid) {
    const rec = readRecord(configFile);
    if (expectedPid !== void 0 && rec?.pid !== expectedPid) {
      console.log(`${tag} Registered pid ${expectedPid} is no longer the current instance`);
      return;
    }
    if (!rec || !isAlive(rec.pid)) {
      console.log(`${tag} Not running`);
      if (rec)
        removeRecordIfPid(configFile, rec.pid);
      else
        removeInvalidRecord(configFile);
      return;
    }
    const pid = rec.pid;
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      console.error(`${tag} Failed to stop pid ${pid}:`, error.message);
      process.exitCode = 1;
      return;
    }
    const deadline = Date.now() + 5e3;
    while (Date.now() < deadline && isAlive(pid)) {
      await sleep(150);
    }
    if (isAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    }
    removeRecordIfPid(configFile, pid);
    console.log(`${tag} Stopped (pid ${pid})`);
  }
  async function restart() {
    await stop();
    await start();
  }
  function status() {
    const rec = running();
    if (!rec) {
      console.log(`${tag} Status: stopped`);
      return;
    }
    console.log(`${tag} Status: ${rec.daemonState === "starting" ? "starting" : "running"}`);
    console.log(`  pid:        ${rec.pid}`);
    if (rec.startedAt)
      console.log(`  started at: ${rec.startedAt}`);
    console.log(`  log:        ${logFile}`);
    printInfo(rec);
  }
  function logs(lines = 50) {
    const log = tailFile(logFile, lines);
    if (log)
      console.log(log);
    console.log(`
(log file: ${logFile} \u2014 follow with: tail -f "${logFile}")`);
  }
  return { start, stop, restart, status, logs, running };
}
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
import { join as join4 } from "node:path";
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
        return join4(this.directory, id);
      }
      async save(path, value) {
        const temporary = join4(path, `meta.${process.pid}`);
        await writeFile(temporary, JSON.stringify(value), { mode: 384 });
        await rename(temporary, join4(path, "meta.json"));
      }
      async load(path) {
        if (await exists(join4(path, "cancel"))) throw new Error("Network transfer was cancelled");
        const value = JSON.parse(await readFile(join4(path, "meta.json"), "utf8"));
        if (value.expires < Date.now()) throw new Error("Network transfer expired");
        return value;
      }
      async cleanupExpired() {
        await mkdir(this.directory, { recursive: true, mode: 448 });
        for (const id of await readdir(this.directory)) {
          if (!ID.test(id)) continue;
          const path = this.path(id);
          try {
            if ((await stat(join4(path, "meta.json"))).mtimeMs + TTL > Date.now()) continue;
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
        await writeFile(join4(path, "cancel"), "", { mode: 384 }).catch(() => {
        });
        if (!await exists(join4(path, "busy"))) await rm(path, { recursive: true, force: true });
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
            await writeFile(join4(path, "upload"), "", { mode: 384 });
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
        const lock = await open(join4(path, "busy"), "wx", 384);
        try {
          const transfer = await this.load(path);
          const offset = input.offset;
          if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid network chunk offset");
          if (input.stage === "write") {
            if (transfer.phase !== "upload" || typeof input.body !== "string" || input.body.length > Math.ceil(NETWORK_CHUNK_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.body)) throw new Error("Invalid upload chunk");
            const bytes = Buffer.from(input.body, "base64");
            if (!bytes.length || bytes.length > NETWORK_CHUNK_BYTES || offset > transfer.uploaded) throw new Error("Invalid upload chunk offset or size");
            if (offset + bytes.length > transfer.maxBytes) throw new Error(`Request body exceeds the configured ${transfer.maxBytes} byte limit`);
            const file2 = await open(join4(path, "upload"), "r+");
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
          const file = await open(join4(path, "response"), "r");
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
          await rm(join4(path, "busy"), { force: true });
          if (await exists(join4(path, "cancel"))) await rm(path, { recursive: true, force: true });
        }
      }
      async send(id) {
        const path = this.path(id);
        const lock = await open(join4(path, "busy"), "wx", 384);
        const controller = new AbortController();
        const cancel = setInterval(() => {
          void exists(join4(path, "cancel")).then((found) => {
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
          if (transfer.uploaded && !["GET", "HEAD"].includes(transfer.method)) upload = createReadStream(join4(path, "upload"));
          const response = await fetch(transfer.url, { method: transfer.method, headers: transfer.headers, body: upload, ...upload ? { duplex: "half" } : {}, signal: controller.signal });
          const headers = Object.fromEntries(response.headers);
          const cookies = response.headers.getSetCookie();
          if (Buffer.byteLength(JSON.stringify({ headers, cookies })) > 64 * 1024) throw new Error("Network response headers are too large");
          const file = await open(join4(path, "response"), "w", 384);
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
          if (bytes <= NETWORK_RESPONSE_CHUNK_BYTES) return { ...metadata, kind: "inline", body: (await readFile(join4(path, "response"))).toString("base64") };
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
          await rm(join4(path, "busy"), { force: true });
          if (!keep || await exists(join4(path, "cancel"))) await rm(path, { recursive: true, force: true });
        }
      }
    };
    networkTransfers = new NetworkTransfers();
  }
});

// skills/wechat-miniprogram/scripts/runtime/snapshot.ts
var snapshot_exports = {};
__export(snapshot_exports, {
  createSnapshotBuilder: () => createSnapshotBuilder
});
import { readFileSync as readFileSync6, readdirSync as readdirSync4 } from "node:fs";
import { join as join5 } from "node:path";
import { AppBuilder, MiniProgram, findRuntimeDir, findSetupFile, bundleSetup } from "@open-wxa/wxa-runner-core";
import { resolveBaseLib, usesIsolatedContext } from "@open-wxa/wxa-runner-extractor";
function staticFiles(root, prefix = "") {
  return readdirSync4(join5(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
    const relative2 = prefix + entry.name;
    return entry.isDirectory() ? staticFiles(root, relative2 + "/") : entry.isFile() ? [relative2] : [];
  });
}
async function createSnapshotBuilder(options) {
  const project = new MiniProgram(options.projectPath);
  const builder = new AppBuilder(project);
  const baseLib = resolveBaseLib();
  const runtimeDir = findRuntimeDir();
  const setupFile = options.setup === false ? null : options.setup || findSetupFile(project.projectPath);
  const adapter = readFileSync6(new URL("./browser.js", import.meta.url), "utf8");
  const libraries = {};
  for (const [prefix, directory] of [["/__baselib__/", baseLib.dir], ["/__wxa__/runtime/", runtimeDir]]) {
    for (const file of readdirSync4(directory)) {
      if (file.endsWith(".js")) libraries[prefix + file] = { data: readFileSync6(join5(directory, file)).toString("base64"), type: "text/javascript" };
    }
  }
  return {
    project,
    builder,
    setupFile,
    async build(revision) {
      const build = await builder.build();
      if (Object.keys(project.readAppJson().plugins || {}).length) throw new Error("WeChat plugins are not supported by the local browser host yet");
      if (build.workerModules.length) throw new Error("Mini-program Workers are not supported by the local browser host yet");
      const resources = { ...libraries };
      let bytes = 0;
      for (const file of staticFiles(project.root)) {
        if (/\.(?:js|wxml|wxs|wxss|map|ts|less|s[ac]ss)$/.test(file)) continue;
        const data = readFileSync6(join5(project.root, file));
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
      const snapshot = { revision, build: { ...build, plugins: [] }, modules, resources, setup, setupEnv, appid: project.appid, baseLib: { version: baseLib.version, hasWorker: false }, isolated: usesIsolatedContext(baseLib.version) };
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="mearl-wxa-revision" content="${revision}"><title>Mearl \xB7 WeChat</title></head><body><div id="wxa-root"></div><script>window.__mearlWxaSnapshot=${escapeScript(JSON.stringify(snapshot))};
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

// skills/wechat-miniprogram/scripts/runtime/cli.ts
import { readFileSync as readFileSync8 } from "node:fs";

// skills/wechat-miniprogram/scripts/runtime/index.ts
init_dist();
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync3, renameSync as renameSync3, rmSync as rmSync4 } from "node:fs";
import { basename as basename2, dirname as dirname4, join as join6, relative } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";

// skills/wechat-miniprogram/scripts/runtime/project.ts
import { existsSync as existsSync3, readFileSync as readFileSync4, realpathSync } from "node:fs";
import { isAbsolute, join as join3, resolve, dirname as dirname3, basename } from "node:path";
var PROJECT_OUTPUTS = ["", "dist/dev/mp-weixin", "unpackage/dist/dev/mp-weixin", "dist"];
function projectIdentity(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("projectPath is required");
  let directory = resolve(value);
  const missing = [];
  for (; ; ) {
    try {
      return resolve(realpathSync(directory), ...missing);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code || "") || dirname3(directory) === directory) throw error;
      missing.unshift(basename(directory));
      directory = dirname3(directory);
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
    const config = existsSync3(configFile) ? JSON.parse(readFileSync4(configFile, "utf8")) : {};
    return existsSync3(resolve(candidate, config.miniprogramRoot || "", "app.json"));
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
    if (!["projectPath", "watch", "setup"].includes(key)) throw new Error(`Unknown runtime option: ${key}`);
  }
  if (input.watch !== void 0 && typeof input.watch !== "boolean") throw new Error("watch must be a boolean");
  const projectPath = projectDirectory(input.projectPath);
  if (input.setup !== void 0 && input.setup !== false && (typeof input.setup !== "string" || !input.setup.trim())) {
    throw new Error("setup must be a file path or false");
  }
  const setup = typeof input.setup === "string" ? realpathSync(isAbsolute(input.setup) ? input.setup : resolve(projectPath, input.setup)) : input.setup;
  return { projectPath, watch: input.watch !== false, ...setup === void 0 ? {} : { setup } };
}
function compilerError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(/(?:-86|bad cpu type|exec format error)/i.test(message) ? "The selected WeChat compiler cannot run on this CPU. On Apple Silicon, wxa-runner can reuse compatible compilers from WeChat DevTools. Set WXA_DEVTOOLS_PATH if DevTools is installed outside the default location, or set WXA_WCC and WXA_WCSC to an executable pair. The npm fallback for macOS uses Intel binaries and requires Rosetta.\n" + message : message);
}

// skills/wechat-miniprogram/scripts/runtime/index.ts
init_network();

// skills/wechat-miniprogram/scripts/runtime/lock.ts
init_dist();
import { randomUUID as randomUUID2 } from "node:crypto";
import { readFileSync as readFileSync5, rmSync as rmSync3, writeFileSync as writeFileSync2 } from "node:fs";
async function acquireLock(file, timeoutMs, label, signal) {
  const token = randomUUID2();
  const deadline = Date.now() + timeoutMs;
  const owner = () => {
    try {
      return JSON.parse(readFileSync5(file, "utf8"));
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
      if (owner()?.token === token) rmSync3(file, { force: true });
    });
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve2) => setTimeout(resolve2, 100));
  }
}

// skills/wechat-miniprogram/scripts/runtime/index.ts
var READY_TIMEOUT_MS = 3e4;
var LIFECYCLE_TIMEOUT_MS = 45e3;
function manager(projectPath, options) {
  const configFile = keyedConfigFile("wechat", projectPath);
  const logFile = keyedLogFile("wechat", projectPath);
  const snapshotFile = join6(keyedDir("plugin-previews"), "wxa", basename2(configFile, ".json") + ".html");
  const daemon = createDaemon({
    name: "WeChat mini-program compiler",
    scriptPath: fileURLToPath(new URL("./runtime.mjs", import.meta.url)),
    configFile,
    logFile,
    readyTimeoutMs: READY_TIMEOUT_MS,
    ...options ? { foregroundArgs: [JSON.stringify(options)] } : {},
    startingRecord: (pid, startedAt) => ({ pid, startedAt, transport: "native-messaging", projectPath, ...options ? { options } : {} })
  });
  return { daemon, configFile, logFile, snapshotFile };
}
function registeredRuntime(projectPath) {
  const paths = runtimeProjectPaths(projectPath);
  const registered = paths.flatMap((path) => {
    const runtime = manager(path);
    return readRecord(runtime.configFile)?.projectPath === path ? [{ ...runtime, projectPath: path }] : [];
  });
  const direct = registered.find((runtime) => runtime.projectPath === paths[0]);
  if (direct) return direct;
  if (registered.length > 1) throw new Error("Multiple mini-program runtimes found; select the output directory explicitly");
  return registered[0] ?? { ...manager(paths[0]), projectPath: paths[0] };
}
async function startRuntime(input) {
  const options = runtimeOptions(input);
  const { daemon, configFile, logFile, snapshotFile } = manager(options.projectPath, options);
  const release = await acquireLock(`${configFile}.lifecycle.lock`, LIFECYCLE_TIMEOUT_MS, "the mini-program compiler");
  try {
    let previous = daemon.running();
    if (previous && (previous.transport !== "native-messaging" || JSON.stringify(previous.options) !== JSON.stringify(options))) {
      throw new Error("This project is running with different runtime options. Stop it before restarting.");
    }
    if (previous?.url && fileURLToPath(previous.url) !== snapshotFile) {
      await daemon.stop();
      previous = null;
    }
    const deadline = Date.now() + READY_TIMEOUT_MS;
    await daemon.start();
    let record = daemon.running();
    while (record?.daemonState === "starting" && Date.now() < deadline) {
      await new Promise((resolve2) => setTimeout(resolve2, 100));
      record = daemon.running();
    }
    if (!record?.revision || !record.url || record.daemonState === "starting") throw new Error(`Mini-program compilation failed.
${tailFile(logFile, 15)}
Log: ${logFile}`);
    if (record.buildError) throw new Error(record.buildError);
    return { ...record, reused: Boolean(previous), logFile };
  } finally {
    release();
  }
}
function runtimeState(input) {
  const record = registeredRuntime(input.projectPath).daemon.running();
  if (!record?.revision || record.transport !== "native-messaging") throw new Error("Mini-program compiler is stopped. Enable WeChat again to start it.");
  return record;
}
async function stopRuntime(input) {
  const { daemon, configFile, snapshotFile, projectPath } = registeredRuntime(input.projectPath);
  const release = await acquireLock(`${configFile}.lifecycle.lock`, LIFECYCLE_TIMEOUT_MS, "the mini-program compiler");
  try {
    await daemon.stop();
    if (daemon.running()) throw new Error("Mini-program compiler is still stopping");
    rmSync4(snapshotFile, { force: true });
    rmSync4(configFile.replace(/\.json$/, ".html"), { force: true });
    return { stopped: true, projectPath, previewUrl: pathToFileURL(snapshotFile).href };
  } finally {
    release();
  }
}
async function serveRuntime(input) {
  const options = runtimeOptions(input);
  const { configFile, snapshotFile } = manager(options.projectPath);
  const { createSnapshotBuilder: createSnapshotBuilder2 } = await Promise.resolve().then(() => (init_snapshot(), snapshot_exports));
  const compiler = await createSnapshotBuilder2(options);
  mkdirSync2(dirname4(snapshotFile), { recursive: true, mode: 448 });
  let record = { pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString(), transport: "native-messaging", projectPath: options.projectPath, options };
  const publish = async () => {
    const revision = randomUUID3();
    const { html, pages } = await compiler.build(revision);
    if (Buffer.byteLength(html) > 96 * 1024 * 1024) throw new Error("Mini-program snapshot exceeds the browser size limit");
    const temporary = snapshotFile + "." + process.pid;
    writeFileSync3(temporary, html, { mode: 384 });
    renameSync3(temporary, snapshotFile);
    const url = pathToFileURL(snapshotFile);
    url.searchParams.set("project", options.projectPath);
    url.searchParams.set("source", pathToFileURL(options.projectPath.replace(/[/\\]$/, "") + "/").href);
    record = { ...record, url: url.href, revision, bytes: Buffer.byteLength(html), pages, buildError: void 0 };
    const current = readRecord(configFile);
    if (current && current.pid !== process.pid) throw new Error("Another compiler process owns this project");
    writeRecord(configFile, record);
  };
  try {
    await publish();
  } catch (error) {
    compiler.builder.dispose();
    throw compilerError(error);
  }
  const sweep = () => {
    void networkTransfers.cleanupExpired().catch((error) => console.error("Network staging cleanup:", error));
  };
  sweep();
  const idle = setInterval(sweep, 6e4);
  let watcher;
  let timer;
  let chain = Promise.resolve();
  let closing = false;
  if (options.watch) {
    const { watch } = await import("chokidar");
    watcher = watch([compiler.project.root, ...compiler.setupFile ? [compiler.setupFile] : []], { ignoreInitial: true, ignored: /(?:^|[/\\])(?:node_modules|\.git)(?:[/\\]|$)/, awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 } });
    watcher.on("all", (_event, file) => {
      compiler.builder.invalidate([relative(compiler.project.root, file).replaceAll("\\", "/")]);
      clearTimeout(timer);
      timer = setTimeout(() => {
        chain = chain.then(async () => {
          if (closing) return;
          try {
            await publish();
          } catch (error) {
            record = { ...record, buildError: compilerError(error).message };
            writeRecord(configFile, record);
          }
        });
      }, 150);
    });
  }
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(idle);
    clearTimeout(timer);
    await watcher?.close();
    await chain;
    compiler.builder.dispose();
    rmSync4(snapshotFile, { force: true });
    removeRecordIfPid(configFile, process.pid);
  };
  process.once("SIGTERM", () => void close());
  process.once("SIGINT", () => void close());
}

// skills/wechat-miniprogram/scripts/runtime/check.ts
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync4, mkdtempSync, readdirSync as readdirSync5, readFileSync as readFileSync7, rmSync as rmSync5 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join7 } from "node:path";
import { AppBuilder as AppBuilder2, MiniProgram as MiniProgram2, findRuntimeDir as findRuntimeDir2 } from "@open-wxa/wxa-runner-core";
import { resolveBaseLib as resolveBaseLib2 } from "@open-wxa/wxa-runner-extractor";
async function checkRuntime() {
  const baseLib = resolveBaseLib2();
  for (const file of readdirSync5(baseLib.dir).filter((file2) => file2.endsWith(".js"))) readFileSync7(join7(baseLib.dir, file));
  findRuntimeDir2();
  const directory = mkdtempSync(join7(tmpdir(), "mearl-wechat-check-"));
  let builder;
  try {
    mkdirSync3(join7(directory, "pages/index"), { recursive: true });
    for (const [file, content] of Object.entries({
      "app.json": JSON.stringify({ pages: ["pages/index/index"] }),
      "app.js": "App({})",
      "pages/index/index.js": "Page({})",
      "pages/index/index.wxml": "<view>ready</view>",
      "pages/index/index.wxss": "view{color:#333}"
    })) writeFileSync4(join7(directory, file), content);
    builder = new AppBuilder2(new MiniProgram2(directory));
    await builder.build();
    return { ready: true, baseLibVersion: baseLib.version, nodeVersion: process.versions.node };
  } catch (error) {
    throw compilerError(error);
  } finally {
    builder?.dispose();
    rmSync5(directory, { recursive: true, force: true });
  }
}

// skills/wechat-miniprogram/scripts/runtime/cli.ts
var [command, payload = "{}"] = process.argv.slice(2);
try {
  const input = JSON.parse(payload === "--stdin" ? readFileSync8(0, "utf8") : payload);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object");
  console.log = console.error;
  if (command === "--foreground") {
    await serveRuntime(input);
  } else {
    const result = command === "check" ? await checkRuntime() : command === "start" ? await startRuntime(input) : command === "stop" ? await stopRuntime(input) : command === "state" ? runtimeState(input) : command === "request" ? await (await Promise.resolve().then(() => (init_network(), network_exports))).requestNetwork(input) : (() => {
      throw new Error("Unknown mini-program runtime command");
    })();
    process.stdout.write(JSON.stringify(result) + "\n");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

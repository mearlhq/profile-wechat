// skills/wechat-miniprogram/scripts/bootstrap.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync5, renameSync as renameSync2, rmSync as rmSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname3, join as join4 } from "node:path";
import { fileURLToPath } from "node:url";

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/process.js
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function linuxProcessStat(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const end = stat.lastIndexOf(")");
  const fields = stat.slice(end + 2).trim().split(/\s+/);
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
function isProcessGroupAlive(group) {
  if (!Number.isSafeInteger(group) || group < 1)
    return false;
  if (process.platform === "win32")
    return true;
  const probe = () => {
    try {
      process.kill(-group, 0);
      return true;
    } catch (error) {
      return error.code === "ESRCH" ? false : void 0;
    }
  };
  const present = probe();
  if (present !== true)
    return present !== false;
  if (process.platform !== "linux")
    return true;
  const exitedMembers = () => {
    const members = /* @__PURE__ */ new Set();
    try {
      for (const name of readdirSync("/proc")) {
        if (!/^\d+$/.test(name))
          continue;
        try {
          const stat = linuxProcessStat(Number(name));
          if (stat.group !== group)
            continue;
          if (!linuxProcessExited(stat))
            return void 0;
          members.add(`${name}:${stat.identity}`);
        } catch (error) {
          if (!["ENOENT", "ESRCH"].includes(error.code ?? ""))
            return void 0;
        }
      }
      return members;
    } catch {
      return void 0;
    }
  };
  const first = exitedMembers();
  if (!first)
    return true;
  const second = exitedMembers();
  if (!second)
    return true;
  if (first.size && first.size === second.size && [...first].every((pid) => second.has(pid)))
    return false;
  return probe() !== false;
}

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/paths.js
import { join } from "node:path";
import { homedir } from "node:os";
var DAEMON_HOME = join(homedir(), ".mearl");

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/registry.js
import { closeSync, existsSync, linkSync, openSync, statSync, mkdirSync, readFileSync as readFileSync2, writeFileSync, renameSync, rmSync, readdirSync as readdirSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";
import { randomUUID } from "node:crypto";
var LOCK_WAIT_MS = 10;
var LOCK_TIMEOUT_MS = 5e3;
var OWNER_WRITE_GRACE_MS = 1e3;
var lockWaitBuffer = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
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

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/log.js
var DEFAULT_MAX_LOG_BYTES = 5 * 1024 * 1024;

// node_modules/.pnpm/@mearl+daemon-core@3.0.0-beta.10/node_modules/@mearl/daemon-core/dist/command.js
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
var ownedCommands = new AsyncLocalStorage();
function isCommandProcessAlive(owner) {
  if (!owner.group || process.platform === "win32")
    return isProcessOwnerAlive(owner);
  const identity = processIdentity(owner.pid);
  if (identity && owner.processIdentity && identity !== owner.processIdentity)
    return false;
  return isProcessGroupAlive(owner.group);
}
async function stopCommandProcess(owner) {
  if (process.platform === "win32") {
    if (!isCommandProcessAlive(owner))
      return;
    await new Promise((resolve2, reject) => {
      const killer = spawn("taskkill", ["/pid", String(owner.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
      killer.once("error", reject);
      killer.once("close", () => resolve2());
    });
  } else {
    const signal = (value) => {
      try {
        process.kill(-(owner.group ?? owner.pid), value);
      } catch (error) {
        if (error.code !== "ESRCH")
          throw error;
      }
    };
    signal("SIGTERM");
    const grace = Date.now() + 250;
    while (isCommandProcessAlive(owner) && Date.now() < grace)
      await new Promise((resolve2) => setTimeout(resolve2, 20));
    if (isCommandProcessAlive(owner))
      signal("SIGKILL");
  }
  const deadline = Date.now() + 2e3;
  while (isCommandProcessAlive(owner) && Date.now() < deadline)
    await new Promise((resolve2) => setTimeout(resolve2, 20));
  if (isCommandProcessAlive(owner))
    throw new Error("Command process is still stopping");
}
var MAX_CAPTURE_LENGTH = 1e6;
function isExecutable(filePath, platform = process.platform) {
  try {
    fs.accessSync(filePath, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function executableNames(name, platform = process.platform) {
  return platform === "win32" ? [`${name}.cmd`, `${name}.exe`, name] : [name];
}
function resolveSpawnCommand(executable, args, platform = process.platform, commandInterpreter = process.env.ComSpec) {
  if (platform === "win32" && /\.(?:cmd|bat)$/i.test(executable)) {
    return {
      command: commandInterpreter || "cmd.exe",
      args: ["/d", "/s", "/c", executable, ...args]
    };
  }
  return { command: executable, args };
}
function prependNodePath(env = process.env, nodeExecutable = process.execPath) {
  return prependPathDirectory(path.dirname(nodeExecutable), env);
}
function prependPathDirectory(directory, env = process.env) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const inherited = env[pathKey] || "";
  const entries = inherited.split(path.delimiter).filter(Boolean);
  if (entries.includes(directory))
    return env;
  return { ...env, [pathKey]: [directory, ...entries].join(path.delimiter) };
}
function npmExecEnvironment(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => key.toLowerCase() !== "npm_config_package"));
}
function findExecutable(name, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const existsSync3 = options.existsSync ?? ((candidate) => isExecutable(candidate, platform));
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const directories = [
    ...options.extraDirectories ?? [],
    ...(env[pathKey] ?? "").split(path.delimiter).filter(Boolean)
  ];
  for (const directory of directories) {
    for (const executableName of executableNames(name, platform)) {
      const candidate = path.join(directory, executableName);
      if (existsSync3(candidate))
        return candidate;
    }
  }
  return null;
}
var runCommand = (command, args, options = {}) => new Promise((resolve2, reject) => {
  const capture = options.capture === true || options.tee === true;
  const lifecycle = ownedCommands.getStore();
  const launch = resolveSpawnCommand(command, args);
  const child = spawn(launch.command, launch.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: capture ? [options.tee ? "inherit" : "ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
    ...lifecycle && process.platform !== "win32" ? { detached: true } : {}
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  let finalizing = false;
  let timedOut;
  const owner = lifecycle && child.pid ? { pid: child.pid, processIdentity: processIdentity(child.pid), ...process.platform !== "win32" ? { group: child.pid } : {} } : void 0;
  const append = (current, chunk) => options.tee ? (current + chunk).slice(-MAX_CAPTURE_LENGTH) : current.length >= MAX_CAPTURE_LENGTH ? current : (current + chunk).slice(0, MAX_CAPTURE_LENGTH);
  const finish = (error, code = 1) => {
    if (settled)
      return;
    settled = true;
    if (timer)
      clearTimeout(timer);
    if (error)
      reject(error);
    else
      resolve2({ code, stdout, stderr });
  };
  const finishOwned = async (error, code = 1) => {
    if (finalizing || settled)
      return;
    finalizing = true;
    if (timer)
      clearTimeout(timer);
    try {
      if (owner && isCommandProcessAlive(owner))
        await stopCommandProcess(owner);
      if (owner)
        lifecycle.finished(owner);
      finish(error ?? timedOut, code);
    } catch (failure) {
      finish(failure instanceof Error ? failure : new Error(String(failure)));
    }
  };
  const timer = options.timeoutMs === void 0 ? void 0 : setTimeout(() => {
    timedOut = new Error(`Command timed out after ${options.timeoutMs}ms`);
    if (lifecycle)
      void finishOwned(timedOut);
    else {
      child.kill("SIGTERM");
      finish(timedOut);
    }
  }, options.timeoutMs);
  if (capture) {
    child.stdout?.setEncoding("utf8").on("data", (chunk) => {
      stdout = append(stdout, chunk);
      if (options.tee)
        process.stdout.write(chunk);
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk) => {
      stderr = append(stderr, chunk);
      if (options.tee)
        process.stderr.write(chunk);
    });
  }
  child.once("error", (error) => lifecycle ? void finishOwned(error) : finish(error));
  child.once("close", (code) => lifecycle ? void finishOwned(void 0, code ?? 1) : finish(void 0, code ?? 1));
  if (lifecycle && owner) {
    try {
      lifecycle.started(owner);
    } catch (error) {
      void finishOwned(error instanceof Error ? error : new Error(String(error)));
    }
  }
});

// skills/wechat-miniprogram/scripts/runtime/lock.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { readFileSync as readFileSync3, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
async function acquireLock(file, timeoutMs, label, signal) {
  const token = randomUUID2();
  const deadline = Date.now() + timeoutMs;
  const owner = () => {
    try {
      return JSON.parse(readFileSync3(file, "utf8"));
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

// skills/wechat-miniprogram/scripts/runtime/project.ts
import { existsSync as existsSync2, readFileSync as readFileSync4, realpathSync } from "node:fs";
import { isAbsolute, join as join3, resolve, dirname as dirname2, basename } from "node:path";
var PROJECT_OUTPUTS = ["", "dist/dev/mp-weixin", "unpackage/dist/dev/mp-weixin", "dist"];
function findProjectDirectory(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("projectPath is required");
  const directory = realpathSync(resolve(value));
  const matches = PROJECT_OUTPUTS.map((part) => join3(directory, part)).filter((candidate) => {
    const configFile = join3(candidate, "project.config.json");
    const config = existsSync2(configFile) ? JSON.parse(readFileSync4(configFile, "utf8")) : {};
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
function detectProject(value) {
  const directory = findProjectDirectory(value);
  if (directory) return { kind: "mini-program", projectPath: directory };
  if (existsSync2(join3(resolve(String(value)), "project.config.json"))) projectDirectory(value);
  return { kind: "web" };
}

// skills/wechat-miniprogram/scripts/bootstrap.ts
function execute(entry, command, input, signal, timeoutMs = 135e3) {
  const body = JSON.stringify(input);
  return new Promise((resolve2, reject) => {
    const child = execFile(process.execPath, [entry, command, "--stdin"], {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
      signal,
      windowsHide: true,
      env: prependNodePath()
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message, { cause: error }));
      else {
        try {
          resolve2(JSON.parse(stdout));
        } catch {
          reject(new Error("Invalid mini-program runtime response"));
        }
      }
    });
    child.stdin.on("error", () => {
    });
    child.stdin.end(body);
  });
}
function createRuntimeInstaller(options = {}) {
  const skillRoot = options.skillRoot ?? fileURLToPath(new URL("../", import.meta.url));
  const assets = join4(skillRoot, "assets/runtime");
  const dependencies = JSON.parse(readFileSync5(join4(assets, "dependencies.json"), "utf8"));
  const files = new Map(["runtime.mjs", "browser.js"].map((name) => [name, readFileSync5(join4(assets, name))]));
  const manifest = JSON.stringify({ private: true, type: "module", dependencies });
  const hash = createHash("sha256").update(manifest);
  for (const bytes of files.values()) hash.update(bytes);
  const key = hash.digest("hex").slice(0, 24);
  const root = options.cacheRoot ?? join4(homedir2(), ".mearl", "wechat-runtime");
  const target = join4(root, key);
  const entry = join4(target, "runtime.mjs");
  const ready = () => {
    try {
      return [...files].every(([name, bytes]) => readFileSync5(join4(target, name)).equals(bytes)) && Object.entries(dependencies).every(([name, version]) => JSON.parse(readFileSync5(join4(target, "node_modules", name, "package.json"), "utf8")).version === version);
    } catch {
      return false;
    }
  };
  const ensure = async ({ check = false, signal, progress } = {}) => {
    signal?.throwIfAborted();
    let checked = false;
    if (!ready()) {
      mkdirSync2(root, { recursive: true, mode: 448 });
      const release = await acquireLock(join4(root, `${key}.lock`), 24e4, "the mini-program dependencies", signal);
      const temporary = join4(root, `.install-${key}`);
      try {
        if (!ready()) {
          progress?.("\u6B63\u5728\u51C6\u5907\u5FAE\u4FE1\u5C0F\u7A0B\u5E8F\u8FD0\u884C\u4F9D\u8D56\u2026");
          rmSync3(temporary, { recursive: true, force: true });
          mkdirSync2(temporary, { mode: 448 });
          for (const [name, bytes] of files) writeFileSync3(join4(temporary, name), bytes, { mode: 384 });
          writeFileSync3(join4(temporary, "package.json"), manifest, { mode: 384 });
          const npm = findExecutable("npm", { extraDirectories: [dirname3(process.execPath)] });
          if (!npm) throw new Error("Node.js npm is unavailable; mini-program dependencies could not be prepared");
          const result = await (options.runner ?? runCommand)(npm, ["install", "--prefix", temporary, "--no-audit", "--no-fund", "--no-package-lock", "--omit=dev"], {
            capture: true,
            timeoutMs: 18e4,
            env: prependNodePath(npmExecEnvironment())
          });
          signal?.throwIfAborted();
          if (result.code !== 0) throw new Error(`Mini-program dependency installation failed: ${(result.stderr || result.stdout).trim().slice(-2e3)}`);
          for (const [name, version] of Object.entries(dependencies)) {
            if (JSON.parse(readFileSync5(join4(temporary, "node_modules", name, "package.json"), "utf8")).version !== version) throw new Error(`Unexpected dependency version: ${name}`);
          }
          await execute(join4(temporary, "runtime.mjs"), "check", {}, signal, 45e3);
          checked = true;
          rmSync3(target, { recursive: true, force: true });
          renameSync2(temporary, target);
        }
      } finally {
        rmSync3(temporary, { recursive: true, force: true });
        release();
      }
    }
    if (check && !checked) await execute(entry, "check", {}, signal, 45e3);
    return entry;
  };
  return { ensure, async run(command, input, signal, progress) {
    return execute(await ensure({ signal, progress }), command, input, signal);
  } };
}
var runtime;
var localRuntime = () => runtime ??= createRuntimeInstaller();
function setup(context) {
  return (context ? createRuntimeInstaller({ runner: context.runCommand }) : localRuntime()).ensure({ check: true, progress: console.error });
}
function runtimeCommand(command, input, signal, progress) {
  return localRuntime().run(command, input, signal, progress);
}
export {
  createRuntimeInstaller,
  detectProject,
  runtimeCommand,
  setup
};

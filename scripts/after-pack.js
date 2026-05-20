// electron-builder afterPack hook.
// Ensures the better-sqlite3 binary in the packed app directory is the correct
// prebuilt for Electron's ABI — both the standard location and the hashed
// bundler copy that Next.js 16 creates.
//
// We download directly from GitHub releases instead of using @electron/rebuild
// because node-gyp source compilation requires MSBuild in PATH.  The prebuilt
// download is deterministic and works on any machine.

const https  = require("https");
const zlib   = require("zlib");
const path   = require("path");
const fs     = require("fs");
const { execFileSync } = require("child_process");

function downloadBuffer(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 10) { reject(new Error("Too many redirects")); return; }
    https.get(url, { headers: { "User-Agent": "node/after-pack" } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        downloadBuffer(res.headers.location, hops + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function parseTarGz(buf) {
  const files = new Map();
  const raw = zlib.gunzipSync(buf);
  let offset = 0;
  while (offset + 512 <= raw.length) {
    const header = raw.slice(offset, offset + 512);
    const name = header.slice(0, 100).toString("utf8").replace(/\0+$/, "");
    if (!name) break;
    const sizeOctal = header.slice(124, 136).toString("utf8").trim().replace(/\0+$/, "");
    const size = parseInt(sizeOctal, 8) || 0;
    const typeflag = header.slice(156, 157).toString("utf8");
    offset += 512;
    if (typeflag === "0" || typeflag === "") {
      files.set(name, raw.slice(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

exports.default = async ({ appOutDir, packager }) => {
  const standaloneDir = path.join(appOutDir, "resources", "app", "standalone");

  if (!fs.existsSync(path.join(standaloneDir, "node_modules"))) {
    console.log("[afterPack] No standalone node_modules — skipping.");
    return;
  }

  const electronExe = path.join(
    packager.projectDir, "node_modules", "electron", "dist", "electron.exe"
  );
  const electronPkg = JSON.parse(fs.readFileSync(
    path.join(packager.projectDir, "node_modules", "electron", "package.json"), "utf-8"
  ));
  const bsqliteVersion = JSON.parse(fs.readFileSync(
    path.join(standaloneDir, "node_modules", "better-sqlite3", "package.json"), "utf-8"
  )).version;

  let electronAbi;
  try {
    electronAbi = execFileSync(
      electronExe,
      ["-e", "process.stdout.write(process.versions.modules)"],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 10000 }
    ).toString().trim();
  } catch (e) {
    console.error("[afterPack] ERROR: Could not determine Electron ABI:", e.message);
    process.exit(1);
  }

  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsqliteVersion}/better-sqlite3-v${bsqliteVersion}-electron-v${electronAbi}-win32-x64.tar.gz`;
  console.log(`[afterPack] Downloading better-sqlite3 v${bsqliteVersion} for Electron ${electronPkg.version} (ABI ${electronAbi})...`);

  const tarBuf = await downloadBuffer(url);
  const files = parseTarGz(tarBuf);

  let nodeEntry;
  for (const [k, v] of files) {
    if (k.endsWith("better_sqlite3.node")) { nodeEntry = v; break; }
  }
  if (!nodeEntry) {
    console.error("[afterPack] ERROR: better_sqlite3.node not found in tarball.");
    process.exit(1);
  }

  // Install to primary location
  const primaryDir = path.join(standaloneDir, "node_modules", "better-sqlite3", "build", "Release");
  fs.mkdirSync(primaryDir, { recursive: true });
  const primary = path.join(primaryDir, "better_sqlite3.node");
  fs.writeFileSync(primary, nodeEntry);
  console.log("[afterPack]   Installed → standalone/node_modules/better-sqlite3/build/Release/");

  // Patch hashed bundler copies
  const nextModules = path.join(standaloneDir, ".next", "node_modules");
  let patched = 0;
  if (fs.existsSync(nextModules)) {
    for (const name of fs.readdirSync(nextModules)) {
      if (!name.startsWith("better-sqlite3")) continue;
      const dest = path.join(nextModules, name, "build", "Release", "better_sqlite3.node");
      if (fs.existsSync(dest)) {
        fs.writeFileSync(dest, nodeEntry);
        console.log(`[afterPack]   Patched  → .next/node_modules/${name}/build/Release/`);
        patched++;
      }
    }
  }
  if (patched === 0) {
    console.warn("[afterPack]   Warning: no hashed copies found in .next/node_modules/");
  }

  console.log(`[afterPack] Done — 1 primary + ${patched} hashed copy/copies patched.`);
};

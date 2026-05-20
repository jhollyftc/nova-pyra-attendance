// Downloads the prebuilt better-sqlite3 binary for Electron's ABI and installs
// it into .next/standalone — both the standard location and the hashed bundler
// copy that Next.js 16 creates.
//
// Why not @electron/rebuild?  On machines without MSBuild in PATH, node-gyp
// source compilation fails silently and prebuild-install falls back to the
// system Node.js binary (ABI 137 on Node 24).  Downloading the GitHub-release
// prebuilt is deterministic and requires no C++ toolchain.
//
// Must run AFTER `next build` and BEFORE electron-builder.

const https  = require("https");
const zlib   = require("zlib");
const path   = require("path");
const fs     = require("fs");
const { execFileSync } = require("child_process");

const root       = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

// ── Resolve versions ──────────────────────────────────────────────────────────
const electronPkg  = JSON.parse(fs.readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf-8"));
const electronExe  = path.join(root, "node_modules", "electron", "dist", "electron.exe");

const bsqlitePkgPath = path.join(standalone, "node_modules", "better-sqlite3", "package.json");
if (!fs.existsSync(bsqlitePkgPath)) {
  console.error("ERROR: better-sqlite3 not found in standalone/node_modules. Run `next build` first.");
  process.exit(1);
}
const bsqliteVersion = JSON.parse(fs.readFileSync(bsqlitePkgPath, "utf-8")).version;

// Ask Electron's own binary what ABI it needs — avoids hard-coding.
let electronAbi;
try {
  electronAbi = execFileSync(
    electronExe,
    ["-e", "process.stdout.write(process.versions.modules)"],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 10000 }
  ).toString().trim();
} catch (e) {
  console.error("ERROR: Could not determine Electron ABI:", e.message);
  process.exit(1);
}

const TARBALL_URL = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsqliteVersion}/better-sqlite3-v${bsqliteVersion}-electron-v${electronAbi}-win32-x64.tar.gz`;

// ── Download helper (follows redirects, returns Buffer) ───────────────────────
function downloadBuffer(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 10) { reject(new Error("Too many redirects")); return; }
    https.get(url, { headers: { "User-Agent": "node/rebuild-native" } }, (res) => {
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

// ── Pure-JS .tar.gz extractor ─────────────────────────────────────────────────
// Returns a Map<string, Buffer> of path → content for every file in the archive.
function parseTarGz(buf) {
  const files = new Map();
  const raw = zlib.gunzipSync(buf);
  let offset = 0;

  while (offset + 512 <= raw.length) {
    const header = raw.slice(offset, offset + 512);
    const name = header.slice(0, 100).toString("utf8").replace(/\0+$/, "");
    if (!name) break; // end-of-archive marker

    const sizeOctal = header.slice(124, 136).toString("utf8").trim().replace(/\0+$/, "");
    const size = parseInt(sizeOctal, 8) || 0;
    const typeflag = header.slice(156, 157).toString("utf8");

    offset += 512; // skip header block

    if (typeflag === "0" || typeflag === "") {
      // Regular file
      files.set(name, raw.slice(offset, offset + size));
    }

    // Advance past data blocks (padded to 512)
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`better-sqlite3 v${bsqliteVersion} — Electron ${electronPkg.version} (ABI ${electronAbi})`);
  console.log(`Downloading prebuilt binary...`);
  console.log(`  ${TARBALL_URL}`);

  const tarBuf = await downloadBuffer(TARBALL_URL);
  console.log(`  Downloaded ${(tarBuf.length / 1024).toFixed(0)} KB. Parsing archive...`);

  const files = parseTarGz(tarBuf);

  // The tarball contains build/Release/better_sqlite3.node (possibly with a
  // leading "package/" or "better-sqlite3/" directory depending on release).
  let nodeEntry;
  for (const [k, v] of files) {
    if (k.endsWith("better_sqlite3.node")) {
      nodeEntry = v;
      break;
    }
  }

  if (!nodeEntry) {
    console.error("ERROR: better_sqlite3.node not found in tarball. Entries found:");
    for (const k of files.keys()) console.error(" ", k);
    process.exit(1);
  }

  // ── Install to primary location ─────────────────────────────────────────────
  const primaryDir = path.join(standalone, "node_modules", "better-sqlite3", "build", "Release");
  fs.mkdirSync(primaryDir, { recursive: true });
  const primary = path.join(primaryDir, "better_sqlite3.node");
  fs.writeFileSync(primary, nodeEntry);
  console.log("  Installed → standalone/node_modules/better-sqlite3/build/Release/");

  // ── Verify it actually loads in Electron ────────────────────────────────────
  const script = `try{require(${JSON.stringify(primary)});process.stdout.write('ok')}catch(e){process.stdout.write('err:'+e.message)}`;
  let verifyOut;
  try {
    verifyOut = execFileSync(electronExe, ["-e", script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      timeout: 10000,
    }).toString().trim();
  } catch (e) {
    verifyOut = "err:" + e.message;
  }

  if (verifyOut !== "ok") {
    console.error("ERROR: downloaded binary fails to load in Electron:", verifyOut);
    process.exit(1);
  }
  console.log("  Verified — binary loads correctly in Electron");

  // ── Patch hashed bundler copies in .next/node_modules/ ─────────────────────
  const nextModules = path.join(standalone, ".next", "node_modules");
  let patched = 0;

  if (fs.existsSync(nextModules)) {
    for (const name of fs.readdirSync(nextModules)) {
      if (!name.startsWith("better-sqlite3")) continue;
      const dest = path.join(nextModules, name, "build", "Release", "better_sqlite3.node");
      if (fs.existsSync(dest)) {
        fs.writeFileSync(dest, nodeEntry);
        console.log(`  Patched  → .next/node_modules/${name}/build/Release/`);
        patched++;
      }
    }
  }

  if (patched === 0) {
    console.warn("  Warning: no hashed copies found in .next/node_modules/ — path may have changed.");
  }

  console.log(`Done — 1 primary + ${patched} hashed copy/copies patched.`);
}

main().catch((err) => {
  console.error("rebuild-native failed:", err.message);
  process.exit(1);
});

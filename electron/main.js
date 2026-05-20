const {
  app,
  BrowserWindow,
  shell,
  globalShortcut,
  dialog,
} = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");

const PORT = 3001;

const STANDALONE_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app", "standalone")
  : path.join(__dirname, "..", ".next", "standalone");

const SERVER_JS = path.join(STANDALONE_DIR, "server.js");

let mainWindow = null;
let serverProcess = null;

// Loads env.json from userData; auto-generates SESSION_SECRET if absent.
// Users can add ADMIN_PASSWORD_HASH and other vars to this file.
function loadConfig() {
  const configPath = path.join(app.getPath("userData"), "env.json");
  let config = {};

  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {}

  if (!config.SESSION_SECRET) {
    config.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  return config;
}

function waitForServer(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}`, (res) => {
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeout) {
          reject(new Error("Server did not start within 30 seconds"));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
  });
}

function startServer(config) {
  const dbPath = path.join(app.getPath("userData"), "nova-pyra.db");

  serverProcess = spawn(process.execPath, [SERVER_JS], {
    env: {
      ...process.env,
      ...config,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      DB_PATH: dbPath,
    },
    cwd: STANDALONE_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logPath = path.join(app.getPath("userData"), "server.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const logLine = (prefix, data) => {
    const line = `[${new Date().toISOString()}] ${prefix} ${data.toString().trimEnd()}\n`;
    logStream.write(line);
  };

  serverProcess.stdout.on("data", (d) => logLine("[out]", d));
  serverProcess.stderr.on("data", (d) => logLine("[err]", d));
  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      logLine("[exit]", `Server exited with code ${code}`);
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const config = loadConfig();
  startServer(config);

  try {
    await waitForServer();
  } catch (err) {
    const logPath = path.join(app.getPath("userData"), "server.log");
    dialog.showErrorBox(
      "Startup Error",
      `The Nova Pyra server failed to start:\n${err.message}\n\nLog: ${logPath}`
    );
    app.quit();
    return;
  }

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.show();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  globalShortcut.register("Escape", async () => {
    if (!mainWindow) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Cancel", "Close App"],
      defaultId: 0,
      cancelId: 0,
      title: "Nova Pyra Attendance",
      message: "Close the application?",
    });
    if (response === 1) app.quit();
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProcess) serverProcess.kill();
});

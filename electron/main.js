const { app, BrowserWindow, Menu, globalShortcut } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 3000;
let mainWindow = null;
let serverProcess = null;

function startNextServer() {
  const root = path.join(__dirname, "..");
  serverProcess = spawn("npm", ["run", "start"], {
    cwd: root,
    shell: true,
    windowsHide: true,
    env: { ...process.env },
  });
  serverProcess.stdout?.on("data", (d) => process.stdout.write(d));
  serverProcess.stderr?.on("data", (d) => process.stderr.write(d));
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (n <= 0) return reject(new Error("Server did not start in time."));
        setTimeout(() => attempt(n - 1), 500);
      });
      req.end();
    };
    attempt(retries);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  Menu.setApplicationMenu(null);

  // Show a simple loading screen while the server boots
  await mainWindow.loadURL("about:blank");
  await mainWindow.webContents.executeJavaScript(`
    document.body.style.cssText =
      'margin:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;';
    document.body.innerHTML =
      '<p style="color:#1173F1;font-family:sans-serif;font-size:1.75rem;font-weight:700;letter-spacing:.05em">Nova Pyra</p>' +
      '<p style="color:#9ca3af;font-family:sans-serif;font-size:1rem">Starting up…</p>';
  `);
  mainWindow.show();

  try {
    await waitForServer();
    mainWindow.loadURL(`http://localhost:${PORT}/kiosk`);
  } catch {
    mainWindow.webContents.executeJavaScript(`
      document.body.innerHTML =
        '<p style="color:#ef4444;font-family:sans-serif;font-size:1rem;text-align:center;padding:2rem">' +
        'Server failed to start.<br>Run <code>npm run build</code> and try again.</p>';
    `);
  }
}

app.whenReady().then(async () => {
  startNextServer();
  await createWindow();

  // F11 — toggle fullscreen
  globalShortcut.register("F11", () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  // Ctrl+Shift+Q — quit
  globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on("window-all-closed", () => app.quit());

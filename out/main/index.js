let electron = require("electron");
let node_path = require("node:path");
// src/main/index.ts
var sessions = [];
var groups = [];
var runs = [];
function registerContract() {
	electron.ipcMain.handle("sessions:list", () => sessions);
	electron.ipcMain.handle("groups:list", () => groups);
	electron.ipcMain.handle("runs:list", () => runs);
	electron.ipcMain.handle("chat:send", (_event, _sessionId, _text) => ({ ok: false }));
}
function createWindow() {
	const window = new electron.BrowserWindow({
		width: 1440,
		height: 900,
		webPreferences: {
			preload: (0, node_path.join)(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	if (process.env["ELECTRON_RENDERER_URL"]) window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	else window.loadFile((0, node_path.join)(__dirname, "../renderer/index.html"));
}
electron.app.whenReady().then(() => {
	registerContract();
	createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") electron.app.quit();
});

let electron = require("electron");
// src/preload/index.ts
electron.contextBridge.exposeInMainWorld("graphpi", {
	listSessions: () => electron.ipcRenderer.invoke("sessions:list"),
	listGroups: () => electron.ipcRenderer.invoke("groups:list"),
	listRuns: () => electron.ipcRenderer.invoke("runs:list"),
	sendPrompt: (sessionId, text) => electron.ipcRenderer.invoke("chat:send", sessionId, text)
});

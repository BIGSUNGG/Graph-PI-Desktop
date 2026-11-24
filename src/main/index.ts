import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc.ts';
import { createOrcaService } from './orca/index.ts';
import { createPiService } from './pi/index.ts';
import { createIndexService } from './db/index.ts';
import { createGroupStore } from './state/groups.ts';
import { createSettingsStore } from './state/store.ts';
import { appendAnswer, readSnapshot } from './harness/bridge.ts';
import { appSettingsFile, indexDbPath } from './paths.ts';

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0b0d12',
    title: 'graph-pi',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  // 외부 링크는 앱 안에서 열지 않는다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl !== undefined) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));

  return win;
}

void app.whenReady().then(() => {
  const settings = createSettingsStore(appSettingsFile());
  const groups = createGroupStore();
  const orca = createOrcaService({ intervalMs: 3_000 });
  const pi = createPiService();
  const index = createIndexService({ dbPath: indexDbPath() });

  const ipc = registerIpc({ groups, settings, orca, pi, index, harness: {
    readSnapshot,
    append: async (groupId, record) => {
      await appendAnswer(groupId, record);
    },
  } });

  orca.start();
  pi.start();
  index.start();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('before-quit', () => {
    ipc.dispose();
    orca.stop();
    pi.stop();
    index.stop();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

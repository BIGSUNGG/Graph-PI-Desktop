import { contextBridge, ipcRenderer } from 'electron';
import { EVT_CHANNEL } from '../shared/contract/index.ts';
import type { GraphPiApi, IpcChannel, IpcRequest, IpcResult, PushEvent } from '../shared/contract/index.ts';

const api: GraphPiApi = {
  invoke: <K extends IpcChannel>(channel: K, request: IpcRequest<K>): Promise<IpcResult<K>> =>
    ipcRenderer.invoke(channel, request) as Promise<IpcResult<K>>,
  subscribe: (listener: (event: PushEvent) => void): (() => void) => {
    const handler = (_event: unknown, payload: PushEvent): void => listener(payload);
    ipcRenderer.on(EVT_CHANNEL, handler);
    return () => {
      ipcRenderer.off(EVT_CHANNEL, handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);

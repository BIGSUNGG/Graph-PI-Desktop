import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 앱과 하네스가 공유하는 데이터 경로. Electron 밖(Pi 확장)에서도 같은 규칙을 쓰도록
 * `app.getPath` 대신 홈 기준 경로를 쓴다. `GRAPH_PI_DATA_DIR` 로 덮어쓸 수 있다.
 */
export function dataDir(): string {
  const override = process.env['GRAPH_PI_DATA_DIR'];
  return override !== undefined && override.length > 0 ? override : join(homedir(), '.graph-pi', 'data');
}

export function groupsDir(): string {
  return join(dataDir(), 'groups');
}

export function groupStateFile(groupId: string): string {
  return join(groupsDir(), groupId, 'state.jsonl');
}

export function indexDbPath(): string {
  return join(dataDir(), 'index.sqlite');
}

export function appSettingsFile(): string {
  return join(dataDir(), 'app-settings.json');
}

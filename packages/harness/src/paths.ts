import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 하네스 상태 저장 루트. 앱의 `src/main/paths.ts` 와 같은 규칙을 쓴다(앱은 Electron 없이도
 * 같은 파일을 읽어야 하지만, 패키지 경계를 넘는 import 를 만들지 않으려고 규칙만 맞춘다).
 */
export function dataDir(): string {
  return process.env['GRAPH_PI_DATA_DIR'] ?? join(homedir(), '.graph-pi', 'data');
}

export function groupStateFile(groupId: string): string {
  return join(dataDir(), 'groups', groupId, 'state.jsonl');
}

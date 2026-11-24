/**
 * 세션 계보 계산. 워크트리(그룹 루트) 기준 묶음 → 부모/자식 트리 → PTY 실행 영수증 매칭.
 *
 * 근거: `.crew/handoff/mvp-implementation-map.md` §P2·P3, §미해결 모호성
 * - 세션 파일만으로는 그룹을 알 수 없다. 그룹 루트(워크트리 경로) 하위 cwd 세션만 그 그룹으로 본다.
 * - 허브 세션은 워크트리가 아니라 상위 저장소에서 실행된다(목업 `MOCK.sessions` 의 `wt: null`).
 * - 감사 세션 표식은 하네스 Audit 레코드의 `auditSessionId`(A8)가 1순위, 없으면 파일명 `audit` 토큰.
 * - A4 결정: PTY↔세션은 "cwd 동일 + 실행 시각 이후 90초 창의 가장 이른 미사용 세션"으로 매칭한다.
 */
import type {
  PiSession,
  SessionFileInfo,
  SessionMatch,
  TokenUsage,
} from '../../shared/contract/pi.ts';
import { EMPTY_USAGE } from '../../shared/contract/pi.ts';
import { lastPathSegment, sessionNameFromFileName, stateOf } from './session-file.ts';

/** PTY 실행 시각 이후 세션 파일이 생길 수 있는 창(A4). */
export const MATCH_WINDOW_MS = 90_000;

/** 경로 비교용 정규화. Windows 는 대소문자를 구분하지 않는다. */
export function normalizeComparePath(path: string): string {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed;
}

function isUnder(child: string, parent: string): boolean {
  if (parent.length === 0) return false;
  return child === parent || child.startsWith(`${parent}/`);
}

/** `parent` 가 `child` 의 상위 경로인가(같으면 false). */
function isStrictAncestor(parent: string, child: string): boolean {
  return parent !== child && child.startsWith(`${parent}/`);
}

/**
 * 세션 파일에 남는 제목은 없다(§레코드 타입 표에 제목 레코드가 없다).
 * 파일명에 이름 조각이 있으면 그 값을, 없으면 워크트리 폴더명을 쓴다.
 */
export function titleForFile(info: SessionFileInfo): string {
  const named = sessionNameFromFileName(lastPathSegment(info.filePath));
  if (named !== null) return named;
  const dir = info.cwd === null ? '' : lastPathSegment(info.cwd).trim();
  if (dir.length > 0 && dir !== '.' && dir !== '/') return dir;
  return `세션 ${info.sessionId.slice(0, 8)}`;
}

const AUDIT_MARKER = /(^|[^a-z0-9])audit([^a-z0-9]|$)/i;

function hasAuditMarker(info: SessionFileInfo): boolean {
  const stem = lastPathSegment(info.filePath).replace(/\.jsonl$/i, '');
  return AUDIT_MARKER.test(stem);
}

export type GroupSessionsOptions = {
  /** 그룹이 관리하는 워크트리 경로들. */
  groupRoots: string[];
  /** 그룹이 지정한 허브 세션 ID. 있으면 그 세션은 루트 하위가 아니어도 포함하고 `isHub` 로 표시한다. */
  primarySessionId?: string | null;
  /** 하네스 Audit 레코드가 알려준 감사 세션 ID(A8). */
  auditSessionIds?: readonly string[];
  /** `PiSession.groupId`. 없으면 매칭된 그룹 루트 경로를 쓴다. */
  groupId?: string;
};

/**
 * cwd 가 그룹 루트 하위인 세션만 골라 `PiSession` 으로 만든다.
 * - 허브: 그룹이 지정한 세션(`primarySessionId`) 또는 cwd 가 워크트리 루트의 상위 저장소인 세션.
 * - 감사: `auditSessionIds` 에 있거나 파일명에 `audit` 토큰이 있는 세션. 근거가 없으면 `false`.
 */
export function groupSessions(files: SessionFileInfo[], opts: GroupSessionsOptions): PiSession[] {
  const roots = opts.groupRoots
    .map((root) => normalizeComparePath(root))
    .filter((root) => root.length > 0);
  const auditIds = new Set<string>(opts.auditSessionIds ?? []);
  const primary = opts.primarySessionId ?? null;
  const sessions: PiSession[] = [];

  for (const file of files) {
    const cwd = file.cwd === null ? null : normalizeComparePath(file.cwd);
    const matchedRoot = cwd === null ? null : (roots.find((root) => isUnder(cwd, root)) ?? null);
    const ancestorOfRoot = cwd !== null && roots.some((root) => isStrictAncestor(cwd, root));
    const isPrimary = primary !== null && primary === file.sessionId;
    if (matchedRoot === null && !ancestorOfRoot && !isPrimary) continue;

    const lastActivityAt = new Date(file.mtimeMs).toISOString();
    const usage: TokenUsage = { ...EMPTY_USAGE };
    sessions.push({
      id: file.sessionId,
      groupId: opts.groupId ?? matchedRoot ?? '',
      title: titleForFile(file),
      // Orca 워크트리 id 매핑은 orca 계층 담당이다. 여기서는 원문 cwd 를 그대로 넘긴다.
      worktreeId: file.cwd,
      model: null,
      // 파일이 있으면 최소 1턴이 시작된 것이다. assistant 응답 유무는 메시지를 읽어야 알 수 있다.
      state: stateOf(lastActivityAt, true),
      startedAt: file.createdAt,
      lastActivityAt,
      usage,
      parentSessionId: file.parentSessionId,
      isAudit: auditIds.has(file.sessionId) || hasAuditMarker(file),
      isHub: isPrimary || (matchedRoot === null && ancestorOfRoot),
      filePath: file.filePath,
      pendingLaunch: false,
    });
  }

  sessions.sort(
    (left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id),
  );
  return sessions;
}

export type SessionTreeNode = { session: PiSession; children: SessionTreeNode[] };

/**
 * `parentSessionId` 로 재귀 트리를 만든다. 부모가 목록에 없으면 루트다.
 * 순환(손상된 파일)은 루트로 끊는다.
 */
export function buildForest(sessions: PiSession[]): SessionTreeNode[] {
  const nodes = new Map<string, SessionTreeNode>();
  for (const session of sessions) nodes.set(session.id, { session, children: [] });

  const parentOf = new Map<string, string | null>();
  for (const session of sessions) parentOf.set(session.id, session.parentSessionId);

  const roots: SessionTreeNode[] = [];
  for (const session of sessions) {
    const node = nodes.get(session.id);
    if (node === undefined) continue;
    const parentId = session.parentSessionId;
    const parent = parentId === null ? undefined : nodes.get(parentId);
    if (parent === undefined || parent === node || createsCycle(session.id, parentOf)) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  sortTree(roots);
  return roots;
}

function createsCycle(startId: string, parentOf: Map<string, string | null>): boolean {
  const seen = new Set<string>();
  let current = parentOf.get(startId) ?? null;
  while (current !== null) {
    if (current === startId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

function sortTree(nodes: SessionTreeNode[]): void {
  nodes.sort(
    (left, right) =>
      left.session.startedAt.localeCompare(right.session.startedAt) ||
      left.session.id.localeCompare(right.session.id),
  );
  for (const node of nodes) {
    if (node.children.length > 0) sortTree(node.children);
  }
}

export type LaunchCandidate = { cwd: string; at: string; terminalId: string | null };

/**
 * A4: cwd 가 같고 `at` 이후 90초 창 안에서 가장 이른 **미사용** 세션을 매칭한다.
 * 매칭이 없으면 `{ matchedBy: 'unmatched' }` 이고 `sessionId` 는 빈 문자열이다.
 * 같은 세션을 두 실행에 다시 쓰지 않는다.
 */
export function matchLaunch(files: SessionFileInfo[], launches: LaunchCandidate[]): SessionMatch[] {
  const ordered = [...files].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.sessionId.localeCompare(right.sessionId),
  );
  const used = new Set<string>();
  const matches: SessionMatch[] = [];

  for (const launch of launches) {
    const cwd = normalizeComparePath(launch.cwd);
    const at = Date.parse(launch.at);
    let matched: SessionFileInfo | null = null;

    if (Number.isFinite(at)) {
      for (const file of ordered) {
        if (used.has(file.sessionId)) continue;
        if (file.cwd === null || normalizeComparePath(file.cwd) !== cwd) continue;
        const created = Date.parse(file.createdAt);
        if (!Number.isFinite(created)) continue;
        const delta = created - at;
        if (delta < 0 || delta > MATCH_WINDOW_MS) continue;
        // 정렬이 오름차순이므로 첫 후보가 '가장 이른 미사용 세션'이다.
        matched = file;
        break;
      }
    }

    if (matched === null) {
      matches.push({ sessionId: '', terminalId: launch.terminalId, matchedBy: 'unmatched' });
      continue;
    }
    used.add(matched.sessionId);
    matches.push({
      sessionId: matched.sessionId,
      terminalId: launch.terminalId,
      matchedBy: 'cwd-time-window',
    });
  }

  return matches;
}

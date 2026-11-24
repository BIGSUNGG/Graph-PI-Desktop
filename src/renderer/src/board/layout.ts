/**
 * 보드 좌표 계산. 목업 `mock/index.html:1208-1490` 의 수식을 그대로 옮긴 순수 함수다.
 * DOM·store 에 의존하지 않으므로 단위 테스트에서 그대로 호출할 수 있다.
 */
import type { PiSession, TokenUsage, WorktreeView } from '../../../shared/contract/index.ts';

/** 목업 `var G = {…}`(mock/index.html:1208). 값을 바꾸면 목업 좌표와 어긋난다. */
export const BOARD_METRICS = {
  pad: 16,
  colW: 206,
  gap: 14,
  head: 46,
  rowH: 36,
  chipH: 18,
  hubH: 52,
} as const;

/** 계약 `Group`(shared/contract/app.ts:11) 과 구조가 같다. 보드는 허브 세션 id 만 있으면 그린다. */
export type GroupView = {
  id: string;
  name: string;
  note: string;
  hubSessionId: string | null;
  parentRepo: string;
};

export type SlotKind = 'good' | 'active' | 'wait' | 'bad' | 'none';

export type BoardHubNode = {
  kind: 'hub';
  session: PiSession;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 허브 카드 오른쪽에 `N 레포 관리` 로 쓰는 워크트리 수(mock/index.html:1229). */
  repoCount: number;
};

export type BoardWorktreeNode = {
  kind: 'worktree';
  worktree: WorktreeView;
  x: number;
  y: number;
  width: number;
  height: number;
  sessionCount: number;
};

/** 그룹 경계 박스. 목업 렌더(mock/_evidence/mock-board.png)의 점선 박스 + 그룹 제목을 옮긴 것이다. */
export type BoardGroupNode = {
  kind: 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  /** 그룹 이름(실데이터). 목업의 `온보딩 4웨이브 통합 진행` 자리. */
  title: string;
  sessionCount: number;
  worktreeCount: number;
};

/** 세션 노드의 `x`·`y` 는 원 중심(목업 :1320-1322). */
export type BoardSessionNode = {
  kind: 'session';
  session: PiSession;
  x: number;
  y: number;
  /** 소속 컬럼 좌상단·폭. 오른쪽 정렬 요소(슬롯 점)에 쓴다. */
  columnX: number;
  columnWidth: number;
  depth: number;
};

export type BoardNode = BoardGroupNode | BoardHubNode | BoardWorktreeNode | BoardSessionNode;

/** 목업이 그리는 5종 선. 색·점선은 EdgeLayer 가 종류별로 고른다. */
export type BoardEdgeKind = 'group-worktree' | 'worktree-parent' | 'parent-session' | 'audit' | 'cross';

export type BoardEdge = {
  id: string;
  kind: BoardEdgeKind;
  path: string;
  /** 양 끝 세션 중 하나가 running 이면 흐르는 점선. */
  active: boolean;
};

export type BoardMarkerKind = 'audit' | 'cross';

export type BoardMarker = {
  id: string;
  kind: BoardMarkerKind;
  sessionId: string;
  /** 텍스트 기준점(우측 정렬). */
  x: number;
  y: number;
  label: string;
  title: string;
};

export type BoardLayout = {
  nodes: BoardNode[];
  edges: BoardEdge[];
  markers: BoardMarker[];
  width: number;
  height: number;
};

export type LayoutInput = {
  groups: GroupView[];
  worktrees: WorktreeView[];
  sessions: PiSession[];
  collapsed: Record<string, boolean>;
};

/** 목업의 빈 보드 viewBox(mock/index.html:1282). */
const EMPTY_BOARD: BoardLayout = { nodes: [], edges: [], markers: [], width: 900, height: 480 };

type SessionRow = { session: PiSession; depth: number; y: number; cross: PiSession | null };

type Column = {
  worktree: WorktreeView;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: SessionRow[];
};

type Position = {
  x: number;
  y: number;
  column: Column;
  depth: number;
  cross: PiSession | null;
};

export type SessionTreeRow = {
  session: PiSession;
  depth: number;
  /** 목업 `sessionForest` 의 `├─ `/`└─ ` 접두(루트는 빈 문자열). */
  guide: string;
  /** 다른 워크트리에 있는 상위(교차 표시 대상). */
  cross: PiSession | null;
};

export function layoutBoard(input: LayoutInput): BoardLayout {
  const activeGroup = input.groups.find((group) => input.collapsed[group.id] !== true) ?? null;
  if (activeGroup === null) return EMPTY_BOARD;

  const groupSessions = input.sessions.filter((session) => session.groupId === activeGroup.id);
  const byId = new Map<string, PiSession>(groupSessions.map((session) => [session.id, session]));
  const hub = findHub(activeGroup, groupSessions);
  // 접힌 그룹은 허브만 남긴다(목업 사이드바의 그룹 접힘과 같은 의미).
  const worktrees =
    input.collapsed[activeGroup.id] === true
      ? []
      : input.worktrees.filter((worktree) => worktree.groupId === activeGroup.id);

  if (worktrees.length === 0) {
    if (hub === null) return EMPTY_BOARD;
    return {
      nodes: [
        {
          kind: 'hub',
          session: hub,
          x: BOARD_METRICS.pad,
          y: BOARD_METRICS.pad,
          width: 900 - BOARD_METRICS.pad * 2,
          height: BOARD_METRICS.hubH,
          repoCount: 0,
        },
      ],
      edges: [],
      markers: [],
      width: 900,
      height: 480,
    };
  }

  const {
    all,
    columns,
    rootColumn,
    totalWidth,
    hubX,
    hubY,
    hubWidth,
    hubBottom,
    hubCenterX,
    topBottom,
    topCenter,
    childTop,
  } = placeColumns(worktrees, groupSessions, byId, hub);

  const positions = new Map<string, Position>();
  for (const column of all) {
    for (const row of column.rows) {
      positions.set(row.session.id, {
        x: column.x + 20 + row.depth * 10,
        y: row.y + 9,
        column,
        depth: row.depth,
        cross: row.cross,
      });
    }
  }

  const columnBottom = Math.max(childTop, ...all.map((column) => column.y + column.height));
  const edges: BoardEdge[] = [];
  let edgeSeq = 0;
  const nextId = (): string => {
    edgeSeq += 1;
    return `e${edgeSeq}`;
  };
  let bottomExtra = 0;
  const hubBusY = hubBottom + 6;

  for (const session of groupSessions) {
    const child = positions.get(session.id);
    if (child === undefined) continue;
    const parent = session.parentSessionId === null ? null : byId.get(session.parentSessionId) ?? null;
    if (parent === null) continue;
    const parentPosition = positions.get(parent.id);
    const parentIsHub = hub !== null && parent.id === hub.id;
    if (parentPosition === undefined && !parentIsHub) continue;
    const flowing = session.state === 'running' || parent.state === 'running';

    if (parentIsHub) {
      const lane = child.column.x - 7;
      edges.push({
        id: nextId(),
        kind: 'group-worktree',
        active: flowing,
        path: `M${hubCenterX} ${hubBottom} L${hubCenterX} ${hubBusY} L${lane} ${hubBusY} L${lane} ${child.y} L${child.x - 6} ${child.y}`,
      });
      bottomExtra = Math.max(bottomExtra, hubBusY + 8);
      continue;
    }
    if (parentPosition === undefined) continue;

    if (parentPosition.column === child.column) {
      // 부모 depth 마다 레인을 분리한다(mock/index.html:1376-1381).
      const lane = parentPosition.column.x + 7 + parentPosition.depth * 6;
      edges.push({
        id: nextId(),
        kind: session.isAudit ? 'audit' : 'parent-session',
        active: flowing,
        path: `M${parentPosition.x - 3} ${parentPosition.y + 5} L${lane} ${parentPosition.y + 5} L${lane} ${child.y} L${child.x - 6} ${child.y}`,
      });
      continue;
    }

    const laneY = columnBottom + 14;
    const parentLane = parentPosition.column.x - 7;
    const childLane = child.column.x - 7;
    edges.push({
      id: nextId(),
      kind: 'cross',
      active: flowing,
      path: `M${parentPosition.x - 6} ${parentPosition.y} L${parentLane} ${parentPosition.y} L${parentLane} ${laneY} L${childLane} ${laneY} L${childLane} ${child.y} L${child.x - 6} ${child.y}`,
    });
    bottomExtra = Math.max(bottomExtra, laneY);
  }

  // 워크트리 계층선: 자식 컬럼 → 상위 컬럼. 루트 컬럼이 있으면 위로 도는 버스(mock :1398-1405).
  for (const column of columns) {
    const parentWorktreeId = column.worktree.parentWorktreeId;
    if (parentWorktreeId === null) continue;
    const parentColumn = all.find((candidate) => candidate.worktree.id === parentWorktreeId) ?? null;
    if (parentColumn === null) continue;
    const flowing = column.rows.some((row) => row.session.state === 'running') ||
      parentColumn.rows.some((row) => row.session.state === 'running');
    if (parentColumn === rootColumn) {
      const centerX = column.x + column.width / 2;
      const busY = topBottom + 16;
      edges.push({
        id: nextId(),
        kind: 'worktree-parent',
        active: flowing,
        path: `M${centerX} ${column.y} L${centerX} ${busY} L${topCenter} ${busY} L${topCenter} ${parentColumn.y + parentColumn.height}`,
      });
      continue;
    }
    const parentRight = parentColumn.x + parentColumn.width;
    const laneY = Math.max(parentColumn.y + parentColumn.height, column.y + column.height) + 14;
    const endX = column.x + column.width / 2;
    edges.push({
      id: nextId(),
      kind: 'worktree-parent',
      active: flowing,
      path: `M${parentRight} ${parentColumn.y + parentColumn.height - 6} L${parentRight + 9} ${parentColumn.y + parentColumn.height - 6} L${parentRight + 9} ${laneY} L${endX} ${laneY} L${endX} ${column.y + column.height}`,
    });
    bottomExtra = Math.max(bottomExtra, laneY);
  }

  const markers: BoardMarker[] = [];
  for (const column of all) {
    const right = column.x + column.width;
    for (const row of column.rows) {
      if (row.session.isAudit) {
        markers.push({
          id: `audit-${row.session.id}`,
          kind: 'audit',
          sessionId: row.session.id,
          x: right - 10,
          y: row.y + 13,
          label: 'AUDIT',
          title: '감사 세션',
        });
      }
      if (row.cross !== null) {
        markers.push({
          id: `cross-${row.session.id}`,
          kind: 'cross',
          sessionId: row.session.id,
          x: right - 10,
          y: row.y + 2,
          label: '↖',
          title: `상위: ${row.cross.title}`,
        });
      }
    }
  }

  const nodes: BoardNode[] = [];
  // 그룹 경계 박스는 맨 앞에 두어 카드 뒤에 그려지게 한다. 제목 높이(30px)가 위로 확보될 때만 그린다.
  const boxLeft = Math.min(...all.map((column) => column.x)) - 8;
  const boxRight = Math.max(...all.map((column) => column.x + column.width)) + 8;
  const boxTop = Math.min(...all.map((column) => column.y)) - 30;
  const boxBottom = Math.max(...all.map((column) => column.y + column.height)) + 8;
  if (boxTop >= 4) {
    nodes.push({
      kind: 'group',
      x: boxLeft,
      y: boxTop,
      width: boxRight - boxLeft,
      height: boxBottom - boxTop,
      title: activeGroup.name,
      sessionCount: groupSessions.length,
      worktreeCount: worktrees.length,
    });
  }
  if (hub !== null) {
    nodes.push({
      kind: 'hub',
      session: hub,
      x: hubX,
      y: hubY,
      width: hubWidth,
      height: BOARD_METRICS.hubH,
      repoCount: worktrees.length,
    });
  }
  for (const column of all) {
    nodes.push({
      kind: 'worktree',
      worktree: column.worktree,
      x: column.x,
      y: column.y,
      width: column.width,
      height: column.height,
      sessionCount: column.rows.length,
    });
  }
  for (const column of all) {
    for (const row of column.rows) {
      const position = positions.get(row.session.id);
      if (position === undefined) continue;
      nodes.push({
        kind: 'session',
        session: row.session,
        x: position.x,
        y: position.y,
        columnX: column.x,
        columnWidth: column.width,
        depth: row.depth,
      });
    }
  }

  let maxBottom: number = BOARD_METRICS.pad;
  if (hub !== null) maxBottom = Math.max(maxBottom, hubBottom);
  for (const column of all) maxBottom = Math.max(maxBottom, column.y + column.height);

  return {
    nodes,
    edges,
    markers,
    // 그룹 박스가 컬럼 밖으로 나가도 잘리지 않게 폭·높이를 박스까지 포함한다.
    width: Math.max(totalWidth, boxRight + BOARD_METRICS.pad),
    height: Math.max(Math.max(maxBottom, bottomExtra) + BOARD_METRICS.pad, boxBottom + BOARD_METRICS.pad),
  };
}

type Placed = {
  all: Column[];
  columns: Column[];
  rootColumn: Column | null;
  totalWidth: number;
  hubX: number;
  hubY: number;
  hubWidth: number;
  hubBottom: number;
  hubCenterX: number;
  topBottom: number;
  topCenter: number;
  childTop: number;
};

/** 목업 `renderBoard` 의 컬럼 배치부(mock/index.html:1306-1322). */
function placeColumns(
  worktrees: WorktreeView[],
  sessions: PiSession[],
  byId: Map<string, PiSession>,
  hub: PiSession | null,
): Placed {
  const { pad, colW, gap, head, hubH } = BOARD_METRICS;
  const rootWorktree =
    worktrees.find((worktree) =>
      worktrees.some((candidate) => candidate.parentWorktreeId === worktree.id),
    ) ?? null;
  const children = worktrees.filter((worktree) => rootWorktree === null || worktree.id !== rootWorktree.id);
  const totalWidth = children.length > 0 ? children.length * (colW + gap) - gap + pad * 2 : 320;

  const rootTop = hub !== null ? pad + hubH + 48 : pad;
  let childTop = hub !== null ? pad + hubH + 64 : pad;
  let rootColumn: Column | null = null;

  if (rootWorktree !== null) {
    const rows = rowsOf(rootWorktree, rootTop + head + 4, sessions, byId);
    rootColumn = {
      worktree: rootWorktree,
      x: pad,
      y: rootTop,
      width: totalWidth - pad * 2,
      height: Math.max(rowsEnd(rows, rootTop + head + 4) - rootTop + 8, head + 42),
      rows,
    };
    childTop = rootColumn.y + rootColumn.height + 64;
  }

  const columns: Column[] = [];
  let x = pad;
  for (const worktree of children) {
    const rows = rowsOf(worktree, childTop + head + 4, sessions, byId);
    columns.push({
      worktree,
      x,
      y: childTop,
      width: colW,
      height: Math.max(rowsEnd(rows, childTop + head + 4) - childTop + 8, head + 42),
      rows,
    });
    x += colW + gap;
  }

  const all: Column[] = rootColumn === null ? columns : [rootColumn, ...columns];
  const hubWidth = totalWidth - pad * 2;
  return {
    all,
    columns,
    rootColumn,
    totalWidth,
    hubX: pad,
    hubY: pad,
    hubWidth,
    hubBottom: pad + hubH,
    hubCenterX: pad + hubWidth / 2,
    topBottom:
      rootColumn !== null ? rootColumn.y + rootColumn.height : hub !== null ? pad + hubH : 0,
    topCenter: rootColumn !== null ? rootColumn.x + rootColumn.width / 2 : pad + hubWidth / 2,
    childTop,
  };
}

/**
 * 세션이 이 워크트리에 속하는가.
 *
 * 계약(`src/shared/contract/pi.ts`)에서 `PiSession.worktreeId` 는 세션 JSONL 헤더의 cwd 경로다.
 * Orca 워크트리 id 와 비교하면 어떤 세션도 붙지 않으므로 경로로 비교한다(하위 디렉터리 포함).
 */
export function belongsToWorktree(cwd: string | null, worktreePath: string | null): boolean {
  if (cwd === null || worktreePath === null) return false;
  const left = cwd.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  const right = worktreePath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  if (right === '') return false;
  return left === right || left.startsWith(`${right}/`);
}

/** 목업 `rowsOf`(mock/index.html:1244-1253). 아직 메시지가 없어 도구 칩 행(chipH)은 생기지 않는다. */
function rowsOf(
  worktree: WorktreeView,
  startY: number,
  sessions: PiSession[],
  byId: Map<string, PiSession>,
): SessionRow[] {
  const rows: SessionRow[] = [];
  let y = startY;
  const list = sessions.filter(
    (session) => !session.isHub && belongsToWorktree(session.worktreeId, worktree.path),
  );
  const tree = forest(list, byId, () => true);
  for (const entry of tree) {
    rows.push({ session: entry.session, depth: entry.depth, y, cross: entry.cross });
    y += BOARD_METRICS.rowH;
  }
  return rows;
}

function rowsEnd(rows: SessionRow[], fallback: number): number {
  const last = rows[rows.length - 1];
  if (last === undefined) return fallback;
  return last.y + BOARD_METRICS.rowH;
}

/** 목업 `sessionForest`(mock/index.html:777-801). 사이드바도 이 함수를 쓴다. */
export function sessionRows(sessions: PiSession[], worktreePath: string | null): SessionTreeRow[] {
  const byId = new Map<string, PiSession>(sessions.map((session) => [session.id, session]));
  const list = sessions.filter((session) => !session.isHub && belongsToWorktree(session.worktreeId, worktreePath));
  return forest(list, byId, () => true);
}

function forest(
  list: PiSession[],
  byId: Map<string, PiSession>,
  sameWorktree: (child: PiSession, parent: PiSession) => boolean,
): SessionTreeRow[] {
  const ids = new Set(list.map((session) => session.id));
  const children = new Map<string, PiSession[]>();
  const roots: PiSession[] = [];

  for (const session of list) {
    const parent = session.parentSessionId === null ? null : byId.get(session.parentSessionId) ?? null;
    if (parent !== null && ids.has(parent.id) && sameWorktree(session, parent)) {
      const bucket = children.get(parent.id);
      if (bucket === undefined) children.set(parent.id, [session]);
      else bucket.push(session);
    } else {
      roots.push(session);
    }
  }
  roots.sort(byStarted);
  for (const bucket of children.values()) bucket.sort(byStarted);

  const out: SessionTreeRow[] = [];
  const seen = new Set<string>();
  const walk = (session: PiSession, depth: number, prefix: string, isLast: boolean): void => {
    if (seen.has(session.id)) return;
    seen.add(session.id);
    out.push({
      session,
      depth,
      guide: depth === 0 ? '' : `${prefix}${isLast ? '└─ ' : '├─ '}`,
      cross: null,
    });
    const kids = children.get(session.id) ?? [];
    for (let index = 0; index < kids.length; index += 1) {
      const kid = kids[index];
      if (kid === undefined) continue;
      walk(kid, depth + 1, depth === 0 ? '' : `${prefix}${isLast ? '   ' : '│  '}`, index === kids.length - 1);
    }
  };
  for (const root of roots) walk(root, 0, '', true);
  for (const session of list) if (!seen.has(session.id)) walk(session, 0, '', true);

  for (const entry of out) {
    const parent = entry.session.parentSessionId === null
      ? null
      : byId.get(entry.session.parentSessionId) ?? null;
    if (entry.depth === 0 && parent !== null && !sameWorktree(entry.session, parent) && !parent.isHub) {
      entry.cross = parent;
    }
  }
  return out;
}

function findHub(group: GroupView, sessions: PiSession[]): PiSession | null {
  if (group.hubSessionId !== null) {
    const match = sessions.find((session) => session.id === group.hubSessionId) ?? null;
    if (match !== null) return match;
  }
  return sessions.find((session) => session.isHub) ?? null;
}

function byStarted(a: PiSession, b: PiSession): number {
  if (a.startedAt === b.startedAt) return 0;
  return a.startedAt < b.startedAt ? -1 : 1;
}

/** 목업 `clip`(mock/index.html:714). AUDIT 세션은 배지 자리를 비워 제목을 더 짧게 자른다. */
export function clipText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 목업은 `HH:MM` 문자열을 그대로 썼다(:715). 계약은 ISO 문자열이므로 화면에서 자른다. */
export function clockOf(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 모델 id 는 `provider/model` 이라 마지막 조각만 쓴다(:713). */
export function shortModel(model: string | null): string {
  if (model === null || model === '') return '모델 미확인';
  const parts = model.split('/');
  return parts[parts.length - 1] ?? model;
}

/** 목업은 누적 토큰을 k 단위로 줄여 썼다(:1445-1446). */
export function tokenK(usage: TokenUsage): string {
  return `${Math.round((usage.input + usage.output) / 1000)}k`;
}

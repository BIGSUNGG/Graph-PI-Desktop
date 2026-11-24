import { BrowserWindow, ipcMain } from 'electron';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AnswerQuestionRequest,
  AppStatus,
  Banner,
  CreateGroupRequest,
  CreateGroupResult,
  CreateWorktreeRequest,
  DeleteGroupRequest,
  HarnessAvailability,
  HarnessSnapshot,
  HistorySearchResult,
  IndexProgress,
  MutationResult,
  PushEvent,
  RefCandidate,
  RemoveWorktreeRequest,
  Settings,
  StartSessionRequest,
  StartSessionResult,
} from '../shared/contract/index.ts';
import { EVT_CHANNEL, type IpcChannel, type IpcRequest, type IpcResult } from '../shared/contract/index.ts';
import type { HistoryListQuery, HistorySearchQuery } from '../shared/contract/history.ts';
import type { AgentMessageRecord, HarnessRecord, QuestionRecord } from '../shared/contract/harness.ts';
import type { PiSession } from '../shared/contract/pi.ts';
import type { OrcaLaunchReceipt, OrcaSnapshot } from '../shared/contract/orca.ts';
import { tokenizeRefs } from '../shared/refs/tokenize.ts';
import { orcaJson } from './orca/cli.ts';

/** 허브를 새로 띄울 때 쓰는 프롬프트·모델. 그룹 관리 세션의 기본값이다. */
const HUB_PROMPT = '이 세션은 그룹 관리 허브다. 그룹 폴더에서 워크트리·세션을 관리한다.';
const HUB_MODEL = 'opencode-go/deepseek-v4.1-flash';
import { groupsDir } from './paths.ts';
import { orcaBin } from './orca/cli.ts';
import { planHub, samePath } from './pi/hub.ts';
import { runCommands } from './harness/commands.ts';
import { planDelivery } from './pi/messages.ts';
import { buildCandidates } from './refs/candidates.ts';
import { createRef, refTarget } from './refs/create.ts';
import { resolveTokens, promptWithRefs } from './refs/resolve.ts';
import type { GroupStore } from './state/groups.ts';
import type { PiService } from './pi/index.ts';
import type { OrcaService } from './orca/index.ts';
import type { IndexService } from './db/index.ts';
import type { SettingsStore } from './state/store.ts';

export type IpcDeps = {
  groups: GroupStore;
  settings: SettingsStore;
  orca: OrcaService;
  pi: PiService;
  index: IndexService;
  harness: {
    readSnapshot(groupId: string): Promise<HarnessSnapshot>;
    /** 전이 레코드(질문 응답·에이전트 메시지)를 같은 상태 파일에 append 한다. 같은 id 는 마지막이 이긴다. */
    append(groupId: string, record: HarnessRecord): Promise<void>;
  };
};

type SessionRef = { groupId: string; worktreeId: string | null };

export function registerIpc(deps: IpcDeps): { dispose: () => void } {
  const { groups, settings, orca, pi, index, harness } = deps;
  const sessions = new Map<string, SessionRef>();
  let bannerDismissed = false;
  const unsubscribers: Array<() => void> = [];

  const push = (event: PushEvent): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(EVT_CHANNEL, event);
    }
  };

  const rootsOf = (groupId: string): string[] => {
    const group = groups.get(groupId);
    if (group === null) return [];
    const worktrees = group.worktreeIds
      .map((id) => group.worktreePaths[id] ?? '')
      .filter((path) => path !== '');
    // 허브 세션은 그룹 폴더에서 돈다. 이 경로를 빼면 보드에 허브 카드가 아예 뜨지 않는다.
    return group.hubCwd === '' ? worktrees : [...worktrees, group.hubCwd];
  };

  /**
   * 세션 cwd 에 묶인 PTY 터미널을 찾는다. 그룹 파일은 터미널을 워크트리 id 로 저장하므로
   * 세션이 들고 있는 경로(`worktreeId`)를 먼저 워크트리 id 로 되돌린다.
   */
  const terminalIdFor = (groupId: string, session: PiSession): string | null => {
    const group = groups.get(groupId);
    if (group === null) return null;
    const cwd = session.worktreeId ?? '';
    if (samePath(cwd, group.hubCwd)) return group.hubTerminalId;
    const worktreeId = group.worktreeIds.find((id) => samePath(group.worktreePaths[id] ?? '', cwd));
    return worktreeId === undefined ? null : (group.worktreeTerminals[worktreeId] ?? null);
  };

  /**
   * 재개로 뜬 PTY 를 그룹 파일에 기억한다. 기억하지 않으면 다음 메시지가 같은 세션을 또 재개해
   * 세션이 중복되므로 성공한 재개는 반드시 여기로 남긴다.
   */
  const rememberTerminal = async (groupId: string, cwd: string, terminalId: string): Promise<void> => {
    const group = groups.get(groupId);
    if (group === null) return;
    if (samePath(cwd, group.hubCwd)) {
      await groups.setHubTerminal(groupId, terminalId);
      return;
    }
    const worktreeId = group.worktreeIds.find((id) => samePath(group.worktreePaths[id] ?? '', cwd));
    if (worktreeId === undefined) return;
    await groups.setWorktreeTerminal(groupId, worktreeId, terminalId);
  };

  /** 그룹별 전달 진행 표시. 스냅샷 조회와 세션 갱신이 겹치면 같은 메시지를 두 번 보내게 된다. */
  const delivering = new Set<string>();

  /**
   * 대기 중인 에이전트 메시지를 받는 세션에 전달한다(수용기준 24·25).
   * 판정(어디로 보낼지)은 `planDelivery` 가 하고 여기서는 실행과 상태 전이 기록만 한다.
   */
  const deliverMessages = async (groupId: string): Promise<void> => {
    if (delivering.has(groupId)) return;
    delivering.add(groupId);
    try {
      const snapshot = await harness.readSnapshot(groupId);
      const pending = snapshot.messages.filter((message) => message.status === 'pending');
      if (pending.length === 0) return;

      const live = await pi.sessions(groupId, rootsOf(groupId));
      // 같은 배치에서 같은 세션을 두 번 재개하면 Pi 프로세스가 중복된다 — 재개한 세션은 실행 중으로 본다.
      let known = live.sessions;
      let seq = nextSeq(snapshot);

      for (const message of pending) {
        const recipient = known.find((session) => session.id === message.toSessionId) ?? null;
        const plan = planDelivery({
          message,
          sessions: known,
          terminalId: recipient === null ? null : terminalIdFor(groupId, recipient),
          now: Date.now(),
        });
        const at = new Date().toISOString();

        if (plan.action === 'deliver') {
          const sent = await orca.sendPrompt(plan.terminalId, message.body);
          let failure: string | null = null;
          if (!sent.ok) failure = sent.error;
          await harness.append(groupId, settled(message, seq++, failure, false, at));
          continue;
        }

        if (plan.action === 'resume') {
          const launched = await orca.launchPi({ cwd: plan.cwd, prompt: message.body, model: plan.model });
          if (!launched.ok) {
            await harness.append(groupId, settled(message, seq++, launched.error, true, at));
            continue;
          }
          if (launched.result.terminalId !== null) {
            await rememberTerminal(groupId, plan.cwd, launched.result.terminalId);
            known = known.map((entry) =>
              entry.id === message.toSessionId ? { ...entry, state: 'running' } : entry,
            );
          }
          await harness.append(groupId, settled(message, seq++, null, true, at));
          continue;
        }

        // 재개도 전달도 불가능하면 메시지는 그대로 두고 실패 사유만 덧붙인다(수용기준 25).
        await harness.append(groupId, settled(message, seq++, plan.reason, false, at));
      }

      // 전달·실패가 두 채팅에 바로 보여야 하므로 전이가 끝난 스냅샷을 민다.
      push({ type: 'harness', snapshot: await harness.readSnapshot(groupId) });
    } finally {
      delivering.delete(groupId);
    }
  };

  const availability = async (groupId: string | null): Promise<HarnessAvailability> => {
    if (groupId === null) return 'missing';
    const snapshot = await harness.readSnapshot(groupId);
    return snapshot.availability;
  };

  const bannerFor = (snapshot: OrcaSnapshot, harnessState: HarnessAvailability): Banner | null => {
    if (bannerDismissed) return null;
    if (!snapshot.reachable) {
      return { kind: 'orca-off', message: 'Orca CLI 응답 없음 · 세션 실행이 막혀 있습니다', actionLabel: '다시 시도' };
    }
    if (harnessState === 'missing') {
      return { kind: 'harness-missing', message: '이 그룹에 하네스 상태 파일이 없습니다', actionLabel: null };
    }
    if (harnessState === 'version-mismatch') {
      return { kind: 'harness-version', message: '하네스 스키마 버전이 앱과 다릅니다', actionLabel: null };
    }
    return null;
  };

  const orcaState = (snapshot: OrcaSnapshot): AppStatus['orca'] => {
    if (snapshot.reachable) return 'ok';
    return snapshot.stale ? 'unknown' : 'offline';
  };

  /**
   * 수용기준 18: 허브가 남긴 command 레코드를 실행한다.
   * 확인 대화상자가 없으므로 판정(planCommand)이 거부 사유를 남기고, 실행 실패도 기록으로 남긴다.
   */
  // 펌프와 스냅샷 핸들러가 동시에 돌 수 있다. 같은 요청을 두 번 실행하지 않도록 그룹별로 잠근다.
  const runningCommands = new Set<string>();
  const deliverCommands = async (groupId: string): Promise<void> => {
    if (runningCommands.has(groupId)) return;
    runningCommands.add(groupId);
    try {
      await executePendingCommands(groupId);
    } finally {
      runningCommands.delete(groupId);
    }
  };

  const executePendingCommands = async (groupId: string): Promise<void> => {
    const snapshot = await harness.readSnapshot(groupId);
    const pending = snapshot.commands.filter((record) => record.status === 'pending');
    if (pending.length === 0) return;
    const group = groups.get(groupId);
    if (group === null) return;
    const worktrees = orca.get().worktrees;
    const terminalForSession = (sessionId: string): string | null => {
      const session = sessions.get(sessionId) ?? null;
      if (session === null) return null;
      const worktreeId = Object.keys(group.worktreePaths).find(
        (id) => group.worktreePaths[id] !== undefined && session.worktreeId === group.worktreePaths[id],
      );
      if (worktreeId !== undefined) return group.worktreeTerminals[worktreeId] ?? null;
      return session.worktreeId === group.hubCwd ? group.hubTerminalId : null;
    };
    const executed = await runCommands(
      pending,
      {
        worktreeName: (worktreeId) => worktrees.find((worktree) => worktree.id === worktreeId)?.displayName ?? null,
        terminalForSession,
      },
      {
        removeWorktree: async (worktreeId) => {
          const removed = await orca.removeWorktree(worktreeId);
          if (removed.ok) await groups.unlinkWorktree(worktreeId);
          return removed;
        },
        closeTerminal: (terminalId) => orcaJson(['terminal', 'close', '--terminal', terminalId]),
        renameWorktree: (worktreeId, name) => groups.setAlias('worktree', worktreeId, name),
        renameSession: (sessionId, name) => groups.setAlias('session', sessionId, name),
        append: async (record) => {
          await harness.append(groupId, record);
        },
      },
    );
    if (executed > 0) {
      push({ type: 'harness', snapshot: await harness.readSnapshot(groupId) });
      // 이름 변경은 그룹 파일 별칭이라, 상태를 다시 밀지 않으면 렌더러가 옛 이름을 계속 그린다.
      push({ type: 'status', status: await statusOf() });
    }
  };

  const statusOf = async (): Promise<AppStatus> => {
    const snapshot = orca.get();
    const harnessState = await availability(settings.get().lastGroupId);
    return {
      orca: orcaState(snapshot),
      groups: groups.list().map((group) => ({
        id: group.id,
        name: group.name,
        note: group.note,
        worktreeNames: group.worktreeNames,
        sessionNames: group.sessionNames,
      })),
      harness: harnessState,
      orcaBin: orcaBin(),
      banner: bannerFor(snapshot, harnessState),
    };
  };

  const handle = <K extends IpcChannel>(
    channel: K,
    fn: (request: IpcRequest<K>) => Promise<IpcResult<K>> | IpcResult<K>,
  ): void => {
    ipcMain.handle(channel, async (_event, request: IpcRequest<K>) => fn(request));
  };

  const candidates = async (groupId: string): Promise<RefCandidate[]> =>
    buildCandidates({ snapshot: orca.get(), groupRoots: rootsOf(groupId), head: '' });

  /** 그룹별 허브 재생성 시도 시각. planHub 의 재시도 간격에 쓴다. */
  const hubAttempts = new Map<string, string>();

  /** 수용기준 15: 허브 세션이 사라지면 그룹 폴더에서 새 허브를 띄우거나 기존 세션을 채택한다. */
  const ensureHub = async (groupId: string, active: PiSession[]): Promise<void> => {
    const group = groups.get(groupId);
    if (group === null) return;
    const plan = planHub({
      hubCwd: group.hubCwd,
      hubSessionId: group.hubSessionId,
      hubTerminalId: group.hubTerminalId,
      sessions: active,
      now: Date.now(),
      lastAttemptAt: hubAttempts.get(groupId) ?? null,
    });
    if (plan.action === 'adopt') {
      await groups.setHubSession(groupId, plan.sessionId);
      push({ type: 'status', status: await statusOf() });
      return;
    }
    if (plan.action !== 'launch') return;
    hubAttempts.set(groupId, new Date().toISOString());
    const receipt = await orca.launchPi({ cwd: group.hubCwd, prompt: HUB_PROMPT, model: HUB_MODEL });
    if (!receipt.ok || receipt.result.terminalId === null) return;
    await groups.setHubTerminal(groupId, receipt.result.terminalId);
    await groups.setHubSession(groupId, null);
  };

  const rememberSessions = async (groupId: string): Promise<void> => {
    const result = await pi.sessions(groupId, rootsOf(groupId));
    for (const session of result.sessions) {
      sessions.set(session.id, { groupId, worktreeId: session.worktreeId });
    }
    push({ type: 'sessions', groupId, ...result });
    await ensureHub(groupId, result.sessions);
    // 세션 목록이 갱신되면 대기 메시지를 바로 전달한다(수용기준 24). 실패는 상태 레코드로 남는다.
    void deliverMessages(groupId).catch(() => undefined);
    void deliverCommands(groupId).catch((error: unknown) => { console.error('[deliverCommands]', error); });
  };

  const recordLaunch = async (
    groupId: string,
    request: StartSessionRequest,
    receipt: OrcaLaunchReceipt,
    path: string,
  ): Promise<void> => {
    if (receipt.terminalId === null) return;
    if (request.worktreeId === null) await groups.setHubTerminal(groupId, receipt.terminalId);
    else await groups.setWorktreeTerminal(groupId, request.worktreeId, receipt.terminalId);
    pi.noteLaunch({
      cwd: path,
      at: receipt.launchedAt,
      terminalId: receipt.terminalId,
      title: request.title,
      groupId,
      model: request.model ?? receipt.agent,
    });
    await rememberSessions(groupId);
  };

  // ── 앱 ────────────────────────────────────────────────────────
  /**
   * 허브는 렌더러와 무관하게 CLI 로 요청을 남긴다. 화면이 스냅샷을 다시 읽지 않는 동안에도
   * 요청(18)과 메시지(24)가 처리되도록 주기적으로 한 번씩 돌린다.
   */
  const pump = setInterval((): void => {
    const groupId = settings.get().lastGroupId;
    if (groupId === null || groupId === '') return;
    void deliverCommands(groupId).catch((error: unknown) => { console.error('[deliverCommands]', error); });
    void deliverMessages(groupId).catch(() => undefined);
  }, 3_000);
  pump.unref();

  handle('app:status', () => statusOf());
  handle('app:settings:get', () => settings.get());
  handle('app:settings:set', async (patch: Partial<Settings>) => {
    const next = settings.set(patch);
    push({ type: 'status', status: await statusOf() });
    return next;
  });
  handle('app:banner:dismiss', async () => {
    bannerDismissed = true;
    return statusOf();
  });

  // ── Orca ──────────────────────────────────────────────────────
  handle('orca:snapshot', () => orca.get());
  handle('orca:refresh', async () => orca.refresh());

  // ── Pi 세션 ───────────────────────────────────────────────────
  handle('pi:sessions', async ({ groupId }) => {
    await rememberSessions(groupId);
    return pi.sessions(groupId, rootsOf(groupId));
  });

  handle('pi:messages', async ({ sessionId, limit }) => {
    const result = await pi.messages(sessionId);
    return { messages: limit > 0 ? result.messages.slice(-limit) : result.messages, warnings: result.warnings };
  });

  handle('pi:send', async ({ sessionId, text }): Promise<MutationResult> => {
    const ref = sessions.get(sessionId);
    if (ref === undefined) return fail('세션을 찾을 수 없습니다');
    const validation = resolveTokens(tokenizeRefs(text), await candidates(ref.groupId));
    if (!validation.ok) return fail('미해석 참조가 있어 보낼 수 없습니다');
    const terminalId = groups.terminalFor(ref.groupId, ref.worktreeId);
    if (terminalId === null) return fail('터미널을 찾을 수 없습니다');
    // 참조가 해석됐으면 본문 뒤에 레포·브랜치·워크트리·경로 블록을 붙여 보낸다(acceptance 30행).
    const sent = await orca.sendPrompt(terminalId, promptWithRefs(text, validation.resolutions, orca.get()));
    return sent.ok ? { ok: true, error: null } : fail(sent.error);
  });

  handle('pi:start', async (request): Promise<StartSessionResult> => {
    const group = groups.get(request.groupId);
    if (group === null) return { ok: false, sessionId: null, error: '그룹을 찾을 수 없습니다' };
    const path = request.worktreeId === null ? group.hubCwd : (group.worktreePaths[request.worktreeId] ?? '');
    if (path === '') return { ok: false, sessionId: null, error: '워크트리를 찾을 수 없습니다' };
    const launch = await orca.launchPi({ cwd: path, prompt: request.prompt ?? request.title, model: request.model });
    if (!launch.ok) return { ok: false, sessionId: null, error: launch.error };
    await recordLaunch(request.groupId, request, launch.result, path);
    return { ok: true, sessionId: null, error: null };
  });

  // ── 하네스(Goal/List/Loop/Audit/TODO/질문/메시지) ──────────────
  handle('harness:snapshot', async ({ groupId }) => {
    const snapshot = await harness.readSnapshot(groupId);
    // 화면이 스냅샷을 받은 뒤 대기 메시지를 전달한다(수용기준 24). 응답을 막지 않으려고 기다리지 않는다.
    void deliverMessages(groupId).catch(() => undefined);
    void deliverCommands(groupId).catch((error: unknown) => { console.error('[deliverCommands]', error); });
    return snapshot;
  });
  handle('harness:answer', async (request: AnswerQuestionRequest): Promise<MutationResult> => {
    const answered = await answerQuestion(request);
    if (answered === null) return fail('질문을 찾을 수 없습니다');
    push({ type: 'harness', snapshot: await harness.readSnapshot(answered.groupId) });
    return { ok: true, error: null };
  });

  // ── 검색 인덱스 ───────────────────────────────────────────────
  handle('history:list', (query: HistoryListQuery) => index.list(query));
  handle('history:search', async (query: HistorySearchQuery): Promise<HistorySearchResult> => index.search(query));
  handle('history:index', (): IndexProgress => index.progress());

  // ── 참조 ──────────────────────────────────────────────────────
  handle('refs:candidates', async ({ groupId, head }) =>
    buildCandidates({ snapshot: orca.get(), groupRoots: rootsOf(groupId), head }),
  );
  handle('refs:resolve', async ({ groupId, tokens }) => resolveTokens(tokens, await candidates(groupId)));
  handle('refs:create', async ({ groupId, kind, handle: refHandle }) => {
    const group = groups.get(groupId);
    const target = refTarget(orca.get(), group?.worktreeIds ?? [], group?.parentRepo ?? '');
    return createRef(orca, { kind, handle: refHandle, repo: target.repo, base: target.base });
  });

  // ── 그룹·워크트리 ─────────────────────────────────────────────
  handle('group:create', async (request: CreateGroupRequest): Promise<CreateGroupResult> => {
    const hubCwd = join(groupsDir(), request.name.replace(/[^\w가-힣-]+/g, '-'));
    await mkdir(hubCwd, { recursive: true });
    const group = await groups.create({
      name: request.name,
      note: request.note,
      parentRepo: request.parentRepo,
      hubCwd,
    });
    const launch = await orca.launchPi({ cwd: hubCwd, prompt: request.firstPrompt, model: request.model });
    if (launch.ok) {
      await recordLaunch(
        group.id,
        {
          groupId: group.id,
          worktreeId: null,
          title: request.name,
          model: request.model,
          prompt: request.firstPrompt,
        },
        launch.result,
        hubCwd,
      );
    }
    settings.set({ lastGroupId: group.id });
    push({ type: 'status', status: await statusOf() });
    return { ok: true, groupId: group.id, error: null };
  });

  handle('group:delete', async ({ groupId }: DeleteGroupRequest): Promise<MutationResult> => {
    await groups.remove(groupId);
    push({ type: 'status', status: await statusOf() });
    return { ok: true, error: null };
  });

  handle('worktree:create', async (request: CreateWorktreeRequest): Promise<MutationResult> => {
    const created = await orca.createWorktree({
      repo: request.repo,
      name: request.name,
      branch: request.branch,
      base: request.base,
      parentWorktreeId: request.parentWorktreeId,
    });
    if (!created.ok) return fail(created.error);
    if (created.result === null) return fail('워크트리 생성 결과를 해석하지 못했습니다');
    await groups.linkWorktree(request.groupId, created.result.id, created.result.path);
    push({ type: 'orca', snapshot: orca.get() });
    return { ok: true, error: null };
  });

  handle('worktree:remove', async (request: RemoveWorktreeRequest): Promise<MutationResult> => {
    const removed = await orca.removeWorktree(request.worktreeId);
    if (!removed.ok) return fail(removed.error);
    await groups.unlinkWorktree(request.worktreeId);
    push({ type: 'orca', snapshot: orca.get() });
    return { ok: true, error: null };
  });

  // ── 구독 ──────────────────────────────────────────────────────
  unsubscribers.push(
    orca.onChange((snapshot: OrcaSnapshot) => push({ type: 'orca', snapshot })),
    index.onChange((progress: IndexProgress) => push({ type: 'index', progress })),
  );

  async function answerQuestion(
    request: AnswerQuestionRequest,
  ): Promise<{ groupId: string } | null> {
    for (const group of groups.list()) {
      const snapshot = await harness.readSnapshot(group.id);
      const question = snapshot.questions.find((item) => item.id === request.questionId);
      if (question === undefined) continue;
      const answered: QuestionRecord = {
        ...question,
        seq: Math.max(...snapshot.questions.map((item) => item.seq), 0) + 1,
        status: 'answered',
        answer: request.answer,
        answeredAt: new Date().toISOString(),
      };
      await harness.append(group.id, answered);
      return { groupId: group.id };
    }
    return null;
  }

  return {
    dispose(): void {
      for (const off of unsubscribers) off();
      for (const channel of ipcChannels) ipcMain.removeHandler(channel);
    },
  };
}

function fail(error: string): MutationResult {
  return { ok: false, error };
}

/**
 * 다음 append 에 쓸 seq. 같은 id 는 마지막 레코드가 이기므로 전이는 기존 최대값 다음 번호여야
 * 목록 정렬(seq)에서 뒤로 밀리지 않는다.
 */
function nextSeq(snapshot: HarnessSnapshot): number {
  const recordGroups = [
    snapshot.goals,
    snapshot.listItems,
    snapshot.loops,
    snapshot.audits,
    snapshot.todos,
    snapshot.questions,
    snapshot.messages,
    snapshot.commands,
  ];
  let max = 0;
  for (const records of recordGroups) {
    for (const record of records) if (record.seq > max) max = record.seq;
  }
  return max + 1;
}

/** 전달 결과를 같은 id 의 새 레코드로 만든다(상태 전이 = append). 실패 사유가 있으면 failed 다. */
function settled(
  message: AgentMessageRecord,
  seq: number,
  failureReason: string | null,
  resumeAttempted: boolean,
  at: string,
): AgentMessageRecord {
  return {
    ...message,
    seq,
    status: failureReason === null ? 'delivered' : 'failed',
    deliveredAt: failureReason === null ? at : null,
    failureReason,
    resumeAttempted,
  };
}

const ipcChannels = [
  'app:status',
  'app:settings:get',
  'app:settings:set',
  'app:banner:dismiss',
  'orca:snapshot',
  'orca:refresh',
  'pi:sessions',
  'pi:messages',
  'pi:send',
  'pi:start',
  'harness:snapshot',
  'harness:answer',
  'history:list',
  'history:search',
  'history:index',
  'refs:candidates',
  'refs:resolve',
  'refs:create',
  'group:create',
  'group:delete',
  'worktree:create',
  'worktree:remove',
] as const;

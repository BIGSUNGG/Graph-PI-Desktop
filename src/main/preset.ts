/**
 * 그룹 허브(pi 프로세스)에 넘기는 초기 컨텍스트. SPEC H3 — 프리셋 지시와 첫 프롬프트를
 * 허브가 하네스 상태를 CLI 로만 다루도록 만드는 시스템 지시로 합친다.
 *
 * 허브는 사람이 쓰는 앱 화면이 아니라 별도 pi 세션이므로, 상태 파일 위치·허용 명령·
 * 질문 응답 확인 방법을 프롬프트 안에서 전부 알려줘야 한다. 여기서 만드는 문자열은
 * `orca.launchPi({ prompt })` 로만 전달되고, 하네스 명령은 실행하지 않는다.
 */
import { PRESETS, type PresetKind } from '../shared/contract/index.ts';

export type HubContext = {
  groupId: string;
  groupName: string;
  groupCwd: string;
  cliPath: string;
  preset: PresetKind;
  firstPrompt: string;
};

/** 첫 요청이 비어 있을 때 붙이는 한 줄. Manual 로 취급하고 사용자 입력을 기다린다. */
export const MANUAL_WAIT_LINE =
  '첫 요청이 없으므로 Manual 로 취급한다. 사용자가 요청을 보낼 때까지 기다려라.';

/**
 * 프리셋(kind)의 flow 를 허브가 따를 지시문 배열로 바꾼다.
 * 흐름 항목은 순서를 잃지 않도록 한 줄에 `1) … → 2) …` 로 이어 붙인다.
 */
export function presetInstruction(kind: PresetKind): string[] {
  const meta = PRESETS.find((item) => item.id === kind);
  if (meta === undefined) {
    return [`프리셋 "${kind}" 의 흐름 정보가 없다. Manual 로 취급하고 요청에 맞춰 구조를 스스로 정한다.`];
  }
  const flow = meta.flow.map((step, index) => `${index + 1}) ${step}`).join(' → ');
  return [
    `프리셋 ${meta.name}: ${meta.desc}`,
    `따라야 할 흐름: ${flow}`,
    meta.required
      ? '이 프리셋은 첫 요청이 필수다. 첫 요청 없이 워크트리·세션을 만들지 않는다.'
      : '이 프리셋은 구조를 허브가 정한다. 첫 요청이 있으면 그에 맞춰 워크트리·세션·Loop 구조를 설계한다.',
  ];
}

/** 허브 세션의 시스템 지시. 그룹 폴더·CLI 경로·허용 명령을 모두 여기서 알려준다. */
export function hubSystemPrompt(ctx: HubContext): string {
  return [
    `너는 이 그룹("${ctx.groupName}", id: ${ctx.groupId})의 관리 허브다. 그룹 폴더 ${ctx.groupCwd} 에서 동작한다.`,
    '워크트리·세션은 Orca 로 만들고, 하네스 상태는 아래 CLI 로만 읽고 쓴다.',
    '',
    '## 상태 기록 규칙',
    '상태(goal·list·loop·todo·audit·ask·say·command)는 반드시 CLI 로만 기록한다. 상태 JSON 파일을 직접 쓰거나 편집하지 않는다.',
    `  node "${ctx.cliPath}" <command> --group ${ctx.groupId} --writer hub ...`,
    '',
    '## 사용 가능한 명령',
    'goal: 목표 생성은 --objective "<목표>" [--check "<완료 조건>" ...], 완료 주장은 "goal complete --id <goalId> [--summary "<요약>"]" 로 한다.',
    'ask: 사용자 질문은 --session <sessionId> --header "<제목>" --question "<질문>" --option "<선택지>" ... [--multi].',
    'show: 현재 하네스 상태를 JSON 으로 출력한다.',
    'say: 에이전트 메시지는 --from <sessionId> --to <sessionId> --text "<내용>".',
    'list / loop / todo / audit: 각각 생성 명령이다 (list --title, loop --goal --target --measure, todo --text, audit --goal --verdict).',
    'command: 보드 조작 요청은 --action remove-worktree|rename-worktree|remove-session|rename-session --target <id> [--value "<새 이름>"].',
    '',
    '## 워크트리·세션 생성',
    'orca worktree create --name <이름> --repo <repoRef> --agent pi --prompt "<지시>" 로 만든다.',
    '',
    '## 질문 응답 확인',
    `질문의 답은 node "${ctx.cliPath}" show --group ${ctx.groupId} 출력에서 status:"answered" 인 question 레코드의 answer 로 확인한다.`,
    '답이 아직 없으면 기다린다. 같은 질문을 중복 생성하지 않는다.',
  ].join('\n');
}

/**
 * 허브에 실제로 넘기는 초기 프롬프트 = 시스템 지시 + 프리셋 지시 + 첫 요청.
 * 첫 요청이 비면 Manual 로 취급해 대기 한 줄만 덧붙인다.
 */
export function hubInitialPrompt(ctx: HubContext): string {
  const blocks = [hubSystemPrompt(ctx), presetInstruction(ctx.preset).join('\n')];
  const first = ctx.firstPrompt.trim();
  blocks.push(first === '' ? MANUAL_WAIT_LINE : `첫 요청: ${first}`);
  return blocks.join('\n\n');
}

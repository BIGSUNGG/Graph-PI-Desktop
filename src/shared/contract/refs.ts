/**
 * 채팅 `@참조` 해석 계약. 토크나이저는 순수 함수(`src/shared/refs/tokenize.ts`)이고,
 * 후보·해석은 main 프로세스가 Orca/파일시스템에서 만든다.
 */

export type RefKind = 'project' | 'branch' | 'worktree' | 'path';

export type RefCandidate = {
  kind: RefKind;
  /** `@` 뒤에 붙는 handle. 예: `web`, `feature/login`, `web-feature-login`. */
  handle: string;
  label: string;
  /** 부가 설명: 저장소 경로·브랜치·워크트리 이름 등. */
  detail: string;
};

/** 컴포저드에서 `@` 로 시작하는 미완성 토큰. */
export type RefToken = {
  /** 메시지 안에서의 위치(코드 유닛). */
  start: number;
  end: number;
  /** `@` 뒤 원문 전체. */
  raw: string;
  /** 첫 `/` 앞부분. */
  head: string;
  /** `/` 뒤 나머지(없으면 빈 문자열). */
  rest: string;
};

export type RefResolution =
  | { ok: true; token: RefToken; candidate: RefCandidate; resolvedPath: string | null }
  | { ok: false; token: RefToken; reason: 'unknown' | 'ambiguous'; candidates: RefCandidate[] };

/** 미해석 참조가 있으면 전송을 막는다(acceptance 30행). */
export type RefValidation = {
  ok: boolean;
  unresolved: RefToken[];
  resolutions: RefResolution[];
};

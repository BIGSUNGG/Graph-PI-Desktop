import type { RefToken } from '../contract/refs.ts';

/** `@` 로 시작해 공백/구두점에서 끊기는 문자열. 순수 함수라 렌더러·main 이 함께 쓴다. */
const TOKEN_PATTERN = /@([^\s,;!?()[\]{}"'`]+)/g;

export function tokenizeRefs(text: string): RefToken[] {
  const tokens: RefToken[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    // 이메일·경로 중간의 @ 는 참조가 아니다.
    const before = start === 0 ? ' ' : (text[start - 1] ?? ' ');
    if (!/[\s([{]/.test(before)) continue;
    const raw = match[1] ?? '';
    if (raw === '') continue;
    const slash = raw.indexOf('/');
    tokens.push({
      start,
      end: start + raw.length + 1,
      raw,
      head: slash === -1 ? raw : raw.slice(0, slash),
      rest: slash === -1 ? '' : raw.slice(slash + 1),
    });
  }
  return tokens;
}

/** 마지막에 커서가 놓인 토큰(자동완성 대상). 없으면 null. */
export function tokenAtCursor(text: string, cursor: number): RefToken | null {
  for (const token of tokenizeRefs(text)) {
    if (cursor >= token.start && cursor <= token.end) return token;
  }
  return null;
}

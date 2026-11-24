/**
 * 목업 이식 후 호환 shim.
 *
 * 상단 헤더는 `RailHeader`(shell/RailHeader.tsx) 로 옮겼고, App 은 그쪽만 쓴다.
 * 이 파일은 삭제 대신 남겨 둔다 — `scripts/acceptance-map.json` 등이 경로로 참조하고,
 * 기존 import 가 남아 있어도 깨지지 않게 하기 위해서다.
 */
export { AppBanner, RailHeader as TopBar } from './RailHeader.tsx';

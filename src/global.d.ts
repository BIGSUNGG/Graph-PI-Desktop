// preload 가 노출하는 API. 이름이 같은 index.d.ts 는 index.ts 에 가려지므로 별도 파일로 둔다.
import type { GraphPiApi } from './shared/contract/index.ts';

declare global {
  interface Window {
    api?: GraphPiApi;
  }
}

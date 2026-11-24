# @graph-pi/harness

그룹 단위 상태 저장소. Pi 세션이 Goal·List·Loop·Audit·TODO·질문·메시지를 **append-only JSONL** 로 남기고,
앱(`apps` 루트의 Electron)은 같은 파일을 **읽기만** 해서 화면을 그린다.

## 파일 레이아웃

```
<dataDir>/groups/<groupId>/state.jsonl        # 그룹 스코프 상태(모든 레코드)
<dataDir> = %GRAPH_PI_DATA_DIR% ?? ~/.graph-pi/data
```

`src/main/paths.ts`(앱)와 `src/paths.ts`(이 패키지)는 **같은 규칙**을 각자 구현한다. 패키지 경계를 넘는 import 를 만들지 않기 위한 의도적 중복이다.
규칙을 바꿀 때는 두 파일을 함께 고친다.

## 레코드

7종: `goal`, `list_item`, `loop`, `audit`, `todo`, `question`, `message`.
필드 정의의 단일 기준은 `src/shared/contract/harness.ts` 이며 이 패키지는 그 타입을 그대로 import 한다(복제 금지).

**상태 전이는 새 레코드 append 다.** 같은 `id` 의 뒤 레코드가 앞 레코드를 덮는다(재생 시 last-wins by `id`, 정렬 키는 `seq`).
예: 질문 응답은 `question` 레코드를 같은 id 로 다시 append 하며 `status:'answered'` + `answer` 를 채운다. 별도의 `answer` 레코드 타입은 없다.

## API

```ts
import { createHarnessStore } from './store.ts'

const store = createHarnessStore({ dataDir: '/path/to/data' })
await store.append(groupId, record)        // 한 줄 append
await store.read(groupId)                  // HarnessRecord[]
await store.snapshot(groupId)              // HarnessSnapshot (재생 결과)
await store.nextSeqFor(groupId)            // max(seq) + 1
```

빌더는 payload 를 먼저, 봉투를 나중에 받는다:

```ts
import { goalRecord } from './records.ts'
import { makeEnvelope } from './envelope.ts'

const env = makeEnvelope({ type: 'goal', id, groupId, seq, writer, at })
const record = goalRecord({ objective, status: 'active', ... }, env)
```

`applyRecords(records)` 는 앱의 `src/main/harness/bridge.ts` 와 같은 재생 의미를 구현한다.

## CLI (에이전트가 쓰는 유일한 쓰기 경로)

Pi 세션은 파일을 직접 다루지 않고 bash 로 CLI 를 호출한다.

```bash
node packages/harness/src/cli.ts goal   --group g1 --writer s1 --objective "..." --check "npm test"
node packages/harness/src/cli.ts list   --group g1 --writer s1 --title "..." --state queued
node packages/harness/src/cli.ts loop   --group g1 --writer s1 --goal g1-goal --target "..." --measure "npm test" --value 3
node packages/harness/src/cli.ts todo   --group g1 --writer s1 --text "..." --status doing
node packages/harness/src/cli.ts audit  --group g1 --writer audit-agent --goal g1-goal --verdict approved --summary "..."
node packages/harness/src/cli.ts ask    --group g1 --writer s1 --question "..." --option a --option b
node packages/harness/src/cli.ts say    --group g1 --from s1 --to s1 --text "..."
node packages/harness/src/cli.ts show   --group g1
```

모든 명령은 `--group` 이 필수이고 `--id` 로 기존 레코드를 갱신할 수 있다. 성공 시 `ok <type> <id> seq=<n>` 한 줄을, 실패 시 오류 메시지를 stderr 로 쓰고 종료 코드 1 을 낸다.

## 테스트

```bash
npm test        # node --test (타입 스트리핑, 추가 의존성 없음)
npx tsc -p packages/harness/tsconfig.json --noEmit
```

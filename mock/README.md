# 목업 검증

이 디렉터리의 `index.html`은 기획 확인용 정적 목업이다. 실제 Pi 하네스 패키지나 Orca 연동은 없다.

## 실행

```bash
node mock/_check.js
node mock/verify-planning.mjs
```

`verify-planning.mjs`는 Playwright와 Edge 채널을 사용한다. 처음 실행할 때:

```bash
cd mock
npm install
npx playwright install msedge
```

스크린샷은 `mock/_evidence/planning-*.png`에 생성되며 저장소에는 커밋하지 않는다. `mock/COVERAGE.md`가 각 장면과 SPEC의 대응을 기록한다.

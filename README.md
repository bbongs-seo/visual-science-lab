# 과학 놀이터

초등학생이 3D 화면을 직접 돌려 보면서 과학 원리를 익히는 웹앱입니다.
휴대폰과 태블릿에서는 홈 화면에 추가해 앱처럼 쓸 수 있고(PWA), 한 번 열어 두면 인터넷 없이도 열립니다.

| 레슨 | 해 볼 수 있는 것 |
| --- | --- |
| 낮과 밤이 생기는 이유 | 자전하는 지구에 꽂힌 서울 핀과 시계로 아침·낮·저녁·밤이 바뀌는 순간을 지켜보기 |
| 밀물과 썰물이 생기는 이유 | 달을 손으로 끌어 옮기면 바닷물이 따라 부풀고, 인천 바닷가 물높이가 오르내리는 모습 보기 |

레슨마다 탐험 미션 3개와 확인 퀴즈 3문제가 있고, 해낸 만큼 별을 모읍니다.
천체를 누르면 설명 카드가 뜨고, `설명 듣기`를 누르면 한국어 음성과 자막으로 원리를 읽어 줍니다.

## 실행

Node.js 20.19 이상(또는 22.12 이상)이 필요합니다.

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm test         # 단위 테스트 (vitest)
npm run build    # dist/ 에 배포용 정적 파일 생성
npm run preview  # 빌드 결과를 로컬에서 확인 (http://localhost:4173)
```

## 배포 (GitHub Pages)

`main` 브랜치에 push 하면 `.github/workflows/deploy.yml`이 테스트와 빌드를 거쳐 GitHub Pages에 올립니다.
처음 한 번은 저장소 Settings → Pages → Build and deployment → Source 를 **GitHub Actions**로 바꿔야 합니다.

배포 주소는 `https://bbongs-seo.github.io/visual-science-lab/`입니다.
주소가 바뀌면 `index.html`의 `og:url`, `og:image` 두 줄도 함께 바꿔야 카카오톡 링크 미리보기가 제대로 나옵니다.

## 폴더 구조

```
index.html               앱 껍데기, 링크 미리보기(OG) 태그
vite.config.js           빌드·PWA(오프라인 캐시, 앱 매니페스트) 설정
public/
  textures/              지구 낮·밤, 달 사진 (NASA, 퍼블릭 도메인)
  icons/, og-image.png   앱 아이콘, 링크 미리보기 이미지
src/
  main.js                시작점
  catalog.js             메뉴 목록 (과목·레슨)
  app/                   라우터(#/과목/레슨), 화면 전환, 홈, PWA 업데이트 알림
  shared/
    scene-lesson.js      3D 레슨 공통 화면: 무대·컨트롤·음성·미션·퀴즈·정리
    three/               공유 렌더러, 지구·태양·달·별 만들기, 셰이더
    astro.js             시각·물높이 계산 (순수 함수, 테스트 대상)
    progress.js          별 기록 (이 기기 localStorage)
    narration.js, quiz.js, toast.js
  lessons/science/
    day-night/           content.js(글·미션·퀴즈) + scene.js(3D 장면)
    tides/
  styles/                공통·홈·레슨 스타일
tests/                   vitest 단위 테스트
```

## 새 레슨 추가하기

1. `src/lessons/<과목>/<이름>/` 폴더에 세 파일을 만듭니다.
   - `content.js`: 배지·힌트·미션·원리 설명·음성 문장·퀴즈 (기존 레슨 형식 참고)
   - `scene.js`: `createScene({ canvas, overlay, complete, signal })` 이 `{ scene, camera, controls, pickTargets, resize, update }` 를 돌려주도록 작성
   - `index.js`: `createSceneLesson({ content, createScene })`
2. `src/catalog.js`의 `LESSONS`에 한 줄을 추가합니다. `stars`는 미션 수 + 퀴즈 수와 같아야 하며 테스트가 확인합니다.
3. 수학처럼 3D가 아닌 레슨은 `mount(root, { entry })`가 `{ unmount() }`를 돌려주는 모듈이면 무엇이든 됩니다. 새 과목은 `SUBJECTS`에 추가하면 홈에 섹션이 생깁니다.

미션 성공은 장면에서 `complete("미션-id")`를 부르면 됩니다. 천체 `userData.body.id`가 `sun`이면 그 천체를 눌렀을 때 `pick:sun` 미션이 자동으로 성공 처리됩니다.

## 구현 메모

- 모든 레슨이 WebGL 렌더러 하나를 돌려 씁니다. 레슨을 떠날 때 장면의 geometry·material, 이벤트, 애니메이션 루프, 음성을 정리합니다.
- 화면 속 시간은 실제와 다릅니다. 낮과 밤 레슨은 약 20초에 하루가 지나고, 밀물과 썰물 레슨은 달이 실제(약 1/27)보다 빠르게(1/10) 돌며 바닷물 부푼 모양도 크게 과장했습니다. 레슨 설명에도 이 점을 적어 두었습니다.
- 구름은 이미지 파일 없이 캔버스에서 좌우가 이어지는 노이즈로 그리고, 태양 표면은 셰이더로 끓어오르는 모습을 만듭니다.

## 개인정보

이 앱은 이름·연락처·기기 정보를 모으지 않고, 분석 도구나 광고도 넣지 않았습니다.
모은 별은 그 기기의 브라우저 저장소에만 남습니다.

## 이미지 출처

- 지구 낮: NASA Visible Earth "Blue Marble" (Wikimedia Commons, 퍼블릭 도메인)
- 지구 밤: NASA Earth Observatory "Earth at Night" (Wikimedia Commons, 퍼블릭 도메인)
- 달: NASA Scientific Visualization Studio "CGI Moon Kit" (퍼블릭 도메인)

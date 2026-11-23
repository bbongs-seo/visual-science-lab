/* 메뉴 목록. 새 레슨은 src/lessons/<과목>/<이름>/ 폴더를 만들고 여기에 한 줄을 더하면 홈에 나타난다.
   레슨 코드는 load() 로 그 레슨을 열 때만 내려받는다. */

export const SUBJECTS = [
  {
    id: "science",
    title: "과학",
    icon: "🔭",
    blurb: "우주와 지구의 비밀을 3D로 돌려 보며 알아봐요.",
  },
  // 수학을 시작하면: { id: "math", title: "수학", icon: "📐", blurb: "..." }
];

export const LESSONS = [
  {
    id: "science/day-night",
    subject: "science",
    title: "낮과 밤이 생기는 이유",
    question: "왜 밤이 찾아올까?",
    unit: "지구와 달의 운동",
    grade: "5~6학년",
    stars: 6,
    cover: { kind: "space", sun: true, terminator: true },
    load: () => import("./lessons/science/day-night/index.js"),
  },
  {
    id: "science/tides",
    subject: "science",
    title: "밀물과 썰물이 생기는 이유",
    question: "바닷물은 왜 들어왔다 나갈까?",
    unit: "더 알아보기",
    grade: "심화",
    stars: 6,
    cover: { kind: "space", moon: true },
    load: () => import("./lessons/science/tides/index.js"),
  },
];

export const findLesson = (id) => LESSONS.find((lesson) => lesson.id === id);

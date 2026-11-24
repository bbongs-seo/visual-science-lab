/* 메뉴 목록. 새 레슨은 src/lessons/<과목>/<이름>/ 폴더를 만들고 여기에 한 줄을 더하면 홈에 나타난다.
   레슨 코드는 load() 로 그 레슨을 열 때만 내려받는다. */

export const SUBJECTS = [
  {
    id: "science",
    title: "과학",
    icon: "🔭",
    blurb: "우주와 지구, 빛과 공기의 비밀을 3D로 돌려 보며 알아봐요.",
    // 레슨이 하나도 없는 묶음은 홈에 나타나지 않는다
    categories: [
      { id: "space", title: "우주와 지구" },
      { id: "physics", title: "빛과 파동 · 일상 속 물리" },
    ],
  },
  // 수학을 시작하면: { id: "math", title: "수학", icon: "📐", blurb: "..." }
];

export const LESSONS = [
  {
    id: "science/day-night",
    subject: "science",
    category: "space",
    title: "낮과 밤이 생기는 이유",
    question: "왜 밤이 찾아올까?",
    unit: "지구와 달의 운동",
    grade: "5~6학년",
    stars: 6,
    cover: { kind: "space", sun: true, terminator: true },
    load: () => import("./lessons/science/day-night/index.js"),
  },
  {
    id: "science/seasons",
    subject: "science",
    category: "space",
    title: "사계절이 생기는 이유",
    question: "여름은 왜 덥고 겨울은 왜 추울까?",
    unit: "계절의 변화",
    grade: "6학년",
    stars: 6,
    cover: { kind: "space", sun: true, terminator: true, tilt: true },
    load: () => import("./lessons/science/seasons/index.js"),
  },
  {
    id: "science/eclipse",
    subject: "science",
    category: "space",
    title: "일식과 월식이 생기는 이유",
    question: "낮에 해가 사라질 수 있을까?",
    unit: "더 알아보기",
    grade: "심화",
    stars: 6,
    cover: { kind: "space", sun: true, moon: true },
    load: () => import("./lessons/science/eclipse/index.js"),
  },
  {
    id: "science/tides",
    subject: "science",
    category: "space",
    title: "밀물과 썰물이 생기는 이유",
    question: "바닷물은 왜 들어왔다 나갈까?",
    unit: "더 알아보기",
    grade: "심화",
    stars: 6,
    cover: { kind: "space", moon: true },
    load: () => import("./lessons/science/tides/index.js"),
  },
  {
    id: "science/sky",
    subject: "science",
    category: "physics",
    title: "하늘이 파랗고 노을이 붉은 이유",
    question: "하늘은 왜 파란색일까?",
    unit: "빛의 성질",
    grade: "심화",
    stars: 6,
    cover: { kind: "sky" },
    load: () => import("./lessons/science/sky/index.js"),
  },
  {
    id: "science/rainbow",
    subject: "science",
    category: "physics",
    title: "무지개가 생기는 원리",
    question: "비 온 뒤 무지개는 어떻게 생길까?",
    unit: "빛과 렌즈",
    grade: "6학년",
    stars: 6,
    cover: { kind: "rainbow" },
    load: () => import("./lessons/science/rainbow/index.js"),
  },
  {
    id: "science/lift",
    subject: "science",
    category: "physics",
    title: "비행기가 나는 원리",
    question: "무거운 비행기는 어떻게 뜰까?",
    unit: "더 알아보기",
    grade: "심화",
    stars: 6,
    cover: { kind: "wing" },
    load: () => import("./lessons/science/lift/index.js"),
  },
];

export const findLesson = (id) => LESSONS.find((lesson) => lesson.id === id);

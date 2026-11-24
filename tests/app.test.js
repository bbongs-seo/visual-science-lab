import { afterEach, describe, expect, it } from "vitest";
import { parseHash } from "../src/app/router.js";
import { LESSONS, SUBJECTS } from "../src/catalog.js";
import { completeMission, getLessonProgress, recordQuiz, totalStars } from "../src/shared/progress.js";

const lessonContents = import.meta.glob("../src/lessons/**/content.js", { eager: true });

describe("parseHash", () => {
  it.each([
    ["", { name: "home" }],
    ["#/", { name: "home" }],
    ["#/science/day-night", { name: "lesson", id: "science/day-night" }],
    ["#/science/tides/", { name: "lesson", id: "science/tides" }],
    ["#/%E0%A4%A", { name: "home" }],
  ])("%s", (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });
});

describe("catalog", () => {
  it.each(LESSONS.map((lesson) => [lesson.id, lesson]))(
    "%s: 폴더가 있고 별 개수가 미션+퀴즈 수와 같다",
    (id, lesson) => {
      const content = lessonContents[`../src/lessons/${id}/content.js`]?.default;
      expect(content, `src/lessons/${id}/content.js 가 없어요`).toBeTruthy();
      expect(lesson.stars).toBe(content.missions.length + content.quiz.length);
    }
  );

  it.each(LESSONS.map((lesson) => [lesson.id, lesson]))(
    "%s: 과목에 묶음이 있으면 그중 하나에 속한다 (아니면 홈에서 사라진다)",
    (id, lesson) => {
      const categories = SUBJECTS.find((s) => s.id === lesson.subject).categories;
      if (categories) expect(categories.map((c) => c.id)).toContain(lesson.category);
    }
  );
});

describe("progress", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
  };
  afterEach(() => store.clear());

  it("미션은 한 번만, 퀴즈는 최고 점수만 별로 센다", () => {
    expect(completeMission("a", "m1")).toBe(true);
    expect(completeMission("a", "m1")).toBe(false);
    expect(recordQuiz("a", 2)).toBe(true);
    expect(recordQuiz("a", 1)).toBe(false);
    expect(getLessonProgress("a")).toEqual({ missions: ["m1"], quiz: 2 });
    completeMission("b", "m1");
    expect(totalStars()).toBe(4);
  });

  it("저장소가 망가져 있어도 빈 기록으로 시작한다", () => {
    store.set("vsl-progress-v1", "{broken");
    expect(getLessonProgress("a")).toEqual({ missions: [], quiz: 0 });
  });
});

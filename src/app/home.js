/* 홈: 과목별 레슨 카드. 카드 그림은 실제 지구·달 사진을 CSS로 돌려 WebGL 없이 가볍게 보여 준다 */

import { LESSONS, SUBJECTS } from "../catalog.js";
import { lessonStars, totalStars } from "../shared/progress.js";
import { lessonHref } from "./router.js";

// CSS 변수 안의 상대 url()은 CSS 파일 기준으로 풀리므로 문서 기준 절대 주소로 넘긴다
const texture = (file) =>
  `url(${new URL(`${import.meta.env.BASE_URL}textures/${file}`, document.baseURI).href})`;

function renderCover(cover) {
  if (cover.kind !== "space") return `<div class="cover"></div>`;
  return `
    <div class="cover cover--space" aria-hidden="true">
      ${cover.sun ? `<span class="cover__sun"></span>` : ""}
      <span class="cover__planet${cover.terminator ? " cover__planet--terminator" : ""}${cover.tilt ? " cover__planet--tilt" : ""}" style="--map:${texture("earth-day.webp")}"></span>
      ${cover.moon ? `<span class="cover__orbit"><span class="cover__moon" style="--map:${texture("moon.webp")}"></span></span>` : ""}
    </div>`;
}

function renderStars(earned, max) {
  return `<span class="stars" aria-label="별 ${max}개 중 ${earned}개">${"★".repeat(earned)}<span class="stars__empty">${"★".repeat(Math.max(0, max - earned))}</span></span>`;
}

function renderCard(lesson) {
  const earned = Math.min(lessonStars(lesson.id), lesson.stars);
  return `
    <a class="lesson-card${earned >= lesson.stars ? " is-complete" : ""}" href="${lessonHref(lesson.id)}">
      ${renderCover(lesson.cover)}
      <div class="lesson-card__body">
        <p class="lesson-card__tag">${lesson.grade} · ${lesson.unit}</p>
        <h3 class="lesson-card__title">${lesson.title}</h3>
        <p class="lesson-card__question">${lesson.question}</p>
        <div class="lesson-card__foot">
          ${renderStars(earned, lesson.stars)}
          <span class="lesson-card__go">${earned ? "이어서 탐험" : "탐험 시작"} <span aria-hidden="true">→</span></span>
        </div>
      </div>
    </a>`;
}

function installTip() {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone;
  if (standalone) return "";
  const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  return ios
    ? "Safari 아래쪽 공유 버튼에서 <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요."
    : "브라우저 메뉴에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.";
}

export function renderHome(root) {
  const page = document.createElement("div");
  page.className = "home";
  const tip = installTip();

  page.innerHTML = `
    <header class="app-bar">
      <a class="brand" href="#/"><span class="brand__mark" aria-hidden="true"></span>과학 놀이터</a>
      <p class="star-chip" aria-label="모은 별 전체"><span aria-hidden="true">★</span> <b>${totalStars()}</b></p>
    </header>

    <section class="hero">
      <p class="hero__eyebrow">눈으로 보고, 손으로 돌려 보는</p>
      <h1 class="hero__title">오늘은 어떤 비밀을<br />탐험해 볼까요?</h1>
      <p class="hero__lede">미션을 해내고 퀴즈를 맞히면 별을 모을 수 있어요.</p>
    </section>

    ${SUBJECTS.map((subject) => {
      const lessons = LESSONS.filter((lesson) => lesson.subject === subject.id);
      if (!lessons.length) return "";
      const groups = subject.categories
        ? subject.categories.map((c) => ({ ...c, lessons: lessons.filter((l) => l.category === c.id) }))
        : [{ lessons }];
      return `
        <section class="subject" aria-labelledby="subject-${subject.id}">
          <div class="subject__head">
            <h2 id="subject-${subject.id}"><span aria-hidden="true">${subject.icon}</span> ${subject.title}</h2>
            <p>${subject.blurb}</p>
          </div>
          ${groups
            .filter((group) => group.lessons.length)
            .map(
              (group) => `
            ${group.title ? `<h3 class="category-title">${group.title}</h3>` : ""}
            <div class="lesson-list">${group.lessons.map(renderCard).join("")}</div>`
            )
            .join("")}
        </section>`;
    }).join("")}

    <footer class="foot">
      ${tip ? `<p class="foot__tip">📱 ${tip}</p>` : ""}
      <p>이 앱은 이름이나 연락처 같은 정보를 전혀 모으지 않아요. 모은 별은 이 기기에만 저장돼요.</p>
      <p>지구·달 사진: NASA (퍼블릭 도메인)</p>
    </footer>`;

  root.append(page);
  return { unmount: () => page.remove() };
}

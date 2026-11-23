/* 주소(#/...)에 맞춰 홈 또는 레슨을 붙이고, 떠날 때 이전 화면을 깨끗이 정리한다 */

import { findLesson } from "../catalog.js";
import { onRouteChange } from "./router.js";
import { renderHome } from "./home.js";

const APP_NAME = "과학 놀이터";

export function startApp(root) {
  let current = null;
  let token = 0;

  onRouteChange(async (route) => {
    const ticket = ++token;
    current?.unmount();
    current = null;
    root.replaceChildren();
    window.scrollTo(0, 0);

    if (route.name !== "lesson") {
      document.title = APP_NAME;
      current = renderHome(root);
      return;
    }

    const entry = findLesson(route.id);
    if (!entry) {
      window.location.replace("#/");
      return;
    }
    document.title = `${entry.title} · ${APP_NAME}`;
    root.innerHTML = `<p class="route-status">탐험을 준비하고 있어요…</p>`;

    try {
      const lesson = (await entry.load()).default;
      if (ticket !== token) return; // 불러오는 사이 다른 화면으로 옮겨 갔다
      root.replaceChildren();
      current = lesson.mount(root, { entry });
    } catch (error) {
      if (ticket !== token) return;
      console.error(error);
      root.innerHTML = `
        <div class="route-status">
          <p>탐험을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>
          <button type="button" class="btn btn--primary" data-retry>다시 시도</button>
          <a class="btn btn--ghost" href="#/">목록으로</a>
        </div>`;
      root.querySelector("[data-retry]").addEventListener("click", () => window.location.reload());
    }
  });
}

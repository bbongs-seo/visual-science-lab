/* 3D 관찰 레슨 공통 화면.
   레슨은 content(글·미션·퀴즈)와 createScene(3D 장면)만 만들면 되고,
   무대·컨트롤·음성·미션·퀴즈·정리는 여기서 한 번에 처리한다.

   createScene({ canvas, overlay, complete, signal }) 이 돌려줄 것:
     { scene, camera, controls, pickTargets, resize(w, h), update(dt, state) }
   - pickTargets 의 mesh.userData.body = { id, title, text } 를 누르면 설명 카드가 뜨고
     "pick:<id>" 미션이 있으면 성공 처리된다.
   - complete(missionId) 로 미션 성공을 알린다.

   content.slider = { label, min, max, step, value, format(v) } 를 주면 값 조절 막대가 생긴다.
   - 아이가 막대를 움직이면 state.slider 에 값이 들어가고 장면이 멈춘다(state.paused).
   - 장면은 멈춰 있을 때 state.slider 를 따르고, 움직이는 동안에는 지금 값을 state.slider 에 써서 막대가 따라오게 한다. */

import * as THREE from "three";
import { getRenderer, disposeScene } from "./three/stage.js";
import { texturesReady } from "./three/space.js";
import { Narrator } from "./narration.js";
import { renderQuiz } from "./quiz.js";
import { showToast } from "./toast.js";
import { getLessonProgress, completeMission, recordQuiz, lessonStars } from "./progress.js";

const SPEEDS = [
  { value: 0.4, label: "🐢 느리게" },
  { value: 1, label: "보통" },
  { value: 2.5, label: "🚀 빠르게" },
];

function template(entry, content, progress) {
  const doneMissions = new Set(progress.missions);
  return `
    <header class="lesson-bar">
      <a class="back" href="#/" aria-label="탐험 목록으로 돌아가기"><span aria-hidden="true">←</span> 목록</a>
      <div class="lesson-bar__title">
        <p class="lesson-bar__unit">${entry.unit}</p>
        <h1>${entry.title}</h1>
      </div>
      <p class="star-chip" aria-label="이 탐험에서 모은 별"><span aria-hidden="true">★</span> <b data-stars></b><span class="star-chip__max">/${content.missions.length + content.quiz.length}</span></p>
    </header>

    <section class="stage" aria-label="${content.stageLabel}">
      <div class="stage__overlay"></div>
      <p class="stage__badge">${content.badge}</p>
      <p class="caption" aria-live="polite" hidden></p>
      <div class="body-info" hidden>
        <h2 class="body-info__title"></h2>
        <p class="body-info__text"></p>
        <button class="body-info__close" type="button" aria-label="설명 닫기">×</button>
      </div>
      <p class="stage__hint">${content.hint}</p>
      <div class="stage__loading" aria-hidden="true"><span class="spinner"></span>우주로 날아가는 중…</div>
      <p class="stage__fallback">이 기기에서는 3D 화면을 열 수 없어요. 아래 설명과 퀴즈로 탐험을 이어 가요!</p>
    </section>

    <div class="controls">
      <button class="btn btn--primary" type="button" data-act="pause" aria-pressed="false">⏸ 잠깐 멈추기</button>
      <div class="speed" role="group" aria-label="${content.speedLabel}">
        <span class="speed__label">${content.speedLabel}</span>
        ${SPEEDS.map(
          (s) =>
            `<button type="button" class="speed__btn" data-speed="${s.value}" aria-pressed="${s.value === 1}">${s.label}</button>`
        ).join("")}
      </div>
      <button class="btn btn--ghost" type="button" data-act="narrate">🔊 설명 듣기</button>
      ${
        content.slider
          ? `<label class="slider">
        <span class="slider__label">${content.slider.label}</span>
        <input class="slider__input" type="range" min="${content.slider.min}" max="${content.slider.max}" step="${content.slider.step}" value="${content.slider.value}" />
        <output class="slider__value"></output>
      </label>`
          : ""
      }
    </div>

    <div class="lesson-grid">
      <section class="card missions">
        <h2 class="card__title"><span aria-hidden="true">🎯</span> 탐험 미션</h2>
        <ol class="missions__list">
          ${content.missions
            .map(
              (m) => `
            <li class="mission${doneMissions.has(m.id) ? " is-done" : ""}" data-mission="${m.id}">
              <span class="mission__check" aria-hidden="true"></span>
              <span class="mission__text">${m.text}</span>
              <span class="visually-hidden mission__state">${doneMissions.has(m.id) ? "성공" : "도전 중"}</span>
            </li>`
            )
            .join("")}
        </ol>
      </section>

      <article class="card principle">
        <h2 class="card__title"><span aria-hidden="true">💡</span> 왜 그럴까요?</h2>
        <p class="principle__lead">${content.principle.lead}</p>
        <ul class="principle__list">
          ${content.principle.points.map((p) => `<li>${p}</li>`).join("")}
        </ul>
        <p class="principle__think">${content.principle.think}</p>
        <p class="principle__note">${content.principle.note}</p>
      </article>
    </div>

    <section class="card quiz">
      <h2 class="card__title"><span aria-hidden="true">🧠</span> 확인 퀴즈</h2>
      <div class="quiz__body"></div>
    </section>`;
}

function setupPicking({ canvas, camera, targets, info, onPick, signal }) {
  const titleEl = info.querySelector(".body-info__title");
  const textEl = info.querySelector(".body-info__text");
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  let hideTimer = 0;

  const hide = () => {
    info.hidden = true;
  };
  info.querySelector(".body-info__close").addEventListener("click", hide, { signal });
  signal.addEventListener("abort", () => window.clearTimeout(hideTimer));

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      down = { x: event.clientX, y: event.clientY };
    },
    { signal }
  );

  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 8) return; // 드래그는 누른 것으로 보지 않는다

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const body = raycaster.intersectObjects(targets, false)[0]?.object.userData.body;
      if (!body) {
        hide();
        return;
      }

      titleEl.textContent = body.title;
      textEl.textContent = body.text;
      info.hidden = false;
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hide, 12000);
      onPick(body);
    },
    { signal }
  );
}

export function createSceneLesson({ content, createScene }) {
  return {
    content,
    mount(root, { entry }) {
      const abort = new AbortController();
      const { signal } = abort;
      const progress = getLessonProgress(entry.id);
      const timers = new Set();
      const later = (fn, ms) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          fn();
        }, ms);
        timers.add(id);
      };

      const page = document.createElement("div");
      page.className = "lesson";
      page.innerHTML = template(entry, content, progress);
      root.append(page);
      const $ = (selector) => page.querySelector(selector);
      const stage = $(".stage");

      /* ---- 별 · 미션 ---- */
      const refreshStars = () => {
        $("[data-stars]").textContent = lessonStars(entry.id);
      };
      refreshStars();

      const missionIds = new Set(content.missions.map((m) => m.id));
      const done = new Set(progress.missions);

      const complete = (missionId) => {
        if (!missionIds.has(missionId) || done.has(missionId)) return;
        done.add(missionId);
        completeMission(entry.id, missionId);
        const item = page.querySelector(`[data-mission="${missionId}"]`);
        item.classList.add("is-done", "is-new");
        item.querySelector(".mission__state").textContent = "성공";
        refreshStars();
        showToast(`⭐ 미션 성공! ${content.missions.find((m) => m.id === missionId).text}`);
        if (done.size === missionIds.size) {
          later(() => showToast("🎉 미션을 모두 해냈어요! 아래 퀴즈에도 도전해 볼까요?"), 2600);
        }
      };

      /* ---- 3D 무대 ---- */
      const state = { paused: false, speed: 1, slider: content.slider?.value };
      const sliderInput = $(".slider__input");
      const sliderValue = $(".slider__value");
      let sliderText = null;
      // 장면이 바꾼 값을 막대와 숫자에 반영한다 (매 프레임 불리므로 글자는 바뀔 때만 고친다)
      function showSlider() {
        if (!sliderInput) return;
        sliderInput.value = state.slider;
        const text = content.slider.format ? content.slider.format(state.slider) : String(state.slider);
        if (text === sliderText) return;
        sliderText = text;
        sliderValue.textContent = text;
        sliderInput.setAttribute("aria-valuetext", text);
      }
      let view = null;
      let renderer = null;
      let observer = null;
      let raf = 0;

      try {
        renderer = getRenderer();
      } catch {
        stage.classList.add("is-unsupported");
      }

      if (renderer) {
        const canvas = renderer.domElement;
        stage.prepend(canvas);
        view = createScene({ canvas, overlay: $(".stage__overlay"), complete, signal });

        setupPicking({
          canvas,
          camera: view.camera,
          targets: view.pickTargets,
          info: $(".body-info"),
          onPick: (body) => complete(`pick:${body.id}`),
          signal,
        });

        const resize = (width, height) => {
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          view.resize(width, height);
        };
        resize(stage.clientWidth, stage.clientHeight);
        observer = new ResizeObserver(([entry]) =>
          resize(entry.contentRect.width, entry.contentRect.height)
        );
        observer.observe(stage);

        let last = null;
        const frame = (now) => {
          // 첫 프레임 시각이 붙인 시점보다 이를 수 있어 음수(시간 역행)와 긴 멈춤 뒤 순간이동을 모두 막는다
          const dt = last === null ? 0 : Math.min(Math.max((now - last) / 1000, 0), 0.05);
          last = now;
          view.update(dt, state);
          showSlider();
          renderer.render(view.scene, view.camera);
          raf = window.requestAnimationFrame(frame);
        };
        raf = window.requestAnimationFrame(frame);

        texturesReady().then(() => {
          if (!signal.aborted) stage.classList.add("is-ready");
        });
      }

      /* ---- 컨트롤 ---- */
      const pauseButton = $('[data-act="pause"]');
      const setPaused = (paused) => {
        state.paused = paused;
        pauseButton.setAttribute("aria-pressed", String(paused));
        pauseButton.textContent = paused ? "▶ 이어서 보기" : "⏸ 잠깐 멈추기";
      };
      pauseButton.addEventListener("click", () => setPaused(!state.paused), { signal });

      showSlider();
      sliderInput?.addEventListener(
        "input",
        () => {
          state.slider = Number(sliderInput.value);
          setPaused(true);
          showSlider();
        },
        { signal }
      );

      page.querySelectorAll("[data-speed]").forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            state.speed = Number(button.dataset.speed);
            page
              .querySelectorAll("[data-speed]")
              .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
          },
          { signal }
        );
      });

      /* ---- 음성 설명 ---- */
      const caption = $(".caption");
      const narrateButton = $('[data-act="narrate"]');
      let captionTimer = 0;
      let unsupportedNotified = false;

      const narrator = new Narrator({
        sentences: content.narration,
        onSentence(text) {
          window.clearTimeout(captionTimer);
          caption.textContent = text;
          caption.hidden = false;
        },
        onState(status) {
          const speaking = status === "playing";
          narrateButton.textContent = speaking ? "⏹ 그만 듣기" : "🔊 설명 듣기";
          narrateButton.classList.toggle("is-active", speaking);
          if (speaking && !narrator.supported && !unsupportedNotified) {
            unsupportedNotified = true;
            showToast("이 기기에서는 소리로 읽어 줄 수 없어서 자막으로 보여 줄게요.");
          }
          if (!speaking) {
            window.clearTimeout(captionTimer);
            captionTimer = window.setTimeout(() => {
              caption.hidden = true;
            }, 2400);
          }
        },
      });

      narrateButton.addEventListener(
        "click",
        () => (narrator.state === "playing" ? narrator.stop() : narrator.start()),
        { signal }
      );
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden && narrator.state === "playing") narrator.stop();
        },
        { signal }
      );

      /* ---- 퀴즈 ---- */
      renderQuiz($(".quiz__body"), content.quiz, {
        best: progress.quiz,
        onFinish(score) {
          if (recordQuiz(entry.id, score)) {
            refreshStars();
            showToast(`⭐ 퀴즈 별 ${score}개를 모았어요!`);
          }
        },
      });

      return {
        unmount() {
          abort.abort();
          window.cancelAnimationFrame(raf);
          timers.forEach((id) => window.clearTimeout(id));
          window.clearTimeout(captionTimer);
          observer?.disconnect();
          narrator.dispose();
          if (view) {
            view.controls.dispose();
            disposeScene(view.scene);
          }
          renderer?.domElement.remove();
          page.remove();
        },
      };
    },
  };
}

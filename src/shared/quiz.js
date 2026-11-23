/* 레슨 끝 확인 퀴즈. 문항마다 바로 정답과 설명을 보여 주고, 다 풀면 점수를 onFinish 로 넘긴다 */

export function renderQuiz(container, questions, { best = 0, onFinish }) {
  let answered = 0;
  let correct = 0;

  const render = () => {
    answered = 0;
    correct = 0;
    container.innerHTML = `
      ${best ? `<p class="quiz__best">지난 최고 기록 ★ ${best} / ${questions.length}</p>` : ""}
      <ol class="quiz__list">
        ${questions
          .map(
            (item, qi) => `
          <li class="quiz__item" data-q="${qi}">
            <p class="quiz__q"><span class="quiz__num">Q${qi + 1}</span>${item.q}</p>
            <div class="quiz__options">
              ${item.options
                .map(
                  (option, oi) =>
                    `<button type="button" class="quiz__option" data-o="${oi}">${option}</button>`
                )
                .join("")}
            </div>
            <p class="quiz__explain" hidden></p>
          </li>`
          )
          .join("")}
      </ol>
      <div class="quiz__result" aria-live="polite"></div>`;
  };

  container.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry]")) {
      render();
      container.querySelector(".quiz__option")?.focus();
      return;
    }

    const button = event.target.closest(".quiz__option");
    if (!button || button.disabled) return;
    const item = button.closest(".quiz__item");
    const question = questions[Number(item.dataset.q)];
    const picked = Number(button.dataset.o);
    const isRight = picked === question.answer;

    item.querySelectorAll(".quiz__option").forEach((option) => {
      option.disabled = true;
      if (Number(option.dataset.o) === question.answer) option.classList.add("is-answer");
    });
    if (!isRight) button.classList.add("is-wrong");
    item.classList.add(isRight ? "is-right" : "is-missed");

    const explain = item.querySelector(".quiz__explain");
    explain.textContent = `${isRight ? "딩동댕! " : "아쉬워요. "}${question.explain}`;
    explain.hidden = false;

    answered += 1;
    if (isRight) correct += 1;
    if (answered < questions.length) return;

    best = Math.max(best, correct);
    const perfect = correct === questions.length;
    container.querySelector(".quiz__result").innerHTML = `
      <p class="quiz__score">${"★".repeat(correct)}${"☆".repeat(questions.length - correct)}</p>
      <p>${perfect ? "모두 맞혔어요! 진짜 과학 탐험가예요." : `${questions.length}문제 중 ${correct}문제를 맞혔어요.`}</p>
      ${perfect ? "" : `<button type="button" class="btn btn--ghost" data-retry>다시 풀어 보기</button>`}`;
    onFinish?.(correct);
  });

  render();
}

/* 화면 아래에 잠깐 떴다 사라지는 알림. action 을 주면 버튼이 붙고, duration 0 이면 닫을 때까지 남는다 */

let toast = null;
let timer = 0;

export function showToast(message, { action, onAction, duration = 3800 } = {}) {
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.replaceChildren(Object.assign(document.createElement("span"), { textContent: message }));

  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast__action";
    button.textContent = action;
    button.addEventListener("click", () => {
      toast.hidden = true;
      onAction?.();
    });
    toast.append(button);
  }

  toast.hidden = false;
  toast.classList.remove("is-in");
  void toast.offsetWidth; // 같은 알림이 연달아 와도 등장 애니메이션을 다시 재생
  toast.classList.add("is-in");

  window.clearTimeout(timer);
  if (duration > 0) {
    timer = window.setTimeout(() => {
      toast.hidden = true;
    }, duration);
  }
}

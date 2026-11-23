/* 해시 라우팅: #/ → 홈, #/science/day-night → 레슨. 정적 호스팅에서 서버 설정 없이 동작한다 */

export function parseHash(hash) {
  let path = (hash || "").replace(/^#\/?/, "").replace(/\/+$/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    return { name: "home" };
  }
  return path ? { name: "lesson", id: path } : { name: "home" };
}

export const lessonHref = (id) => `#/${id}`;

export function onRouteChange(handler) {
  const run = () => handler(parseHash(window.location.hash));
  window.addEventListener("hashchange", run);
  run();
}

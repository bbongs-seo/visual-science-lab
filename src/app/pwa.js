/* 오프라인 캐시(서비스 워커). 새 버전이 배포되면 알림을 띄워 다시 불러오게 한다 */

import { registerSW } from "virtual:pwa-register";
import { showToast } from "../shared/toast.js";

export function setupPwa() {
  if (!("serviceWorker" in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      showToast("새로운 탐험 내용이 도착했어요.", {
        action: "새로 고침",
        onAction: () => updateSW(true),
        duration: 0,
      });
    },
  });
}

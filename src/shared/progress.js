/* 미션·퀴즈 기록. 서버 없이 이 기기의 localStorage 에만 저장한다 (개인정보 수집 없음) */

const KEY = "vsl-progress-v1";

function read() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 사생활 보호 모드 등 저장이 막힌 환경: 이번 방문 동안만 기록이 사라진다 */
  }
}

export function getLessonProgress(lessonId) {
  const entry = read()[lessonId] || {};
  return { missions: entry.missions || [], quiz: entry.quiz || 0 };
}

/** 처음 성공한 미션이면 true */
export function completeMission(lessonId, missionId) {
  const all = read();
  const entry = all[lessonId] || {};
  const missions = entry.missions || [];
  if (missions.includes(missionId)) return false;
  all[lessonId] = { ...entry, missions: [...missions, missionId] };
  write(all);
  return true;
}

/** 최고 점수를 넘었으면 true */
export function recordQuiz(lessonId, score) {
  const all = read();
  const entry = all[lessonId] || {};
  if (score <= (entry.quiz || 0)) return false;
  all[lessonId] = { ...entry, quiz: score };
  write(all);
  return true;
}

export function lessonStars(lessonId) {
  const { missions, quiz } = getLessonProgress(lessonId);
  return missions.length + quiz;
}

export function totalStars() {
  return Object.keys(read()).reduce((sum, id) => sum + lessonStars(id), 0);
}

/* 빛 레슨 계산 (three.js 없이 테스트 가능한 순수 함수)
   색은 { r, g, b } (0~1). 파장 대표값: 빨강 680nm, 초록 550nm, 파랑 450nm */

const DEG = Math.PI / 180;

/* ---------------------------------------------------------
   하늘과 노을: 레일리 산란
   --------------------------------------------------------- */

/** 공기를 똑바로 위로 지날 때 각 색이 흩어져 줄어드는 정도(광학 두께). 짧은 파장일수록 크다(λ⁻⁴) */
export const RAYLEIGH = { r: 0.045, g: 0.1, b: 0.22 };

/** 해 높이(도)에 따라 햇빛이 지나는 공기 길이 (한낮 = 1). Kasten-Young 식, 지평선에서 약 38 */
export function airMass(altitude) {
  const h = Math.max(altitude, 0);
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}

/** 공기를 airMass 만큼 지난 뒤 남은 햇빛 (흩어지고 남은 빛) */
export function transmitted(mass) {
  return {
    r: Math.exp(-RAYLEIGH.r * mass),
    g: Math.exp(-RAYLEIGH.g * mass),
    b: Math.exp(-RAYLEIGH.b * mass),
  };
}

const normalize = ({ r, g, b }) => {
  const max = Math.max(r, g, b, 1e-6);
  return { r: r / max, g: g / max, b: b / max };
};

/** 땅에서 본 해의 색 (가장 밝은 색을 1로 맞춤) */
export function sunColor(altitude) {
  return normalize(transmitted(airMass(altitude)));
}

/**
 * 땅에서 본 하늘 색. zenith(머리 위)는 흩어진 빛이라 파랗고, horizon(해 쪽 지평선)은 남은 햇빛을 닮는다.
 * brightness 는 해가 낮을수록 어두워지는 정도(0~1).
 */
export function skyColors(altitude) {
  // 머리 위 하늘빛은 높은 곳 옅은 공기에서 흩어진 빛이라, 해가 낮아도 그곳까지 오는 길은 짧다
  const half = transmitted(Math.min(airMass(altitude) / 2, 3));
  const zenith = normalize({ r: RAYLEIGH.r * half.r, g: RAYLEIGH.g * half.g, b: RAYLEIGH.b * half.b });
  const sun = sunColor(altitude);
  const horizon = normalize({
    r: sun.r * 0.75 + zenith.r * 0.25,
    g: sun.g * 0.75 + zenith.g * 0.25,
    b: sun.b * 0.75 + zenith.b * 0.25,
  });
  const brightness = Math.min(1, 0.18 + Math.max(altitude, 0) / 25);
  return { zenith, horizon, brightness };
}

/**
 * 공기 속 길(0 = 들어오는 곳 ~ 1 = 땅)의 fraction 지점에서 흩어지는 빛이 어떤 색일 확률.
 * 흩어지기 쉬운 정도(RAYLEIGH) × 그 지점까지 남아 있는 빛의 양
 */
export function scatterOdds(fraction, altitude) {
  const left = transmitted(airMass(altitude) * fraction);
  const r = RAYLEIGH.r * left.r;
  const g = RAYLEIGH.g * left.g;
  const b = RAYLEIGH.b * left.b;
  const sum = r + g + b;
  return { r: r / sum, g: g / sum, b: b / sum, strength: sum / (RAYLEIGH.r + RAYLEIGH.g + RAYLEIGH.b) };
}

/* ---------------------------------------------------------
   무지개: 물방울 속 굴절과 반사
   --------------------------------------------------------- */

export const RAINBOW_COLORS = [
  { name: "빨강", nm: 680, hex: 0xff3b30 },
  { name: "주황", nm: 620, hex: 0xff9500 },
  { name: "노랑", nm: 580, hex: 0xffd60a },
  { name: "초록", nm: 530, hex: 0x34c759 },
  { name: "파랑", nm: 475, hex: 0x0a84ff },
  { name: "남색", nm: 445, hex: 0x5e5ce6 },
  { name: "보라", nm: 410, hex: 0xbf5af2 },
];

/** 물의 굴절률 (코시 식 근사: 빨강 약 1.331, 보라 약 1.343) */
export function waterIndex(nm) {
  return 1.324 + 3150 / (nm * nm);
}

/** 들어오는 높이 b(물방울 반지름 = 1, 0~1)인 빛이 한 번 반사하고 나올 때, 들어온 방향과 되돌아 나온 방향 사이 각(도) */
export function rainbowAngle(b, n) {
  const i = Math.asin(b);
  const r = Math.asin(b / n);
  return (4 * r - 2 * i) / DEG;
}

/** 무지개 각이 가장 큰(빛이 가장 많이 모이는) 들어오는 높이와 그때의 각 */
export function rainbowPeak(n) {
  // d/db (4r - 2i) = 0 → cos²i = (n² - 1) / 3
  const b = Math.sqrt(1 - (n * n - 1) / 3);
  return { b, angle: rainbowAngle(b, n) };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const scale = (a, s) => [a[0] * s, a[1] * s];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1]];

/** 단위 법선 normal(빛 쪽을 향함)인 면에서 eta = n1/n2 로 꺾인 방향 */
function refract(dir, normal, eta) {
  const cosI = -dot(dir, normal);
  const k = 1 - eta * eta * (1 - cosI * cosI);
  return addv(scale(dir, eta), scale(normal, eta * cosI - Math.sqrt(k)));
}

const reflect = (dir, normal) => sub(dir, scale(normal, 2 * dot(dir, normal)));

/** 원점에 있는 반지름 1 원 안에서 p 에서 dir 로 가다 다시 원과 만나는 점 */
function exitPoint(p, dir) {
  return addv(p, scale(dir, -2 * dot(p, dir)));
}

/**
 * 왼쪽에서 오른쪽(+x)으로 오는 빛이 높이 b 로 물방울(반지름 1)에 들어가 한 번 반사하고 나오는 길.
 * points: [들어간 점, 반사한 점, 나온 점], out: 나온 뒤 방향(단위 벡터)
 */
export function traceDroplet(b, n) {
  const dir0 = [1, 0];
  const p1 = [-Math.sqrt(1 - b * b), b];
  const d1 = refract(dir0, p1, 1 / n); // 바깥 법선이 곧 p1
  const p2 = exitPoint(p1, d1);
  const d2 = reflect(d1, p2);
  const p3 = exitPoint(p2, d2);
  const out = refract(d2, scale(p3, -1), n);
  return { points: [p1, p2, p3], out };
}

/* 날개 둘레 공기 흐름: 주코프스키 날개 + 퍼텐셜 유동 (three.js 없이 테스트 가능한 순수 함수)
   원 둘레 흐름(정확한 답이 있음)을 z = ζ + 1/ζ 로 옮겨 날개 둘레 흐름을 얻는다.
   뒷전에서 흐름이 매끄럽게 떠나도록(쿠타 조건) 순환을 정하면, 그 순환이 곧 양력이 된다. */

const c = (re, im = 0) => ({ re, im });
const add = (a, b) => c(a.re + b.re, a.im + b.im);
const sub = (a, b) => c(a.re - b.re, a.im - b.im);
const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const abs = (a) => Math.hypot(a.re, a.im);
const sqrt = (a) => {
  const r = Math.sqrt(abs(a));
  const t = Math.atan2(a.im, a.re) / 2;
  return c(r * Math.cos(t), r * Math.sin(t));
};

/**
 * thickness(두께), camber(휘어진 정도), alpha(받음각, 라디안). 날개 길이(시위)는 약 4, 뒷전은 (2, 0).
 * 흐름 속도는 멀리서 오는 바람 속도를 1로 잰 값이다.
 */
export function createAirfoil({ thickness = 0.1, camber = 0.1, alpha = (6 * Math.PI) / 180 } = {}) {
  const mu = c(-thickness, camber);
  const a = abs(sub(c(1), mu)); // 원이 ζ = 1 을 지나야 뒷전이 뾰족해진다
  const beta = Math.asin(camber / a);
  const gamma = 4 * Math.PI * a * Math.sin(alpha + beta); // 쿠타 조건
  const eA = c(Math.cos(alpha), Math.sin(alpha));
  const emA = c(Math.cos(alpha), -Math.sin(alpha));
  const a2eA = mul(c(a * a), eA);
  const circulation = c(0, gamma / (2 * Math.PI));

  /** 날개 밖의 점 z 에 대응하는 원 바깥의 ζ (없으면 날개 안) */
  const toZeta = (z) => {
    const s = sqrt(sub(mul(z, z), c(4)));
    const z1 = div(add(z, s), c(2));
    const z2 = div(sub(z, s), c(2));
    return abs(sub(z1, mu)) >= abs(sub(z2, mu)) ? z1 : z2;
  };

  return {
    /** 시위 대비 양력 계수 (얇은 날개 이론의 2π sin(α+β) 와 같은 꼴) */
    lift: gamma,

    /** 날개 겉모양 [x, y] 점들 (뒷전에서 시작해 윗면 → 앞전 → 아랫면) */
    outline(count = 120) {
      const points = [];
      for (let k = 0; k < count; k += 1) {
        const t = (k / count) * Math.PI * 2 - beta;
        const zeta = add(mu, c(a * Math.cos(t), a * Math.sin(t)));
        const z = add(zeta, div(c(1), zeta));
        points.push([z.re, z.im]);
      }
      return points;
    },

    inside(x, y) {
      return abs(sub(toZeta(c(x, y)), mu)) < a * 1.0005;
    },

    /** 점 (x, y) 의 흐름 속도 [u, v]. 날개 안이면 [0, 0] */
    velocity(x, y) {
      const zeta = toZeta(c(x, y));
      const w = sub(zeta, mu);
      if (abs(w) < a * 1.0005) return [0, 0];
      // dW/dζ = e^{-iα} - a² e^{iα} / w² + iΓ / (2π w)
      const dWdZeta = add(sub(emA, div(a2eA, mul(w, w))), div(circulation, w));
      const dZdZeta = sub(c(1), div(c(1), mul(zeta, zeta)));
      const conjV = div(dWdZeta, dZdZeta);
      return [conjV.re, -conjV.im];
    },
  };
}

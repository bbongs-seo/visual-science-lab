import { describe, expect, it } from "vitest";
import {
  angleForHour,
  describeHour,
  describeTide,
  signedAngleAround,
  solarHour,
  tideLevel,
} from "../src/shared/astro.js";

const Y = { x: 0, y: 1, z: 0 };

describe("signedAngleAround", () => {
  it("three.js rotation.y 와 같은 방향(+x → -z)을 + 로 잰다", () => {
    expect(signedAngleAround({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, Y)).toBeCloseTo(Math.PI / 2);
    expect(signedAngleAround({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Y)).toBeCloseTo(-Math.PI / 2);
  });

  it("축 방향 성분은 무시한다 (위도가 높아도 경도 차이만 본다)", () => {
    expect(signedAngleAround({ x: 1, y: 0, z: 0 }, { x: 0.3, y: 5, z: 0 }, Y)).toBeCloseTo(0);
  });
});

describe("solarHour · angleForHour", () => {
  it("태양을 정면으로 보면 낮 12시, 자전 방향으로 90도 더 가면 저녁 6시", () => {
    expect(solarHour(0)).toBeCloseTo(12);
    expect(solarHour(Math.PI / 2)).toBeCloseTo(18);
    expect(solarHour(-Math.PI / 2)).toBeCloseTo(6);
    expect(solarHour(Math.PI)).toBeCloseTo(0);
    expect(solarHour(5 * Math.PI)).toBeCloseTo(0);
  });

  it("angleForHour 는 solarHour 의 역함수다", () => {
    for (const hour of [0.5, 7, 12, 18.25, 23]) {
      expect(solarHour(angleForHour(hour))).toBeCloseTo(hour);
    }
  });
});

describe("describeHour", () => {
  it.each([
    [0, "밤 12시"],
    [3.9, "새벽 3시"],
    [7, "아침 7시"],
    [10, "오전 10시"],
    [12.5, "낮 12시"],
    [15, "오후 3시"],
    [18, "저녁 6시"],
    [22, "밤 10시"],
  ])("%s시 → %s", (hour, text) => {
    expect(describeHour(hour)).toBe(text);
  });
});

describe("tideLevel · describeTide", () => {
  it("달 쪽과 그 반대쪽은 밀물, 직각 방향은 썰물", () => {
    expect(tideLevel(0)).toBeCloseTo(1);
    expect(tideLevel(Math.PI)).toBeCloseTo(1);
    expect(tideLevel(Math.PI / 2)).toBeCloseTo(-1);
  });

  it("중간 물높이에서는 변화 방향으로 들물·날물을 구분한다", () => {
    expect(describeTide(0.9, true).key).toBe("high");
    expect(describeTide(-0.9, false).key).toBe("low");
    expect(describeTide(0, true).key).toBe("rising");
    expect(describeTide(0, false).key).toBe("falling");
  });
});

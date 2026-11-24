import { describe, expect, it } from "vitest";
import {
  angleForHour,
  dayLength,
  eclipseAt,
  moonPhaseName,
  dayToDate,
  describeDay,
  describeDuration,
  noonAltitude,
  seasonOf,
  sunDeclination,
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

describe("계절 계산", () => {
  const SEOUL = 37.57;

  it("하지·동지·춘분에 태양이 적도에서 벗어난 각", () => {
    expect(sunDeclination(171)).toBeCloseTo(23.44, 1);
    expect(sunDeclination(171 + 182.5)).toBeCloseTo(-23.44, 1);
    expect(Math.abs(sunDeclination(79))).toBeLessThan(1.5);
  });

  it("서울의 한낮 해 높이와 낮 길이: 여름에 높고 길다", () => {
    expect(noonAltitude(SEOUL, 23.44)).toBeCloseTo(75.87, 1);
    expect(noonAltitude(SEOUL, -23.44)).toBeCloseTo(28.99, 1);
    expect(dayLength(SEOUL, 23.44)).toBeCloseTo(14.6, 1);
    expect(dayLength(SEOUL, -23.44)).toBeCloseTo(9.4, 1);
    expect(dayLength(SEOUL, 0)).toBeCloseTo(12, 5);
  });

  it("북극은 하지에 백야, 동지에 극야", () => {
    expect(dayLength(89, 23.44)).toBe(24);
    expect(dayLength(89, -23.44)).toBe(0);
  });

  it.each([
    [0, "1월 1일", "겨울"],
    [58, "2월 28일", "겨울"],
    [59, "3월 1일", "봄"],
    [171, "6월 21일 하지", "여름"],
    [355, "12월 22일 동지", "겨울"],
    [364, "12월 31일", "겨울"],
    [365, "1월 1일", "겨울"],
  ])("%s일째 → %s (%s)", (day, text, season) => {
    expect(describeDay(day)).toBe(text);
    expect(seasonOf(day)).toBe(season);
  });

  it("시간 표시", () => {
    expect(describeDuration(14.6)).toBe("14시간 36분");
    expect(dayToDate(31)).toEqual({ month: 2, date: 1 });
  });
});

describe("일식·월식", () => {
  const sizes = { orbit: 5, earthRadius: 1, moonRadius: 0.27 }; // space.js SCALE

  it.each([
    [0, "solar", "total"],
    [3, "solar", "partial"],
    [30, "solar", null],
    [180, "lunar", "total"],
    [188, "lunar", "partial"],
    [150, "lunar", null],
    [100, "lunar", null],
  ])("달이 %s도에 있으면 %s %s", (deg, type, kind) => {
    const result = eclipseAt(deg, sizes);
    expect(result.type).toBe(type);
    expect(result.kind).toBe(kind);
  });

  it("일식은 한가운데일수록 해가 많이 가려진다", () => {
    expect(eclipseAt(0, sizes).reveal).toBe(0);
    expect(eclipseAt(3, sizes).reveal).toBeGreaterThan(0);
    expect(eclipseAt(3, sizes).reveal).toBeLessThan(1);
  });

  it.each([
    [0, "삭"],
    [45, "초승달"],
    [90, "상현달"],
    [180, "보름달"],
    [270, "하현달"],
    [320, "그믐달"],
    [359, "삭"],
  ])("%s도 → %s", (deg, name) => {
    expect(moonPhaseName(deg)).toBe(name);
  });
});

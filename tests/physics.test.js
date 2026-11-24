import { describe, expect, it } from "vitest";
import {
  airMass,
  rainbowAngle,
  rainbowPeak,
  scatterOdds,
  skyColors,
  sunColor,
  traceDroplet,
  waterIndex,
} from "../src/shared/optics.js";
import { createAirfoil } from "../src/shared/flow.js";

describe("하늘과 노을", () => {
  it("햇빛이 지나는 공기 길이: 한낮 1배, 지평선 약 38배", () => {
    expect(airMass(90)).toBeCloseTo(1, 2);
    expect(airMass(0)).toBeGreaterThan(35);
    expect(airMass(0)).toBeLessThan(40);
    expect(airMass(30)).toBeCloseTo(2, 1);
  });

  it("한낮의 해는 거의 하얗고, 해 질 녘 해는 빨강 > 초록 > 파랑", () => {
    const noon = sunColor(70);
    expect(Math.min(noon.r, noon.g, noon.b)).toBeGreaterThan(0.8);
    const sunset = sunColor(1);
    expect(sunset.r).toBe(1);
    expect(sunset.g).toBeLessThan(0.5);
    expect(sunset.b).toBeLessThan(sunset.g);
  });

  it("한낮 머리 위 하늘은 파랗다", () => {
    const { zenith } = skyColors(60);
    expect(zenith.b).toBe(1);
    expect(zenith.r).toBeLessThan(0.4);
  });

  it("공기에 막 들어온 곳에서는 파란빛이 가장 많이 흩어지고, 노을 때 길 끝에서는 빨간빛이 앞선다", () => {
    const entry = scatterOdds(0, 5);
    expect(entry.b).toBeGreaterThan(entry.g);
    expect(entry.g).toBeGreaterThan(entry.r);
    const deep = scatterOdds(1, 0);
    expect(deep.r).toBeGreaterThan(deep.b);
    expect(deep.strength).toBeLessThan(entry.strength);
  });
});

describe("무지개", () => {
  it("물의 굴절률: 보라가 빨강보다 크다", () => {
    expect(waterIndex(680)).toBeCloseTo(1.331, 3);
    expect(waterIndex(410)).toBeCloseTo(1.3425, 3);
  });

  it("빨강은 약 42도, 보라는 약 40.6도에서 빛이 가장 많이 모인다", () => {
    expect(rainbowPeak(waterIndex(680)).angle).toBeCloseTo(42.3, 0);
    expect(rainbowPeak(waterIndex(410)).angle).toBeCloseTo(40.6, 0);
    expect(rainbowPeak(waterIndex(680)).b).toBeCloseTo(0.86, 1);
  });

  it("물방울 속 길을 따라가면 나온 빛의 각이 공식과 같다", () => {
    const n = waterIndex(550);
    for (const b of [0.2, 0.6, 0.86, 0.95]) {
      const { points, out } = traceDroplet(b, n);
      points.forEach(([x, y]) => expect(Math.hypot(x, y)).toBeCloseTo(1, 6));
      const back = (Math.acos(-out[0]) * 180) / Math.PI; // 들어온 방향(+x)의 반대와 이루는 각
      expect(back).toBeCloseTo(rainbowAngle(b, n), 4);
    }
  });
});

describe("날개 둘레 흐름", () => {
  const wing = createAirfoil();

  it("멀리서는 바람 그대로(속도 1)", () => {
    const [u, v] = wing.velocity(-40, 25);
    expect(Math.hypot(u, v)).toBeCloseTo(1, 1);
  });

  it("날개 윗면 공기가 아랫면보다 빠르고, 양력이 위로 생긴다", () => {
    const top = Math.hypot(...wing.velocity(0, 0.55));
    const bottom = Math.hypot(...wing.velocity(0, -0.35));
    expect(top).toBeGreaterThan(1);
    expect(bottom).toBeLessThan(top);
    expect(wing.lift).toBeGreaterThan(0);
  });

  it("날개 모양: 뒷전은 (2, 0), 시위는 약 4, 날개 안은 흐름이 없다", () => {
    const outline = wing.outline();
    expect(outline[0][0]).toBeCloseTo(2, 3);
    expect(outline[0][1]).toBeCloseTo(0, 3);
    const xs = outline.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3.8);
    expect(wing.inside(0, 0.15)).toBe(true);
    expect(wing.inside(0, 2)).toBe(false);
  });
});

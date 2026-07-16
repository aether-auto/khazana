import { describe, expect, it } from "vitest";
import { serializeFaceLandingSpeculationRule } from "./face-landing-speculation.ts";

describe("serializeFaceLandingSpeculationRule", () => {
  it.each([
    { face: "study" as const, baseUrl: "/", expectedUrl: "/atlas", sameFaceUrl: "/" },
    { face: "atlas" as const, baseUrl: "/", expectedUrl: "/", sameFaceUrl: "/atlas" },
    { face: "study" as const, baseUrl: "/khazana/", expectedUrl: "/khazana/atlas", sameFaceUrl: "/khazana/" },
    { face: "atlas" as const, baseUrl: "/khazana/", expectedUrl: "/khazana/", sameFaceUrl: "/khazana/atlas" },
  ])("emits one moderated opposite-landing URL-list rule for $face at $baseUrl", ({
    face,
    baseUrl,
    expectedUrl,
    sameFaceUrl,
  }) => {
    const serialized = serializeFaceLandingSpeculationRule(face, baseUrl);
    const parsed: unknown = JSON.parse(serialized);

    expect(parsed).toEqual({
      prerender: [{
        urls: [expectedUrl],
        eagerness: "moderate",
      }],
    });

    const rule = (parsed as { prerender: Array<{ urls: string[] }> }).prerender[0];
    expect(rule?.urls).not.toContain(sameFaceUrl);
    expect(serialized).not.toContain("*");
    expect(serialized).not.toContain("immediate");
  });
});

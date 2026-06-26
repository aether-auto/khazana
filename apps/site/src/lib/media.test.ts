// media.test.ts — TDD: write failing tests first, then implement
import { describe, it, expect } from "vitest";
import { extractYouTubeId, buildYouTubeThumbnail } from "./media.js";

describe("extractYouTubeId", () => {
  it("extracts the video id from a canonical youtube.com/watch?v= URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=Fo3YAFOmzn4")).toBe("Fo3YAFOmzn4");
  });
  it("handles extra query params after v=", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=h_KGSjwfqFc&t=120s")).toBe("h_KGSjwfqFc");
  });
  it("extracts from youtu.be short URLs", () => {
    expect(extractYouTubeId("https://youtu.be/XK95YfKnV-M")).toBe("XK95YfKnV-M");
  });
  it("returns null for non-YouTube URLs", () => {
    expect(extractYouTubeId("https://latent.space/p/databricks")).toBeNull();
  });
  it("returns null for a bare youtube.com domain with no v param", () => {
    expect(extractYouTubeId("https://www.youtube.com/channel/UCxxxxxx")).toBeNull();
  });
  it("handles URLs with playlist params before v=", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?list=PL123&v=abc123DEFgh")).toBe("abc123DEFgh");
  });
});

describe("buildYouTubeThumbnail", () => {
  it("builds the hqdefault thumbnail URL for a video id", () => {
    expect(buildYouTubeThumbnail("Fo3YAFOmzn4")).toBe(
      "https://img.youtube.com/vi/Fo3YAFOmzn4/hqdefault.jpg",
    );
  });
  it("builds thumbnail for an id with underscores and dashes", () => {
    expect(buildYouTubeThumbnail("h_KGSjwfqFc")).toBe(
      "https://img.youtube.com/vi/h_KGSjwfqFc/hqdefault.jpg",
    );
  });
});

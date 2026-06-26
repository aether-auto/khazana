// media.test.ts — TDD: write failing tests first, then implement
import { describe, it, expect } from "vitest";
import { extractYouTubeId, buildYouTubeThumbnail, isYouTubeShort } from "./media.js";

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

describe("isYouTubeShort", () => {
  it("detects a youtube.com/shorts/{id} URL", () => {
    expect(isYouTubeShort("https://www.youtube.com/shorts/vbScYtKALdY")).toBe(true);
  });
  it("detects a shorts URL on the bare youtube.com host", () => {
    expect(isYouTubeShort("https://youtube.com/shorts/SPsK4P6UKts")).toBe(true);
  });
  it("detects a shorts URL with trailing query params", () => {
    expect(isYouTubeShort("https://www.youtube.com/shorts/TM8JhXsPYTo?feature=share")).toBe(true);
  });
  it("returns false for a normal watch URL", () => {
    expect(isYouTubeShort("https://www.youtube.com/watch?v=Fo3YAFOmzn4")).toBe(false);
  });
  it("returns false for a youtu.be short-link (that is NOT a Short)", () => {
    expect(isYouTubeShort("https://youtu.be/XK95YfKnV-M")).toBe(false);
  });
  it("returns false for a non-YouTube URL", () => {
    expect(isYouTubeShort("https://latent.space/p/databricks")).toBe(false);
  });
  it("returns false for a malformed URL", () => {
    expect(isYouTubeShort("not a url")).toBe(false);
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

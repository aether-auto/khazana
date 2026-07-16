export type FaceLanding = "study" | "atlas";

interface SpeculationRules {
  prerender: Array<{
    urls: [string];
    eagerness: "moderate";
  }>;
}

function withBase(baseUrl: string, path: string): string {
  const basePath = baseUrl.replace(/^\/+|\/+$/g, "");
  return `${basePath ? `/${basePath}` : ""}${path}`;
}

/**
 * Serialize one conservative URL-list prerender rule for face landing switch.
 * Only opposite landing receives moderated warmup: never wildcard, same-face,
 * or immediate navigation.
 */
export function serializeFaceLandingSpeculationRule(face: FaceLanding, baseUrl: string): string {
  const oppositeLanding = face === "study" ? "/atlas" : "/";
  const rules: SpeculationRules = {
    prerender: [
      {
        urls: [withBase(baseUrl, oppositeLanding)],
        eagerness: "moderate",
      },
    ],
  };

  return JSON.stringify(rules);
}

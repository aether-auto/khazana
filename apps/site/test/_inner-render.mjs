// Runs INSIDE Vite's SSR runtime (loaded via ssrLoadModule by
// render-shell-faces.mjs) so every `astro:` virtual module Shell imports
// resolves. Renders the REAL Shell layout three ways through the Container API
// and returns the served HTML strings. See render-shell-faces.mjs for why this
// can't run in the outer Node process.
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import Shell from "../src/layouts/Shell.astro";
export async function renderFaces() {
  const render = async (props) => {
    const container = await AstroContainer.create();
    container.addServerRenderer({ name: "@astrojs/react", renderer: reactRenderer });
    return container.renderToString(Shell, { props });
  };
  return {
    studyDefault: await render({ title: "Study default" }),
    studyExplicit: await render({ title: "Study explicit", face: "study" }),
    atlas: await render({ title: "Atlas", face: "atlas" }),
  };
}

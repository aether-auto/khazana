// Runs INSIDE Vite's SSR runtime (loaded via ssrLoadModule by
// render-shell-faces.mjs) so every `astro:` virtual module Shell imports
// resolves. Renders the REAL Shell layout three ways through the Container API
// and returns the served HTML strings. See render-shell-faces.mjs for why this
// can't run in the outer Node process.
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import Shell from "../src/layouts/Shell.astro";
import AtlasShell from "../src/layouts/AtlasShell.astro";
export async function renderFaces() {
  const render = async (Component, props) => {
    const container = await AstroContainer.create();
    container.addServerRenderer({ name: "@astrojs/react", renderer: reactRenderer });
    return container.renderToString(Component, { props });
  };
  return {
    // Study shell renders (data-face + the STUDY⟷atlas bezel switch link).
    studyDefault: await render(Shell, { title: "Study default" }),
    studyExplicit: await render(Shell, { title: "Study explicit", face: "study" }),
    atlas: await render(Shell, { title: "Atlas", face: "atlas" }),
    // AtlasShell renders (data-face="atlas", the SiteGate hook, all seven rail
    // links, and the mirrored atlas⟷STUDY bezel switch link). Rendered with a
    // representative surface active so the rail's lit state is present too.
    atlasShell: await render(AtlasShell, {
      title: "Atlas browser",
      active: "browser",
      crumbs: ["browser"],
    }),
  };
}

// apps/site/src/components/mdx/model3d-glb.test.ts
//
// SSR / no-JS fallback tests for the Model3D v2 upgrade (design §4.8): an
// optional `src` glb/gltf loader added alongside the default procedural gyroid.
//
// The repo's vitest include glob runs in the Node environment (no jsdom), so
// Model3D's `useEffect` (which is the ONLY thing that flips `allowGL` true and
// mounts the WebGL canvas) never fires here. That means renderToStaticMarkup
// exercises exactly the SSR / no-JS path — the baked fallback — which is what we
// must assert is non-blank and descriptive in BOTH modes. three.js is never
// touched, so these tests are stable in Node.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Model3D from "./Model3D.js";

test("Model3D default (no src) SSR renders the gyroid fallback, never blank", () => {
  const html = renderToStaticMarkup(createElement(Model3D, {}));
  expect(html.length).toBeGreaterThan(0);
  // baked fallback motif + its descriptive note are in the static DOM
  expect(html).toContain("m3d-lattice");
  expect(html).toContain("gyroid lattice");
  // never mounts WebGL on the server → no <canvas> in SSR output
  expect(html).not.toContain("<canvas");
});

test("Model3D with src SSR describes the model via alt (a11y + no-JS fallback)", () => {
  const alt = "an M8 planetary reduction gear, 12 teeth";
  const html = renderToStaticMarkup(
    createElement(Model3D, {
      src: "/demo/model-demo.glb",
      alt,
      label: "reduction gear",
      caption: "Fig. 3 — the printed gear.",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  // the fallback text now DESCRIBES the model (not the gyroid boilerplate)
  expect(html).toContain(alt);
  expect(html).not.toContain("gyroid lattice");
  // model label is surfaced
  expect(html).toContain("reduction gear");
  // panel carries an accessible name (role=img + aria-label)
  expect(html).toContain('role="img"');
  expect(html).toContain(`aria-label="${alt}`.slice(0, 20));
  // caption still renders
  expect(html).toContain("Fig. 3");
  // SSR never mounts WebGL
  expect(html).not.toContain("<canvas");
});

test("Model3D with src but no alt/label falls back to a sane model note", () => {
  const html = renderToStaticMarkup(
    createElement(Model3D, { src: "/demo/model-demo.glb" }),
  );
  expect(html).toContain("3D model");
  expect(html).not.toContain("gyroid lattice");
});

test("the committed demo .glb is a valid, tiny binary glTF 2.0", () => {
  const glbPath = fileURLToPath(
    new URL("../../content/blog/_assets/_demo/model-demo.glb", import.meta.url),
  );
  const buf = readFileSync(glbPath);
  // asset-size discipline: keep the demo well under the recommended budget
  expect(buf.length).toBeGreaterThan(100); // not an empty stub
  expect(buf.length).toBeLessThan(200 * 1024); // < ~200 KB target

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // GLB header: magic "glTF", version 2, declared length == file length
  expect(dv.getUint32(0, true)).toBe(0x46546c67);
  expect(dv.getUint32(4, true)).toBe(2);
  expect(dv.getUint32(8, true)).toBe(buf.length);

  // first chunk must be JSON and parse to a glTF 2.0 doc with a mesh
  const jsonLen = dv.getUint32(12, true);
  expect(dv.getUint32(16, true)).toBe(0x4e4f534a); // "JSON"
  const jsonBytes = new Uint8Array(buf.buffer, buf.byteOffset + 20, jsonLen);
  const gltf = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
    asset: { version: string };
    meshes: unknown[];
  };
  expect(gltf.asset.version).toBe("2.0");
  expect(gltf.meshes.length).toBeGreaterThan(0);
});

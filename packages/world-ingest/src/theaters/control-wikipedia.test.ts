import { readFile } from "node:fs/promises";
import { ControlLayerSchema } from "@khazana/core";
import { expect, test } from "vitest";
import { fetchWikipediaControlLayer, type WikipediaSourceFetcher } from "./control-wikipedia.js";

const fixtureUrl = new URL("./__fixtures__/control-wikipedia/example-module.json", import.meta.url);
const snapshotAt = "2026-07-15T12:00:00.000Z";
const sourceUrl = "https://en.wikipedia.org/wiki/Template:Example_detailed_map";

test("maps a Wikimedia action=parse source into fallback control layer and side-keyed GeoJSON", async () => {
  const parseResponse = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
  let requestedUrl = "";
  const fetchFixture: WikipediaSourceFetcher = async (url) => {
    requestedUrl = url;
    return parseResponse;
  };

  const result = await fetchWikipediaControlLayer({
    id: "russia-ukraine",
    templateTitle: "Template:Example detailed map",
    sourceUrl,
    snapshotAt,
  }, fetchFixture);

  expect(requestedUrl).toBe("https://en.wikipedia.org/w/api.php?action=parse&page=Template%3AExample+detailed+map&prop=wikitext&format=json&origin=*");
  expect(result.geometry.features.map((feature) => feature.properties.sideId)).toEqual(["ukraine", "russia"]);
  expect(result.geometry.features).toEqual([
    {
      type: "Feature",
      properties: { sideId: "ukraine" },
      geometry: { type: "MultiPolygon", coordinates: [[[[32, 48], [32.5, 48], [32.5, 48.5], [32, 48.5], [32, 48]]]] },
    },
    {
      type: "Feature",
      properties: { sideId: "russia" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[33, 47], [33.5, 47], [33.5, 47.5], [33, 47.5], [33, 47]]],
          [[[34, 47], [34.5, 47], [34.5, 47.5], [34, 47.5], [34, 47]]],
        ],
      },
    },
  ]);
  expect(result.geometry.features.every((feature) => feature.geometry.type === "MultiPolygon")).toBe(true);
  expect(result.geometry.features.every((feature) => Array.isArray(feature.geometry.coordinates[0]?.[0]?.[0]))).toBe(true);
  expect(result.layer).toMatchObject({
    theaterId: "russia-ukraine",
    geometryStatus: "fallback",
    geometryRef: "data/world/theaters/russia-ukraine/control/wikipedia-2026-07-15.geojson",
    sourceUrl,
    reliabilityNote: "Community cross-check (Wikipedia), lower rigor than primary OSINT; underlying control assessments may trace to primary OSINT.",
  });
  expect(result.layer.geometryRef).not.toBeNull();
  expect(result.layer.provenance).toEqual({
    sourceId: "wikipedia-detailed-map",
    sourceUrl,
    methodUrl: "https://www.mediawiki.org/wiki/API:Parsing_wikitext",
    licenseTier: "redistribute-raw-ok",
    redistribution: true,
    origin: "referenced",
    retrievedAt: snapshotAt,
    uncertainty: { kind: "none" },
  });
  expect(ControlLayerSchema.parse(result.layer)).toEqual(result.layer);
});

test("rejects an action=parse payload without source wikitext", async () => {
  const fetchMalformed: WikipediaSourceFetcher = async () => ({ parse: { wikitext: {} } });

  await expect(fetchWikipediaControlLayer({
    id: "russia-ukraine",
    templateTitle: "Template:Broken",
    sourceUrl: "https://en.wikipedia.org/wiki/Module:Broken",
    snapshotAt,
  }, fetchMalformed)).rejects.toThrow("Wikimedia action=parse response must provide parse.wikitext.* as text");
});

test("rejects each non-empty malformed detailed-map table row", async () => {
  const fetchMalformed: WikipediaSourceFetcher = async () => ({
    parse: {
      wikitext: {
        "*": "{| class=\"wikitable\"\n! side !! polygons (longitude,latitude)\n|-\n| ukraine\n| 32,48; 33,48; 33,49\n|-\n| russia\n|}",
      },
    },
  });

  await expect(fetchWikipediaControlLayer({
    id: "russia-ukraine",
    templateTitle: "Template:Broken",
    sourceUrl: "https://en.wikipedia.org/wiki/Template:Broken",
    snapshotAt,
  }, fetchMalformed)).rejects.toThrow("Wikipedia detailed-map table row must contain exactly a side ID and polygon coordinates");
});

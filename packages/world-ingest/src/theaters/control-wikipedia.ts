import { ControlLayerSchema } from "@khazana/core";

export const WIKIMEDIA_ACTION_PARSE_URL = "https://en.wikipedia.org/w/api.php";
export const WIKIPEDIA_FALLBACK_RELIABILITY = "Community cross-check (Wikipedia), lower rigor than primary OSINT; underlying control assessments may trace to primary OSINT.";

export interface WikipediaControlRequest {
  readonly id: string;
  readonly templateTitle: string;
  readonly sourceUrl: string;
  readonly snapshotAt: string;
}

export interface WikipediaTemplateRegistration {
  readonly templateTitle: string;
  readonly sourceUrl: string;
}

export type GeoJsonPosition = [longitude: number, latitude: number];
export type GeoJsonLinearRing = GeoJsonPosition[];
export type GeoJsonPolygonCoordinates = GeoJsonLinearRing[];
export type GeoJsonMultiPolygonCoordinates = GeoJsonPolygonCoordinates[];

export interface GeoJsonMultiPolygonFeature {
  readonly type: "Feature";
  readonly properties: { readonly sideId: string };
  readonly geometry: {
    readonly type: "MultiPolygon";
    readonly coordinates: GeoJsonMultiPolygonCoordinates;
  };
}

export interface GeoJsonFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: GeoJsonMultiPolygonFeature[];
}

export interface WikipediaControlResult {
  readonly layer: ReturnType<typeof ControlLayerSchema.parse>;
  readonly geometry: GeoJsonFeatureCollection;
}

/**
 * Hand-curated only. Add entry only after source module exposes side-keyed territorial
 * coordinate table; point-marker Lua modules cannot be converted into control polygons.
 */
export const WIKIPEDIA_CONTROL_TEMPLATES: Readonly<Record<string, WikipediaTemplateRegistration>> = {};

export function hasWikipediaControlTemplate(
  theaterId: string,
  registrations: Readonly<Record<string, WikipediaTemplateRegistration>> = WIKIPEDIA_CONTROL_TEMPLATES,
): boolean {
  return Object.hasOwn(registrations, theaterId);
}

const TABLE_HEADER = /!\s*side\s*!!\s*polygons\s*\(longitude\s*,\s*latitude\)/iu;
const SIDE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const NUMBER = "-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const POSITION = new RegExp(`^\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*$`, "u");

interface ControlArea {
  readonly sideId: string;
  readonly coordinates: GeoJsonMultiPolygonCoordinates;
}

function samePosition(left: GeoJsonPosition, right: GeoJsonPosition): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function parsePosition(value: string, sideId: string): GeoJsonPosition {
  const match = POSITION.exec(value);
  if (!match) throw new Error(`Wikipedia detailed-map coordinates are invalid for side ${sideId}`);

  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (
    !Number.isFinite(longitude)
    || !Number.isFinite(latitude)
    || longitude < -180
    || longitude > 180
    || latitude < -90
    || latitude > 90
  ) {
    throw new Error(`Wikipedia detailed-map coordinates are out of range for side ${sideId}`);
  }
  return [longitude, latitude];
}

function parsePolygon(value: string, sideId: string): GeoJsonPolygonCoordinates {
  const positions = value.split(";").map((position) => parsePosition(position, sideId));
  if (positions.length < 3) throw new Error(`Wikipedia detailed-map polygon is too short for side ${sideId}`);

  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  return [samePosition(first, last) ? positions : [...positions, first]];
}

function parseControlAreas(source: string): ControlArea[] {
  const table = (source.match(/\{\|[\s\S]*?\|\}/gu) ?? []).find((candidate) => TABLE_HEADER.test(candidate));
  if (!table) throw new Error("Wikipedia detailed-map template is missing a side-keyed coordinate table");

  const areas: ControlArea[] = [];
  for (const row of table.split(/\r?\n\|-\s*/u).slice(1)) {
    const rowText = row.replace(/\r?\n\|\}\s*$/u, "").trim();
    if (rowText.length === 0) continue;

    const cells = rowText
      .split(/\r?\n\|/u)
      .map((cell) => cell.replace(/^\|/u, "").trim());
    if (cells.length !== 2 || cells.some((cell) => cell.length === 0)) {
      throw new Error("Wikipedia detailed-map table row must contain exactly a side ID and polygon coordinates");
    }

    const sideId = cells[0]!;
    const coordinateText = cells[1]!;
    if (!SIDE_ID.test(sideId)) throw new Error(`Wikipedia detailed-map side ID is invalid: ${sideId}`);

    const coordinates = coordinateText
      .split(/\s*\/\s*/u)
      .map((polygon) => {
        if (polygon.length === 0) {
          throw new Error(`Wikipedia detailed-map has an empty polygon for side ${sideId}`);
        }
        return parsePolygon(polygon, sideId);
      });
    if (coordinates.length === 0) throw new Error(`Wikipedia detailed-map has no polygons for side ${sideId}`);
    areas.push({ sideId, coordinates });
  }
  if (areas.length === 0) throw new Error("Wikipedia detailed-map template has no control areas");
  return areas;
}

export function wikipediaParseSourceUrl(templateTitle: string): string {
  const params = new URLSearchParams({
    action: "parse",
    page: templateTitle.trim(),
    prop: "wikitext",
    format: "json",
    origin: "*",
  });
  return `${WIKIMEDIA_ACTION_PARSE_URL}?${params.toString()}`;
}

export function wikipediaGeometryRef(theaterId: string, snapshotAt: string): string {
  return `data/world/theaters/${theaterId}/control/wikipedia-${snapshotAt.slice(0, 10)}.geojson`;
}

function wikipediaProvenance(input: WikipediaControlRequest) {
  return {
    sourceId: "wikipedia-detailed-map",
    sourceUrl: input.sourceUrl,
    methodUrl: "https://www.mediawiki.org/wiki/API:Parsing_wikitext",
    licenseTier: "redistribute-raw-ok",
    redistribution: true,
    origin: "referenced",
    retrievedAt: input.snapshotAt,
    uncertainty: { kind: "none" },
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceTextFromParseResponse(response: unknown): string {
  if (!isJsonRecord(response) || !isJsonRecord(response.parse) || !isJsonRecord(response.parse.wikitext)) {
    throw new Error("Wikimedia action=parse response must provide parse.wikitext.* as text");
  }

  const sourceText = response.parse.wikitext["*"];
  if (typeof sourceText !== "string") {
    throw new Error("Wikimedia action=parse response must provide parse.wikitext.* as text");
  }
  return sourceText;
}

/** Validate an unknown action=parse response before mapping its source coordinate table. */
export function mapWikipediaParseResponse(response: unknown, input: WikipediaControlRequest): WikipediaControlResult {
  const moduleSource = sourceTextFromParseResponse(response);

  const areas = parseControlAreas(moduleSource);
  const geometry: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: areas.map((area) => ({
      type: "Feature",
      properties: { sideId: area.sideId },
      geometry: { type: "MultiPolygon", coordinates: area.coordinates },
    })),
  };
  const layer = ControlLayerSchema.parse({
    theaterId: input.id,
    snapshotAt: input.snapshotAt,
    geometryStatus: "fallback",
    geometryRef: wikipediaGeometryRef(input.id, input.snapshotAt),
    sourceUrl: input.sourceUrl,
    reliabilityNote: WIKIPEDIA_FALLBACK_RELIABILITY,
    provenance: wikipediaProvenance(input),
  });
  return { layer, geometry };
}

export type WikipediaSourceFetcher = (url: string) => Promise<unknown>;

const defaultWikipediaSourceFetcher: WikipediaSourceFetcher = async (url) => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Wikimedia action=parse request failed with HTTP ${response.status}`);
  return response.json();
};

export async function fetchWikipediaControlLayer(
  input: WikipediaControlRequest,
  fetchSource: WikipediaSourceFetcher = defaultWikipediaSourceFetcher,
): Promise<WikipediaControlResult> {
  const response = await fetchSource(wikipediaParseSourceUrl(input.templateTitle));
  return mapWikipediaParseResponse(response, input);
}

export interface WikipediaControlSource {
  readonly providerId: "wikipedia";
  readonly geometryStatus: "fallback";
  readonly supports: (theater: { readonly id: string }) => boolean;
  readonly fetch: (theater: { readonly id: string }) => Promise<WikipediaControlResult>;
}

export function createWikipediaControlSource(
  registrations: Readonly<Record<string, WikipediaTemplateRegistration>> = WIKIPEDIA_CONTROL_TEMPLATES,
  fetchSource: WikipediaSourceFetcher = defaultWikipediaSourceFetcher,
): WikipediaControlSource {
  return {
    providerId: "wikipedia",
    geometryStatus: "fallback",
    supports: (theater) => hasWikipediaControlTemplate(theater.id, registrations),
    fetch: async (theater) => {
      const registration = registrations[theater.id];
      if (!registration) throw new Error(`No Wikipedia control template registered for ${theater.id}`);
      return fetchWikipediaControlLayer({
        id: theater.id,
        ...registration,
        snapshotAt: new Date().toISOString(),
      }, fetchSource);
    },
  };
}

export const wikipediaControlSource = createWikipediaControlSource();

import type {
  CadenceLane,
  Contract,
  FetchContext,
  Indicator,
  WorldEvent,
} from "@khazana/core";

export interface WorldIndicatorSource {
  id: string;
  cadenceLane: CadenceLane;
  fetch(ctx: FetchContext): Promise<Indicator[]>;
}

export interface WorldEventSource {
  id: string;
  cadenceLane: "fast";
  fetch(ctx: FetchContext): Promise<WorldEvent[]>;
}

export interface WorldContractSource {
  id: string;
  cadenceLane: CadenceLane;
  fetch(ctx: FetchContext): Promise<Contract[]>;
}

import { expectTypeOf, test } from "vitest";
import type { Contract, FetchContext, Indicator, WorldEvent } from "@khazana/core";
import type {
  WorldContractSource,
  WorldEventSource,
  WorldIndicatorSource,
} from "./index.js";

type FetchContextFor<T> = T extends { fetch(ctx: infer Context): unknown } ? Context : never;
type FetchOutputFor<T> = T extends { fetch(ctx: FetchContext): Promise<infer Output> } ? Output : never;

test("world source contracts use core FetchContext and exact output contracts", () => {
  expectTypeOf<FetchContextFor<WorldIndicatorSource>>().toEqualTypeOf<FetchContext>();
  expectTypeOf<FetchContextFor<WorldEventSource>>().toEqualTypeOf<FetchContext>();
  expectTypeOf<FetchContextFor<WorldContractSource>>().toEqualTypeOf<FetchContext>();

  expectTypeOf<FetchOutputFor<WorldIndicatorSource>>().toEqualTypeOf<Indicator[]>();
  expectTypeOf<FetchOutputFor<WorldEventSource>>().toEqualTypeOf<WorldEvent[]>();
  expectTypeOf<FetchOutputFor<WorldContractSource>>().toEqualTypeOf<Contract[]>();
});

test("event sources permit only fast cadence", () => {
  expectTypeOf<WorldEventSource["cadenceLane"]>().toEqualTypeOf<"fast">();

  const nonFastEvent: WorldEventSource = {
    id: "not-allowed",
    // @ts-expect-error WorldEventSource is always in fast lane.
    cadenceLane: "slow",
    async fetch() {
      return [];
    },
  };

  expectTypeOf(nonFastEvent).toEqualTypeOf<WorldEventSource>();
});

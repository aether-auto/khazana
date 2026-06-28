// React binding for the shared bench store. `useSyncExternalStore` gives every
// island a consistent, tearing-free read of the one module-scope state object, so
// a fader move in §2 re-renders §3/§4 in the same commit.
//
// HYDRATION SAFETY (#418): the store is module-scope and MUTABLE — §2's BenchConsole
// (client:load) can write to it (e.g. a fader drag) before another island, or even
// itself, finishes hydrating. SSR markup was rendered for the DEFAULT state, so if
// `getSnapshot` returned the already-mutated state on the FIRST client render, the
// island's text (a fader readout, an aria-label, a why-this segment) would differ
// from the server HTML → React #418. So the first client render MUST equal the SSR
// markup: we hand React the STABLE default snapshot until mounted, then switch to
// the live store value in a post-hydration effect. This mirrors use-bench-data.ts's
// "render empty/server snapshot first, real value after mount" discipline, and
// covers every island that derives render output from store state at once.
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  benchStore,
  defaultState,
  type BenchState,
  type BenchStore,
} from "./bench-store.js";

// The SSR-stable snapshot every island's first client render reflects: the same
// factory defaults the server rendered. Frozen so callers can't mutate it.
const SERVER_SNAPSHOT: BenchState = defaultState();

/** Subscribe to the shared bench store; returns the live state + the store API. */
export function useBenchStore(store: BenchStore = benchStore): {
  state: BenchState;
  store: BenchStore;
} {
  // false on the server AND on the first client render → both render the stable
  // default snapshot, so the hydration markup matches. Flips true after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const getSnapshot = mounted ? store.get : () => SERVER_SNAPSHOT;
  const state = useSyncExternalStore(
    store.subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT, // server snapshot is always the factory default → matches SSR
  );
  return { state, store };
}

# khazana — developer entrypoints
#
# `make serve` runs the Astro static-site dev server with hot-module reload.
# The port is stable (4321 by default) and overridable so a worktree can run on
# a different port than the main checkout: `PORT=4331 make serve`. The dev
# server prints its own URL; we echo it up front too for convenience.

PORT ?= 4321

.PHONY: serve
serve:
	@echo "khazana site dev server → http://localhost:$(PORT)/"
	pnpm --filter @khazana/site dev --port $(PORT) --host

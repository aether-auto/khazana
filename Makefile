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
	@set -eu; \
		pnpm --filter @khazana/site dev --port $(PORT) --host & \
		server_pid=$$!; \
		trap 'kill "$$server_pid" 2>/dev/null || true' EXIT INT TERM; \
		while ! curl --silent --fail "http://localhost:$(PORT)/" >/dev/null 2>&1; do \
			if ! kill -0 "$$server_pid" 2>/dev/null; then wait "$$server_pid"; fi; \
			sleep 1; \
		done; \
		if [ "$${SERVE_NO_OPEN:-}" != "1" ]; then open "http://localhost:$(PORT)/"; fi; \
		wait "$$server_pid"

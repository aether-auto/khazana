# World Data private repo (`aether-auto/khazana-world-data`)

The **D2 private store** for all world data and derived world-data layers lives in a separate
private repository, `aether-auto/khazana-world-data`, kept out of the public `aether-auto/khazana`
repo. Public-repo automation reads from and writes to it through a single least-privilege token,
`WORLD_DATA_REPO_TOKEN`.

> This document intentionally contains **no token value**. Never paste a token into this file, into
> code, or into Actions logs.

---

## The token: `WORLD_DATA_REPO_TOKEN`

- **Type:** GitHub **fine-grained personal access token**.
- **Resource owner / scope:** `aether-auto`, limited to the **single** repository
  `aether-auto/khazana-world-data` (Only select repositories → this repo).
- **Permissions:** Repository → **Contents: Read and write** only. Nothing else.
- **Stored as:** Actions secret `WORLD_DATA_REPO_TOKEN` on `aether-auto/khazana`.

### Why fine-grained + Contents-only

Least privilege. The public repo never needs anything from the private repo except to read and
write files under `data/`. A classic token or a broad OAuth token would grant far more than that
and is not acceptable here.

### Creating / rotating the token

Fine-grained PATs **cannot** be created via the `gh` CLI or the REST API — GitHub only supports
creating them in the web UI. Steps:

1. Go to **GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. **Resource owner:** `aether-auto`. **Repository access:** *Only select repositories* →
   `aether-auto/khazana-world-data`.
3. **Permissions:** Repository permissions → **Contents: Read and write**. Leave everything else at
   *No access*.
4. **Expiration:** set an explicit date (max 366 days). Record it in the rotation log below.
5. Generate, copy the value once, then set it as the secret (see next section). Do not store the
   raw value anywhere else.

### Setting the secret (no value in git)

```bash
# Paste the token when prompted; it is never written to disk or to this repo.
gh secret set WORLD_DATA_REPO_TOKEN --repo aether-auto/khazana
```

### Rotation log

Rotate on or before the recorded expiry. On rotation: generate a new token (steps above), re-run
`gh secret set WORLD_DATA_REPO_TOKEN`, then delete the old token from GitHub.

| Created | Expires / rotate by | Notes |
|---|---|---|
| _TBD (set on creation)_ | _TBD (record expiry here)_ | initial token |

---

## Safe **read-only** checkout / staging (from the public repo)

When a workflow only needs to **read** world data, check the private repo out with
**`persist-credentials: false`** so the token is never written into the working tree's git config.

```yaml
- name: Check out world-data (read-only)
  uses: actions/checkout@v4
  with:
    repository: aether-auto/khazana-world-data
    token: ${{ secrets.WORLD_DATA_REPO_TOKEN }}
    path: .world-data
    persist-credentials: false   # token not left in .world-data/.git/config
```

Stage / read files directly from `.world-data/` (for example `.world-data/data/world-sources.json`).
Never `cat`, `echo`, or otherwise print the token.

## Writer checkout / push (from the public repo)

To **write** back, check out with `persist-credentials: false` as above, commit inside
`.world-data`, then push by supplying the token as an ephemeral inline HTTP auth header — so it is
never persisted to config and never appears in logs:

```yaml
- name: Push world-data
  env:
    WD_TOKEN: ${{ secrets.WORLD_DATA_REPO_TOKEN }}
  run: |
    git -C .world-data add -A
    git -C .world-data -c user.name=khazana-bot -c user.email=bot@khazana \
      commit -m "chore: update world data" || echo "nothing to commit"
    AUTH="$(printf 'x-access-token:%s' "$WD_TOKEN" | base64 | tr -d '\n')"
    git -C .world-data -c http.extraheader="AUTHORIZATION: basic $AUTH" push origin HEAD:main
```

The key command is:

```bash
git -C .world-data push origin HEAD:main
```

(authenticated via the inline `http.extraheader` shown above, so the credential lives only for that
one process). The `world-data-auth-smoke.yml` workflow exercises exactly this path with
`--dry-run`, so it authenticates and validates push access without mutating either repository.

## Rules

- No token value in this repo, in code, or in logs.
- Read-only paths use `persist-credentials: false`.
- Writer paths supply the token via a masked env var and an inline `http.extraheader`, never a
  remote URL that could be logged.
- Rotate on schedule; update the rotation log.

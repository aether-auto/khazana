# Offline adapter fixtures

Put per-source offline fixtures under `src/__fixtures__/<source-id>/`.

Every future adapter test reads local fixture. Never call live network. Assert mapped domain fields and full provenance: `provenance.licenseTier`, `provenance.redistribution`, and `provenance.origin`. Assert source URL and method URL when adapter stamps them.

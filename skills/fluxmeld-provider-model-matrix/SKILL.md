---
name: fluxmeld-provider-model-matrix
description: Use when running FluxMeld provider and model matrix tests using live /v1/models discovery and management API attribution.
---

# FluxMeld Provider Model Matrix

Use this skill when model coverage must follow the live `/v1/models` surface.

## Rules

- Use `GET /v1/models` as the primary model source.
- Use management API data for attribution and cleanup.
- Keep provider fail-fast opt-in.

## Commands

```bash
FLUXMELD_BASE_URL=http://127.0.0.1:8080 \
FLUXMELD_MGMT_SECRET=mgmt_xxx \
FLUXMELD_API_KEY=sk_xxx \
node skills/fluxmeld-provider-model-matrix/scripts/run-model-matrix.mjs \
  --fixture backup/har/cherry-studio-fixture.json \
  --profile cherry-studio
```

The default model source is `GET /v1/models`. Use `--provider`, `--model`, and `--fail-fast-provider N` to narrow live runs.

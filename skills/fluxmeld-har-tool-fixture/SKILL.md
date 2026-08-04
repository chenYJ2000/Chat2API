---
name: fluxmeld-har-tool-fixture
description: Use when converting OpenAI-compatible client HAR files into sanitized replayable FluxMeld tool-calling fixtures.
---

# FluxMeld HAR Tool Fixture

Use this skill when a recorded client HAR should become reusable test input.

## Rules

- Treat HAR parsing as generic.
- Put client-specific expectations in replay profiles, not in HAR extraction.
- Remove secrets and volatile headers from generated fixtures.
- Output fixtures are safe to replay and must not contain `Authorization` values.

## Commands

```bash
node skills/fluxmeld-har-tool-fixture/scripts/extract-har-fixtures.mjs \
  --har backup/har/Cherry-Studio.har \
  --client cherry-studio \
  --out backup/har/cherry-studio-fixture.json
```

Use `--har` for the source HAR, `--client` for the fixture client profile, and `--out` for the output fixture path. If omitted, `--har` can come from `FLUXMELD_HAR`, `--client` can come from `FLUXMELD_CLIENT_PROFILE`, and output defaults to `backup/har/<client>-tool-fixtures-<timestamp>.json`.

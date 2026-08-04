---
name: fluxmeld-proxy-testing
description: Use when validating FluxMeld Manager proxy behavior across dialogue, tool calling, context, provider routing, request logs, and live client replay workflows.
---

# FluxMeld Proxy Testing

Use this as the orchestration entry point.

## Focused Skills

- Use `fluxmeld-management-api` for management API setup, observation, and cleanup.
- Use `fluxmeld-har-tool-fixture` to extract reusable fixtures from HAR files.
- Use `fluxmeld-tool-client-replay` to replay one client fixture against one or more models.
- Use `fluxmeld-provider-model-matrix` to discover `/v1/models` and run matrix coverage.

## Default Order

1. Run source regressions when code changed.
2. Snapshot health and config through management API.
3. Extract or select a fixture.
4. Discover models through `/v1/models`.
5. Replay scenarios.
6. Inspect logs and sessions.
7. Restore config and delete temporary test assets.

## Source Of Truth

The versioned source of truth is this `skills/fluxmeld-proxy-testing` directory plus the focused sibling skills. ignored .codex copies are local working copies only and must not be the only place where testing behavior is documented.

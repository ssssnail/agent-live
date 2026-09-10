# Adapter review

Confirm that the package imports only `agent-live` public exports, contains no copied renderer or Creator implementation, and changes no other adapter. Capabilities must be inferred from implemented controls and view mounting rather than manually asserted.

Check that one authoritative host source produces each fact, streaming cursors do not repeat completed text, tool start/end share an ID, subagents never replace the main agent, and uncertain outcomes remain uncertain. Cleanup must be idempotent and release only adapter-owned resources. Agent Live owns and cleans its own runtime resources; the adapter must not stop the host.

For an official contribution, require automated contract tests, a real-host test record, supported host versions, permissions/data disclosure, dependency licenses, and evidence for every public API claim.

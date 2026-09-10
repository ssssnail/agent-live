# Host investigation

Prefer the host's official terminology. For every claimed capability, capture a source and the exact public symbol, endpoint, callback, notification, command, or view slot.

Investigate independently: realtime observation; task submission and interruption; approval response; model read or selection; stable session, agent, parent-agent, turn and tool-call identities; history APIs; command, tool, context and view registration; startup, shutdown, reconnect and duplicate delivery.

An API that controls a task does not automatically expose all internal events. A history API is not realtime observation. A hook supplies only the fields present at that hook. Unknown means unsupported until evidence is found.

Create an event table with: official event, source, delivery form, available fields, stable IDs, ordering/duplication notes, mapped `OfficeDelta`, and degradation.

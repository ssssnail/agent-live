# Security Policy

## Reporting a vulnerability

Please do not disclose vulnerabilities in a public issue. Use GitHub's private vulnerability reporting for this repository when available. If it is unavailable, contact the repository owner privately through the contact method on their GitHub profile.

Include affected versions, reproduction steps, impact, and any suggested mitigation. Do not include real user prompts, source code, credentials, session logs, or local access tokens unless they are strictly necessary and have been redacted.

## Security boundaries

Agent Live is local-first. Its standalone viewer binds to `127.0.0.1` and URL tokens are local access credentials. Do not share authenticated viewer URLs. Adapters must use documented host extension APIs and must not inspect private host storage by default.

Agent Live cleans up resources it creates. An Adapter must release its own subscriptions, timers and child processes, and must never terminate a host process it does not own.

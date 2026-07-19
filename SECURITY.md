# Security Policy

## Supported versions

Security fixes are applied to the latest published minor release. Older releases may not receive patches.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow on the repository's **Security → Advisories → Report a vulnerability** page. Include:

- the affected version and runtime;
- a minimal reproduction or request/response trace with all secrets removed;
- the expected and observed impact;
- any suggested mitigation.

You should receive an acknowledgement within seven days. A remediation timeline depends on severity and reproducibility. Please allow a reasonable disclosure window before publishing details.

## Security boundaries

LLM Conductor sends caller-provided messages to the configured provider endpoint. It does not manage secret storage, user authentication, authorization, content moderation, prompt-injection defenses, data-retention policy, or tool sandboxing.

Applications are responsible for protecting API keys, validating and authorizing tool calls, redacting logs, reviewing provider data policies, and restricting custom `baseURL` values when they can be influenced by untrusted users.

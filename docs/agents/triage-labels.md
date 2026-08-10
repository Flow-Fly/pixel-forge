# Triage Labels

The engineering skills use five canonical triage roles. This file maps those roles to the label strings used in this repository.

| Label in mattpocock/skills | Label in our tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | A maintainer needs to evaluate the issue |
| `needs-info` | `needs-info` | Waiting for information from the reporter |
| `ready-for-agent` | `ready-for-agent` | Canonical implementation permission for a bounded, unblocked task under an approved delivery slice; the stop-label conditions in `AGENTS.md` still apply |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill mentions a canonical role, use the corresponding tracker label from this table.

This mapping does not replace Pixel Forge’s delivery workflow. A parent, capability, or blocked task does not become implementable merely because it carries `ready-for-agent`; the complete permission contract in `AGENTS.md` remains authoritative.

# Triage Labels

The engineering skills use five canonical triage roles. This file maps those roles to the label strings used in this repository.

| Label in mattpocock/skills | Label in our tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | A maintainer needs to evaluate the issue |
| `needs-info` | `needs-info` | Waiting for information from the reporter |
| `ready-for-agent` | `ready-for-agent` | Canonical agent-ready role; implementation additionally requires the risk and stop-label conditions in `AGENTS.md` |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill mentions a canonical role, use the corresponding tracker label from this table.

This mapping does not replace Pixel Forge’s delivery workflow. In particular, `ready-for-agent` alone does not authorize implementation; the complete permission contract in `AGENTS.md` remains authoritative.

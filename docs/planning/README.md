# Planning

Product planning for agents-platform, produced by a 10-agent design meeting and maintained as the work progresses.

| Doc | What's in it |
|-----|--------------|
| [ROADMAP.md](ROADMAP.md) | North star, 9 themes, 5 phases, 7 flagship features, the cost model, prioritization |
| [TODO.md](TODO.md) | Actionable, effort-tagged backlog grouped by phase |
| [IDEAS.md](IDEAS.md) | The full idea bank by theme + a per-persona appendix |
| [SETTINGS-AND-FLEXIBILITY.md](SETTINGS-AND-FLEXIBILITY.md) | The configurability contract - 8 settings pillars, precedence model, master settings map |
| [PRIORITIZATION-AND-RISKS.md](PRIORITIZATION-AND-RISKS.md) | Flagship vs. table-stakes vs. noise, build-first sequence, "do not build yet" |
| [MEETING-NOTES.md](MEETING-NOTES.md) | The meeting narrative - each persona's flagship pick and hot take |

## Status

The roadmap is the source of truth for sequencing. Recent progress:

- ✅ **Opt-in Anthropic API execution backend** (P3 / T9) - shipped & live (v1.0.28)
- ✅ **README disclaimer** on the SSH/subscription cost design
- ✅ **UI redesign** - flat dark + amber + teal, status badges (partially delivers T4's "Appearance" pillar)
- ⏳ **P1 - Make It Visible & Honest** (Live Run Theater + SSH telemetry) - in progress

> **Cost note:** the default subscription backend has static/zero marginal cost, so the
> observability work is about *usage visibility* and a *"savings vs API"* story, not spend
> control. Budgets matter only for opt-in `api`-backend runs. See ROADMAP → "Cost model".

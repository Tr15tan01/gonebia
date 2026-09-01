# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for the Gonebia project. Session Replay and Error Tracking were already enabled; Support (Conversations) was enabled in this setup. Health, Error Tracking, and Support signal sources are enabled, and two Replay Vision monitors now send corroborated, visible-product-breakage findings to the Self-driving inbox.

Fresh scout configurations are picked up within about 30 minutes. Findings will begin appearing in the [Self-driving inbox](https://us.posthog.com/project/588133/inbox) as data arrives.

## AI data processing

Approved by the wizard's organization-level gate before this setup ran.

## GitHub

Connected before this setup via the PostHog GitHub App. GitHub Issues was not selected as a Self-driving responder in this run.

## Products enabled

| Product | Result | SDK/init check |
|---|---|---|
| Session Replay | Already enabled | Web application uses `posthog-js`; client initialization does not disable recording. |
| Error Tracking | Already enabled | Web application enables `capture_exceptions: true`; no disabling override was found. |
| Support (Conversations) | Enabled | An inbound Support channel is still required before tickets can arrive. |

## Signal sources

| Signal source | Action | Notes |
|---|---|---|
| `signals_scout` / `cross_source_issue` | Deliberately not created | Scout findings are delivered by default; this row is only needed to opt out. |
| `health_checks` / `health_issue` | Enabled | Source config `01a05ea6-b286-782f-89ec-c3d7147753b7`. |
| `error_tracking` / `issue_created` | Enabled | Source config `01a05ea6-b118-7db5-a7a4-c646f67dc402`. |
| `error_tracking` / `issue_reopened` | Enabled | Source config `01a05ea6-b1a7-7980-b183-7d075f66379c`. |
| `error_tracking` / `issue_spiking` | Enabled | Source config `01a05ea6-b1a7-7674-aa1e-bb47be202639`. |
| `conversations` / `ticket` | Enabled | Source config `01a05ea6-b147-7f65-b233-09275fa48b43`; idle until Support has an inbound channel. |
| `session_replay` / `session_analysis_cluster` | Skipped | Retired source; Replay Vision scanners provide session-replay coverage. |
| `replay_vision` | Deliberately not created | Each scanner's `emits_signals: true` is its own source authorization. |

## Connected tools

No external connected-tool responders were selected. GitHub Issues, Linear, Jira, Sentry, and Zendesk remain **not used** for Self-driving; no warehouse sources or dormant responders were created.

## Scout troop

**Run budget:** 100 runs/day maximum; 0 used today and 100 remaining when checked. Announcement: “Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more.”

| Active scout | What it watches |
|---|---|
| `general` | Cross-product correlations and surfaces without a dedicated active specialist. |
| `product-analytics` | Core product-flow conversion, retention, lifecycle, stickiness, and path regressions. |
| `revenue-analytics` | Billing and revenue-data health; selected because the app integrates Paddle. |
| `web-analytics` | Public acquisition traffic, attribution, and landing-page health. |

**Paused scouts (23):**

| Scout | Reason paused |
|---|---|
| `ai-observability` | No confirmed PostHog LLM-trace usage. |
| `anomaly-detection` | No project-profile evidence of heavily viewed saved insights or dashboards. |
| `apm` | No distributed-tracing surface found. |
| `conversations` | Support tickets are covered directly by the enabled native Support source. |
| `csp-violations` | No CSP reporting configuration found. |
| `customer-analytics` | No B2B account/group analytics surface found. |
| `data-pipelines` | No CDP destination, batch-export, or Hog-flow surface found. |
| `data-warehouse` | No connected warehouse source was selected or found. |
| `error-tracking` | Covered by the three enabled native Error Tracking sources. |
| `experiments` | No active experiment evidence was available. |
| `feature-flags` | No active feature-flag usage evidence was available. |
| `health-checks` | Native health-check source delivers this surface directly. |
| `inbox-validation` | Fresh setup has no resolved Self-driving reports to remeasure yet. |
| `insight-alerts` | No configured insight-alert evidence was available. |
| `logs` | No PostHog Logs usage evidence was available. |
| `mcp-tool-calls` | No project-specific MCP tool-call monitoring need was established. |
| `observability-gaps` | Kept selective because the project profile was unavailable; re-enable when event coverage grows. |
| `replay-vision` | No pre-existing Replay Vision observation history; the two new monitors are the sensor layer. |
| `session-replay` | Covered by the Replay Vision monitors below. |
| `skills-store` | No actively maintained project skills-store surface was identified. |
| `surveys` | Surveys are not enabled and no survey usage was found. |
| `tasks` | No PostHog Tasks usage evidence was available. |
| `web-vitals` | No web-vitals monitoring usage evidence was available. |

## Custom scouts

No custom scouts were created: the proposal was cancelled. Two candidates were offered within the remaining six-scout capacity:

- **Memory capture quality** — would watch the saved-memory/extraction flow implemented in `src/app/api/capture/route.ts` and `src/components/capture.tsx`; it would distinguish sustained capture loss or a material correction-rate rise from normal variation.
- **Agent-run availability** — would watch successful assistant runs implemented in `src/app/api/agents/route.ts`; it would distinguish a sustained fall in completions after usage begins from ordinary quiet usage.

Surfaces ruled out: billing is covered by the active revenue scout; generic web/product behavior is covered by active web and product-analytics scouts; Error Tracking and replay are covered by their dedicated routes; price watches and reminder jobs lack dedicated PostHog outcome telemetry for a reliable discriminator. If a future custom scout becomes noisy, set its config’s `emit` field to `false` in PostHog to leave it running in dry-run mode.

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes high-confidence observations to the inbox. These are the only items in this setup that spend Replay Vision quota. Each finding enters at half weight and requires independent corroboration before promotion into a Self-driving report.

| Monitor | Status | Scope and purpose | Sampling | Estimate |
|---|---|---|---:|---:|
| **Gonebia memory capture breakage** (`01a05eab-c329-7686-8eb2-cd5670cc7388`) | Created | Dashboard URL sessions (`/dashboard`), the key completion flow where someone saves a memory and expects interpretation, reminders, tasks, and updated dashboard content. Looks for visible capture, extraction, control, or refresh breakage. | 50% | 0 observations / 0 credits monthly from the measured 7-day window. |
| **Gonebia interaction frustration** (`01a05eab-c2c9-7675-b745-09989c2b1f3a`) | Created | Sessions containing `$rageclick` only; watches visible struggle around remembering, voice input, corrections, goals, and finding saved items. It has no URL filter, keeping it distinct from the dashboard breakage monitor. | 100% | 0 observations / 0 credits monthly from the measured 7-day window. |

The organization had 2,500 Replay Vision credits remaining when checked, with 0 used and no projected spend. No eligible sessions matched either monitor’s estimate window yet; both monitors are armed and begin observing as eligible recordings arrive.

## Repository files

| File | Change |
|---|---|
| `posthog-self-driving-report.md` | Created this setup report. |
| `.claude/skills/replay-vision-scanners-core/` | Installed shared scanner mechanics skill. |
| `.claude/skills/replay-vision-scanner-broken-experiences/` | Installed breakage-monitor brief skill. |
| `.claude/skills/replay-vision-scanner-user-frustration/` | Installed frustration-monitor brief skill. |

No application source files were modified.

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so enabled Support tickets can reach Self-driving.
- [ ] Reauthorize the MCP connection with `property_definition:read` if server-side event-schema inspection is needed; the current connection did not grant that scope.
- [ ] Revisit the paused specialist scouts when related products become active (for example, LLM traces, feature flags, experiments, Logs, surveys, or web vitals).

## What happens next

The scout coordinator picks up fresh configurations within about 30 minutes. Scouts draw from the verified 100-runs-per-day project budget; reports cluster related findings in the [Self-driving inbox](https://us.posthog.com/project/588133/inbox), where actionable items can become coding tasks.

# Recommand Core

Core is the domain-independent package every application on the Recommand framework
builds on. It knows nothing about invoices, Peppol or any other domain. It holds the
general concepts that every such application needs, so that a domain package only
adds its own tables, routes and pages.

## What core provides

- **Users and authentication.** Sign-up with email confirmation, login, password
  reset, JWT sessions, API keys, and an OAuth 2 token endpoint for client-signed
  JWTs. The public pages (login, signup, reset, confirmation) and the account page
  live here.
- **Multi-tenancy through teams.** Every domain record belongs to a team. Core owns
  teams, memberships, invitations, the team switcher and the team settings pages.
  Route middleware resolves the team from the path and checks that the caller may act
  on it, whether the caller is a user session, an API key, an installation token or
  a service principal.
- **Permissions.** A registry of permission ids, per-user and per-principal grants,
  and middleware that enforces them per route. Domain packages register their own
  permission ids into the same registry.
- **Audit log.** `audit_events` records who did what, with the outcome (allowed,
  denied, failed) and hashed identifiers. Routes write to it through `audit(c, ...)`
  in `lib/audit.ts`.
- **Event log and rules.** A per-team, append-only event log that domain packages
  publish to, a tracker that consumers follow it with, and a rule engine that runs
  webhooks and emails when events match. See below.
- **Installations.** Team-scoped identities for consumers on other deployments, with
  revocable tokens and a permission grant.
- **Onboarding.** A checklist of steps a team completes, which packages extend.
- **UI foundation.** The dashboard shell (sidebar, navigation, user menu, page
  template), the component library on Radix and Tailwind, data tables, forms, the
  menu registry that packages add their pages to, and the user and team stores.
- **Translations.** A CSV per language per package, merged at runtime into one map,
  with a `useTranslation` hook and server-side helpers.
- **Email.** React Email templates with a Postmark sender.
- **API documentation.** Helpers that describe routes for the OpenAPI spec.

## Layout

```
api/          route handlers, mounted by the framework under /api/core
app/          dashboard and public pages, picked up by the file-based router
components/   UI components, including the ui/ primitives
data/         database access, one module per concept
db/           schema and migrations
emails/       React Email templates
hooks/        React hooks
lib/          middleware, auth, audit, permissions, translations, stores
translations/ de, fr, nl CSV files
```

## Event log

Packages publish events to a per-team, append-only log. Consumers follow it with a
tracker. The tables split by what they describe.

| Group | Tables | Describes |
|---|---|---|
| Log | `events`, `installations`, `installation_tokens`, `principal_permissions` | the log and who may read it |
| Consumer progress | `event_cursors`, `event_projection_bootstraps`, `event_dead_letters` | how far one consumer has come |

The log group is written by the deployment that publishes events. The progress
group is written by whoever keeps a consumer's bookkeeping: an in-repo consumer
writes all three in its own database, co-hosted or standalone, and an external
consumer keeps only its cursor, at the source, through the routes described below.

The data layer follows the same split: `data/events.ts`, `data/installations.ts`
and `data/principal-permissions.ts` are the source side; `data/event-consumer/`
holds the cursor, bootstrap and dead-letter bookkeeping the tracker writes.

## In-repo consumers

A package in this deployment calls `startEventSourceTracker` from
`data/event-sources.ts` and registers handlers with `registerEventHandler` from
`data/event-handlers.ts`. The tracker runs when `RUN_CRON=true`.
Without `EVENT_SOURCE_URL` and `EVENT_SOURCE_TOKEN` it reads the local log; with
both it pulls one team, the token's team, from the remote source over HTTP.

A local tracker reads the newest event id every 500 ms and pulls when it has
changed, so new events arrive within about half a second. Because ids are
assigned before commit, a transaction that commits late can stay below the value
already seen; a full pull every 5 seconds catches those events and retries
failed ones. A remote tracker pulls every 5 seconds.

In both modes the tracker keeps its position in `event_cursors` in its own
database, one cursor per team and consumer, shared by every handler of that
consumer. It never uses the source's cursor routes.

### Bootstrap

A projection only sees events published after it exists. A handler registration
may declare `bootstrap: { key, run }`. Before the tracker follows a team's log it
runs every missing bootstrap for that team: read the head seq (local: the events
table; remote: `GET /api/core/events/head`), call `run` to take a current-state
snapshot through `source.fetch`, then record the head per team, consumer and
projection key in `event_projection_bootstraps`. Events at or below that head are
skipped for handlers that share the key; later events replay on top, so handlers
must be idempotent upserts.

The head is read before the snapshot, so a change in between is in the snapshot or
has an event above the head, or both. A consumer with bootstraps must pass
`listTeams` to `startEventSourceTracker`; the tracker never snapshots every team.
When every handler of a consumer has a recorded snapshot for a team, the cursor
starts at the lowest recorded head instead of reading history only to skip it. A
bootstrap never resets the cursor. To rebuild a projection, delete its rows and its
bootstrap row; the next tick takes a fresh snapshot.

The record per projection is what lets a consumer add a projection later, or
rebuild one, without replaying the log for its siblings. One cursor cannot express
that two projections have seen different parts of the same log.

## External consumers

A consumer outside this deployment authenticates with an installation token and
needs no database of its own. The source keeps its position, keyed by the
installation id. All routes are installation-only and take the team from the token.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/core/events?after=&limit=&streamId=` | events after a position |
| GET | `/api/core/events/head` | the log's current position |
| GET | `/api/core/event-cursors` | the consumer's last handled seq |
| PUT | `/api/core/event-cursors` `{ lastSeq }` | store the last handled seq |

The loop is:

1. `GET /event-cursors` for the last handled seq.
2. `GET /events?after=<lastSeq>` and handle each event in order. A `streamId`
   filter narrows the events returned; the single cursor per team still moves past
   the events of other streams.
3. `PUT /event-cursors { lastSeq }` after each event, or after each page if the
   handlers are idempotent.

To start from current state instead of from the beginning of the log, read
`GET /events/head` first, take a snapshot through the normal REST endpoints, then
`PUT /event-cursors { lastSeq: head }`. This is the bootstrap mechanism collapsed
into one cursor. It is enough when the consumer has one projection or takes all its
snapshots at once. It cannot add a second projection later without replaying the log
for the first one, and it cannot rebuild one projection without touching the others.

Retries and dead letters are the external consumer's own concern. The source has no
place to record another party's handler errors.

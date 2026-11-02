# Notifications

Status: the first version is implemented (see [Phasing](#phasing)): kinds,
`notify` and `withdrawNotifications`, the email channel, action links, channel
choice per user and the delivery record. Digests, team defaults and chat
channels are not. [Implementation notes](#implementation-notes-first-version)
records the choices this document left open.

This document describes how a package tells a user that something needs their
attention, and how the user can act on it from the message. Examples are an
approval request, a document that needs review, or a reminder that a task is
still open.

## Goals

- Packages send notifications without knowing the channel.
- Each user chooses their channels: email first, chat tools such as Slack later.
- A user can act from the message when that is safe, for example approve or
  reject.
- New channels need no change in the packages that send notifications.
- Every notification and every delivery attempt is recorded.

## Non-goals

- Marketing or bulk email.
- Integrations that a team configures itself. These use event rules, see
  [Relation to event rules](#relation-to-event-rules).

## Terms

| Term                  | What it is                                                   | Registered by       |
| --------------------- | ------------------------------------------------------------ | ------------------- |
| **Notification kind** | A type of message: its content, its actions and its defaults | A package           |
| **Channel**           | A way to deliver a message, for example email                | Core or a package   |
| **Notification**      | One message for one user about one subject                   | Created at run time |
| **Action**            | An outcome the user can choose from the message              | Part of a kind      |

## Notification kinds

A kind is one reason to send a user a message. A new task, a reminder about
it and an escalation of it are three kinds, not one kind with three variants. A user can then choose a channel for
each, or turn one off, for example reminders.

A package registers a kind in code, like an event type:

```ts
registerNotificationKind({
  kind: "platform.approval.requested",
  ui: { label: "Approval requests", group: "Approvals" },
  defaultChannels: ["email"],
  render: async ({ t, user, team }, notification) => {
    // Return channel-neutral content in the user's language.
    return { eyebrow, title, subject, summary, fields, note, link, explanation };
  },
  actions: [
    { action: "approve", label: "Approve", reason: "optional" },
    { action: "reject", label: "Reject", reason: "required" },
  ],
  onAction: async ({ notification, action, userId, channel, reason }) => {
    // Apply the choice in the package. Check again that the user may do it.
    return { status: "done" }; // or "alreadyHandled" or "denied"
  },
});
```

- **Content is channel-neutral.** `render` returns a title, a summary, a list
  of label and value fields, optional attachments (for example a PDF preview)
  and a link into the app. Each channel turns this into its own format. A kind
  can add a template for one channel when the generic layout is not enough.
- **Language.** `render` gets a translator for the user's language.
- **Actions are optional.** A kind without actions only informs and links to
  the app.
- **The package decides.** `onAction` does the work, for example it closes a
  task through the package's own API. Core does not know what an action means.

## Sending

```ts
await notify({
  teamId,
  userIds,
  kind: "platform.approval.requested",
  subject: { type: "invoice", id },
  key: obligationId, // groups all messages about the same thing
  data, // input for render and onAction
  actions: { enabled: true, requireLogin: false },
  idempotencyKey,
  tx, // optional: write in the caller's transaction
});

await withdrawNotifications({ teamId, key: obligationId, tx });
```

- **`key`** groups the messages about one thing, across kinds. A reminder uses
  the same key as the request, so a chat channel can reply to the first message
  instead of starting a new one.
- **`withdrawNotifications`** says that the thing no longer needs the user, for
  example because someone else handled it. Pending deliveries stop, digests drop
  it, and its action links stop working. It sends no message. A package that
  wants to tell the user sends a separate kind for that, which the user can
  turn on or off. The platform sends no such message: for approvals and other
  obligations, it only withdraws silently, because the extra messages are
  noise in the users' inboxes.
- **`requireLogin`** is set by the sender. Core does not know amounts or risk,
  so the package decides when acting from a message needs a login.
- **Idempotency.** The same `idempotencyKey` never sends a second message.

## Channels

```ts
registerNotificationChannel({
  channel: "email",
  ui: { label: "Email" },
  supportsActions: true,
  send: async (delivery) => {
    // Turn delivery.content and delivery.actions (with their links) into this
    // channel's format and deliver it to delivery.user. Throw on failure.
  },
});
```

- Core ships the email channel, built on the existing email templates.
- A chat channel, for example Slack, has `needsAccountLink`. The user links
  their account once. The channel never acts for an external account that is
  not linked to a user.
- A channel that can update a sent message, for example to show "Approved by
  Anna", gets the withdrawal and the action result.

## Preferences

- **Per user and kind:** the channels, and immediate or daily digest.
- **Per team:** the allowed channels and the defaults for new users.
- A kind's `defaultChannels` apply when neither the user nor the team chose.
  An empty list means the kind is off until the user turns it on.
- The preferences screen shows kinds per `ui.group`, for example all approval
  kinds together.

The digest runs once a day at the user's chosen hour. It contains the open
notifications of digest kinds that are not withdrawn.

## Actions from a message

- **A link does not change state.** Mail scanners open links. A link opens a
  short confirmation page. The action happens on a POST from that page. When
  the action requires a reason, the page asks for it.
- **A link is a scoped token.** It is signed, bound to one notification and one
  user, single use, and expires. It stops working when the notification is
  withdrawn.
- **Login when the sender asks for it.** With `requireLogin`, the link leads to
  the normal login before the confirmation page.
- **Chat buttons.** The channel verifies the request of the chat tool and maps
  the external account to the linked user before it calls `onAction`.
- **The package checks again.** `onAction` checks that the user may still act.
  When the thing was handled already, the page or chat message says so.

Every action records the user, the channel and the time, and is passed to the
package. The package records it in its own history.

## Delivery

Deliveries use the same queue and retry mechanism as event rule actions. Each
attempt is recorded with its channel, status and error, so that it is known if
and when a user was notified. No route or screen shows this record yet.

## Relation to event rules

| Need                                          | Use           |
| --------------------------------------------- | ------------- |
| Tell the user who must act, in their channel  | Notifications |
| Send events to a system that the team chooses | Event rules   |

Event rules are not used for notifications:

- A rule's email action sends to a fixed list of addresses. A notification goes
  to different users each time.
- Action links are security tokens for one user, made when the message is sent.
  A generic rule action must not make them.
- Rules are optional team configuration. A disabled rule must not stop work
  that waits for a person.

## Data model (sketch)

| Table                           | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `notifications`                 | One row per notification: team, user, kind, subject, key, status |
| `notification_deliveries`       | Delivery attempts per channel, with status and retries           |
| `notification_preferences`      | Channels and digest choice per user and kind; team defaults      |
| `notification_channel_accounts` | Links between users and external accounts, per channel           |
| `notification_action_tokens`    | Action tokens: notification, user, expiry, used at               |

## Phasing

1. **First version.** Kinds, `notify` and `withdrawNotifications`, the email
   channel, action links, channel choice per user, the delivery record.
2. **Second version.** Digests, team defaults and allowed channels, a chat
   channel with account links.
3. **Later, when needed.** More chat tools, an in-app inbox, mobile push.

## Implementation notes (first version)

These notes record what the first version built and the choices this document
left open. The sections above stay the design, including the second version.

### Where the code is

| Part                                     | File                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| Tables                                   | `db/notification-schema.ts`                            |
| Types, registry, channel choice, tokens, `usersWhoDidNotAct` | `lib/notifications/` |
| Email channel and its layout             | `lib/notifications/email-channel.ts`, `emails/notification-email.tsx` |
| `notify`, `withdrawNotifications`        | `data/notifications/notify.ts`                         |
| Delivery worker and its cron job         | `data/notifications/deliveries.ts`, `cron.ts`          |
| Action links                             | `data/notifications/actions.ts`                        |
| Preferences                              | `data/notifications/preferences.ts`                    |
| What other packages import               | `data/notifications/index.ts` (`@core/data/notifications`) |
| API routes                               | `api/notifications/`                                   |
| Confirmation page                        | `app/(public)/notification-action/[token]/`            |
| Preferences screen                       | `components/notifications/notification-preferences-card.tsx`, in the account settings |

### Data model

Four tables: `notifications`, `notification_deliveries`,
`notification_preferences` and `notification_action_tokens`. There is no
`notification_channel_accounts` table, no team defaults and no digest choice:
they belong to the second version. Notifications cascade on the team and the
user.

### Registration

- Kinds and channels are registered in code. A kind with actions must have an
  `onAction`.
- Core's email channel is registered when the registry loads, so it always
  exists.
- `ui.label`, `ui.group`, `ui.description` and the action labels are English.
  Core translates them with the key form of `t`, so a package puts these
  strings in its own translation files.

### Sending

- `notify` only writes rows: one notification per user and one pending
  delivery per channel. It never calls a channel. It takes an optional `tx`,
  because the platform calls it inside a workflow command.
- Users who are not members of the team are left out.
- Channel choice: the user's choice for the kind, else the kind's
  `defaultChannels`, limited to registered channels. A user with no channel
  gets no notification row.
- Idempotency is unique per team, idempotency key and user. A repeated key
  never notifies a user twice. A later call with the same key can still notify
  users the first call did not include.
- Action links are on only when `actions.enabled` is true and the kind has
  actions. `requireLogin` defaults to true.
- `withdrawNotifications` marks the notifications withdrawn, marks their
  pending and failed deliveries `skipped`, and returns the withdrawn
  notifications (ID, user, kind, `acted`). It takes an optional `userIds` and
  `tx`. A delivery that is being sent at that moment can still go out, but its
  link no longer works.
- A notification stays active after the user acted from its link, so a
  withdrawal also withdraws it. `acted` is true when the user used a link of
  the notification, also while `onAction` still runs (a package that closes
  the task in `onAction` and withdraws in the same call gets `true` for the
  acting user). The result has one row per notification, and one key can carry
  several kinds (a request, a reminder, an escalation): a user who acted from
  the reminder has a row with `acted: true` and a row with `acted: false`. A
  package that tells users that the task is no longer needed (platform does
  not: it withdraws silently) sends that only
  to the users for whom no row has `acted: true`, each once.
  `usersWhoDidNotAct(withdrawn)` returns them. Core does not know who acted in
  the app, so the package also leaves out the user who closed the task there.

### Content

`render` returns `eyebrow`, `title`, `subject` (the email subject; defaults to
the title), `summary`, `fields` (label, one or more lines, an optional `strong`
or `mono` style), `note` (title and text), `link` and `explanation` (why the
user gets it). The first version has no attachments, so no PDF preview. There
are no templates per kind: every kind uses the one email layout. A deployment
can still override that layout with its own `notification-email` template,
through the existing email template override. The action buttons have the
same width and sit side by side when they fit; on a phone each is on its own
row. This uses no media query, because not every mail app supports one.

`render` gets the user's translator (`users.language`), the user (ID and email)
and the team (ID and name). It runs when a delivery is sent and when the
confirmation page opens.

### Delivery

- A cron job (`RUN_CRON=true`, every 10 seconds) takes due deliveries with a
  five minute lease, as the event rule deliveries do. The backoff is the same:
  after a failed attempt the next one comes 30 seconds, 1, 5 or 30 minutes, or
  2 hours later. The sixth failed attempt sets `giving_up`.
- A worker that stops during a send leaves the delivery `in_flight`. When its
  lease runs out, the next run records that as a failed attempt ("The delivery
  did not finish"), so the backoff and `giving_up` apply to it too.
- There is one delivery row per notification and channel. Its `attempt_log`
  records every attempt with its time, result and error.
- A delivery is `skipped` when the notification was withdrawn or the user is
  no longer a member of the team.
- The email channel sends through `setNotificationEmailSender`, which tests
  replace with a fake. By default it uses `sendEmail` (Postmark).

### Action links

- **Format.** A token is `<random id>.<signature>`: 24 random bytes, and an
  HMAC-SHA256 of the id with `JWT_SECRET`. The database stores only the
  SHA-256 hash of the id.
- **One token per notification.** A notification belongs to one user, so this
  is one token per notification and user. The token is made when the message
  is sent, because only the message carries it. A resend after a failed
  attempt replaces an unused token, which disables the link in the earlier
  message. The token row records the channel of the message.
- **Expiry and single use.** A token works for 72 hours. Any action uses it,
  whatever `onAction` answers. When `onAction` throws, the token works again.
  Withdrawal stops it.
- **Link.** `/notification-action/<token>?action=<action>` opens a public page.
  The page reads the link through `GET /api/core/notification-actions/{token}`,
  which changes nothing. The page shows the content, asks for a reason when the
  action needs one, and lets the user choose another action ("Reject
  instead"). It acts through `POST` on the same path.
- **Login.** With `requireLogin`, the GET returns no content and the page sends
  the user to the login page, which returns to the link afterwards
  (`/login?redirect=…`, only paths on the same site). The POST then requires a
  browser session of the token's user; an API key never counts. Both routes
  read the session with the middleware `optionalAuth({ cookieOnly: true })`
  (`lib/auth-middleware.ts`), which lets a request without a session through.
  Without `requireLogin`, the token alone is enough.
- **Checks in core.** Before it calls `onAction`, core checks the signature, the
  token, its expiry, the withdrawal, the login when required, and that the user
  is still a member of the team. `onAction` must still check that the user may
  act.
- **Record.** Core records the action, the channel, the time and the result on
  the notification. It does not store the reason: the package records it in its
  own history.
- `onAction` gets one object (`notification`, `action`, `userId`, `channel`,
  `reason`) and no separate context.

### API

| Route                                               | Who                                    |
| --------------------------------------------------- | -------------------------------------- |
| `GET /api/core/notification-actions/{token}`        | Anyone with the link (read only)       |
| `POST /api/core/notification-actions/{token}`       | Anyone with the link, or the signed-in token user with `requireLogin` |
| `GET /api/core/account/notification-preferences`    | The signed-in user                     |
| `PUT /api/core/account/notification-preferences/{kind}` | The signed-in user                 |

Like the other core routes, the preference routes are in
`openapi.internal.json`, not in the published document. The two action-link
routes are in neither: only the confirmation page calls them.

### Preferences

Preferences are per user and kind, the same in every team. The account
settings show a card with the kinds per group and a switch per channel. The
card is hidden while no kind is registered. The email footer links to the
account settings.

### Not in the first version

Digests, team defaults and allowed channels, chat channels with account links,
attachments, updating a sent message after an action, and an in-app inbox.
Lists of notifications with their delivery record (for the user, and for a
team manager) were removed until a screen needs them.

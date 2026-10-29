# Notifications

Status: design draft. Nothing in this document is implemented yet.

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
it, an escalation of it and the message that it is no longer needed are four
kinds, not one kind with four variants. A user can then choose a channel for
each, or turn one off, for example reminders.

A package registers a kind in code, like an event type:

```ts
registerNotificationKind({
  kind: "platform.approval.requested",
  ui: { label: "Approval requests", group: "Approvals" },
  defaultChannels: ["email"],
  digest: true, // can be bundled in a daily digest
  render: async (ctx, notification) => {
    // Return channel-neutral content in the user's language.
    return { title, summary, fields, attachments, link };
  },
  actions: [
    { action: "approve", label: "Approve", reason: "optional" },
    { action: "reject", label: "Reject", reason: "required" },
  ],
  onAction: async (ctx, { notification, action, userId, channel, reason }) => {
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
});

await withdrawNotifications({ teamId, key: obligationId });
```

- **`key`** groups the messages about one thing, across kinds. A reminder uses
  the same key as the request, so a chat channel can reply to the first message
  instead of starting a new one.
- **`withdrawNotifications`** says that the thing no longer needs the user, for
  example because someone else handled it. Pending deliveries stop, digests drop
  it, and its action links stop working. It sends no message. A package that
  wants to tell the user sends a separate kind for that, for example
  `platform.approval.withdrawn`, which the user can turn on or off.
- **`requireLogin`** is set by the sender. Core does not know amounts or risk,
  so the package decides when acting from a message needs a login.
- **Idempotency.** The same `idempotencyKey` never sends a second message.

## Channels

```ts
registerNotificationChannel({
  channel: "email",
  supportsActions: true,
  needsAccountLink: false, // a chat channel links a user to an external account
  send: async (ctx, delivery) => {
    // Render the content for this channel and deliver it to one user.
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
attempt is recorded with its channel, status and error. A user and a team admin
can see if and when a user was notified.

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

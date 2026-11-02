import { describe, expect, test } from "bun:test";
import { render } from "@react-email/render";
import { createActionToken, verifyActionToken } from "../lib/notifications/action-tokens";
import { chooseChannels } from "../lib/notifications/channel-choice";
import { usersWhoDidNotAct } from "../lib/notifications/withdrawn";
import { NotificationEmail } from "../emails/notification-email";

process.env.JWT_SECRET = "notification-unit-tests-only";

describe("chooseChannels", () => {
  const registered = ["email", "slack"];

  test("the user's choice wins over the kind's defaults", () => {
    expect(chooseChannels(["slack"], ["email"], registered)).toEqual(["slack"]);
  });

  test("an empty choice turns the kind off", () => {
    expect(chooseChannels([], ["email"], registered)).toEqual([]);
  });

  test("without a choice the defaults apply", () => {
    expect(chooseChannels(undefined, ["email"], registered)).toEqual(["email"]);
    expect(chooseChannels(null, [], registered)).toEqual([]);
  });

  test("channels that are not registered are left out, and none is used twice", () => {
    expect(chooseChannels(["email", "sms", "email"], [], registered)).toEqual(["email"]);
  });
});

describe("usersWhoDidNotAct", () => {
  test("a user who acted from one kind under the key is left out, the others appear once", () => {
    expect(
      usersWhoDidNotAct([
        { userId: "usr_anna", acted: false },
        { userId: "usr_anna", acted: true },
        { userId: "usr_bert", acted: false },
        { userId: "usr_bert", acted: false },
      ])
    ).toEqual(["usr_bert"]);
  });

  test("no rows give no users", () => {
    expect(usersWhoDidNotAct([])).toEqual([]);
  });
});

describe("action tokens", () => {
  test("a token verifies to the hash the database stores", () => {
    const { token, hash } = createActionToken();
    expect(verifyActionToken(token)).toBe(hash);
    expect(token).not.toContain(hash);
  });

  test("every token is different", () => {
    expect(createActionToken().token).not.toBe(createActionToken().token);
  });

  test("a changed or malformed token is refused", () => {
    const { token } = createActionToken();
    const [id, signature] = token.split(".");
    expect(verifyActionToken(`${id}x.${signature}`)).toBeNull();
    expect(verifyActionToken(`${id}.${signature}x`)).toBeNull();
    expect(verifyActionToken(id!)).toBeNull();
    expect(verifyActionToken(`${token}.more`)).toBeNull();
    expect(verifyActionToken("")).toBeNull();
  });

  test("a token signed with another secret is refused", () => {
    const { token } = createActionToken();
    process.env.JWT_SECRET = "another-secret";
    try {
      expect(verifyActionToken(token)).toBeNull();
    } finally {
      process.env.JWT_SECRET = "notification-unit-tests-only";
    }
  });
});

describe("notification email", () => {
  const content = {
    eyebrow: "Approval needed",
    title: "Your sign-off for Staalbouw Lemmens",
    summary: "Please approve this invoice.",
    fields: [
      { label: "Due", value: "11 Nov 2026" },
      { label: "Lines", value: ["Steel beams · 14.760,00", "Cutting to size · 520,00"] },
    ],
    note: { title: "Already approved by Sofie", text: "Price agreed." },
    explanation: "You receive this email because the workflow asks you to approve.",
  };

  test("shows the content, the action links and why the user gets it", async () => {
    const html = await render(
      NotificationEmail({
        content,
        actions: [
          { action: "approve", label: "Approve", reason: "optional", url: "https://app.test/notification-action/tok?action=approve" },
          { action: "reject", label: "Reject", reason: "required", url: "https://app.test/notification-action/tok?action=reject" },
        ],
        settingsUrl: "https://app.test/account",
      })
    );
    for (const text of [
      "Approval needed",
      "Your sign-off for Staalbouw Lemmens",
      "11 Nov 2026",
      "Cutting to size · 520,00",
      "Already approved by Sofie",
      "Approve",
      "Reject",
      "https://app.test/notification-action/tok?action=approve",
      "https://app.test/notification-action/tok?action=reject",
      "They work once, only for you.",
      "You receive this email because the workflow asks you to approve.",
      "https://app.test/account",
    ]) {
      expect(html).toContain(text);
    }
  });

  test("without actions it has no buttons", async () => {
    const html = await render(NotificationEmail({ content, actions: [], settingsUrl: "https://app.test/account" }));
    expect(html).not.toContain("notification-action");
    expect(html).not.toContain("only for you");
  });
});

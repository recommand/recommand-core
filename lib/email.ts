import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Attachment, ServerClient } from "postmark";
import "dotenv/config";

interface EmailOptions {
  from?: string;
  to: string;
  cc?: string;
  subject: string;
  email: ReactElement | string;
  replyTo?: string;
  attachments?: Attachment[];
  /**
   * Key-value pairs the mail service stores with the message and returns in every
   * webhook and API answer about it, which is how a later delivery or bounce report
   * is correlated with what was sent. Postmark allows short string values only.
   */
  metadata?: Record<string, string>;
}

export interface SentEmail {
  success: true;
  /** The mail service's id for the message, which its later reports carry. */
  messageId: string;
}

export async function sendEmail({
  to,
  cc,
  subject,
  email,
  replyTo,
  from,
  attachments,
  metadata,
}: EmailOptions): Promise<SentEmail> {
  if (!process.env.POSTMARK_API_KEY) {
    throw new Error("POSTMARK_API_KEY is not set");
  }

  const postmarkClient = new ServerClient(process.env.POSTMARK_API_KEY);
  const emailHtml = typeof email === "string" ? email : await render(email);

  const options = {
    From: from || process.env.EMAIL_FROM || "support@recommand.eu",
    To: to,
    Cc: cc,
    Subject: subject,
    HtmlBody: emailHtml,
    ReplyTo: replyTo,
    Attachments: attachments,
    Metadata: metadata,
  };

  try {
    const res = await postmarkClient.sendEmail(options);
    if (res.ErrorCode) {
      console.error("Error sending email:", res);
      throw new Error("Failed to send email");
    }
    return { success: true, messageId: res.MessageID };
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

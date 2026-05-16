import { getApps } from "@recommand/lib/app";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";

interface PartialEmailDefinition<TProps = any> {
  render: null | ((props: TProps) => ReactElement);
  subject: null | ((props: TProps) => string);
}

interface EmailDefinition<TProps = any> {
  render: ((props: TProps) => ReactElement);
  subject: ((props: TProps) => string);
}

/**
 * Resolves an email by checking for overrides in all packages.
 * Packages are checked in reverse alphabetical order (matching Recommand Framework app attachment order).
 *
 * @param emailName - The name of the email
 * @returns The email component and subject function
 */
export async function getEmailTemplate<TProps = any>(
  emailName: string
): Promise<EmailDefinition<TProps>> {
  const apps = await getApps();
  const reversedApps = [...apps].reverse();

  let match: PartialEmailDefinition<TProps> = {
    render: null,
    subject: null,
  };

  // Try to load from each package in priority order
  for (const app of reversedApps) {
    try {
      const emailPath = join(app.absolutePath, "emails", `${emailName}.tsx`);
      const module = await import(emailPath);

      if (module.default && !match.render) {
        match.render = ((props: TProps) => createElement(module.default, props as any));
      }

      if (module.subject && !match.subject) {
        match.subject = module.subject;
      }
    } catch {
      // File doesn't exist in this package, continue to next
      continue;
    }
  }

  if (match.render && match.subject) {
    return match as EmailDefinition<TProps>;
  }

  throw new Error(`Email not found: ${emailName}`);
}

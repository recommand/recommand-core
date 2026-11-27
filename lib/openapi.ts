/**
 * The OpenAPI tags of this package's routes, in the order a document lists them.
 * An application puts them in its document's `tags`, which describes each tag
 * where the operations only name it.
 */
export const tags: { description: string; name: string }[] = [
  {
    name: "Authentication",
    description: "Authentication endpoints.",
  },
  {
    name: "Account",
    description:
      "Endpoints for the signed-in user's own account, such as their sessions.",
  },
  {
    name: "Rules",
    description:
      "Endpoints for a team's automation rules, the event types they can react to and their deliveries.",
  },
];

/**
 * The users of withdrawn notifications who did not act from any of their
 * links, each once. One key can carry several kinds (a request, a reminder),
 * so a user who acted from one has other rows with `acted: false`.
 */
export function usersWhoDidNotAct(withdrawn: Array<{ userId: string; acted: boolean }>): string[] {
  const acted = new Set(withdrawn.filter((row) => row.acted).map((row) => row.userId));
  return [...new Set(withdrawn.map((row) => row.userId))].filter((userId) => !acted.has(userId));
}

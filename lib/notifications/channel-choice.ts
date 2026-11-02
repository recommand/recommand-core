/**
 * The channels of one notification for one user: their choice for the kind,
 * else the kind's defaults, limited to the channels that exist. No channel
 * means no notification.
 */
export function chooseChannels(
  preferred: string[] | null | undefined,
  defaultChannels: string[],
  registeredChannels: string[]
): string[] {
  const chosen = preferred ?? defaultChannels;
  return [...new Set(chosen)].filter((channel) => registeredChannels.includes(channel));
}

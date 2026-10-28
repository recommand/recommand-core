/**
 * The page to go back to after signing in, or null when `returnTo` does not name
 * a page on `origin`. Anything that would leave the site, such as `//host`,
 * `/\host` or `https://host`, is refused.
 */
export function toLocalPath(returnTo: string | null, origin: string): string | null {
  if (!returnTo) {
    return null;
  }

  try {
    const url = new URL(returnTo, origin);
    // `/.//host` resolves to the path `//host`, which navigation reads as another host
    if (url.origin !== origin || url.pathname.startsWith("//")) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

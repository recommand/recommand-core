// Native apps receive the code on a loopback address (RFC 8252, section 7.3).
// RFC 8252, section 8.3, prefers the IP literals to `localhost`, which depends on
// how the user's device resolves it. Native apps commonly register `localhost`,
// though, so it's accepted too.
const LOOPBACK_HOSTS = ["127.0.0.1", "[::1]", "localhost"];

const isLoopback = (url: URL) => url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);

/**
 * Whether a client may register `uri` as a redirect URI: an absolute `https` URI,
 * or `http` on a loopback address, without a fragment (RFC 6749, section 3.1.2).
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.1.2
 */
export const isAllowedRedirectUri = (uri: string): boolean => {
  if (!URL.canParse(uri)) {
    return false;
  }

  const url = new URL(uri);
  if (url.hash || url.username || url.password) {
    return false;
  }

  return url.protocol === "https:" || isLoopback(url);
};

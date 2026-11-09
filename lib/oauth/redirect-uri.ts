// Native apps receive the code on a loopback address (RFC 8252, section 7.3).
const LOOPBACK_HOSTS = ["127.0.0.1", "[::1]", "localhost"];

const isLoopback = (url: URL) => url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);

/** Whether `uri` is an `http` URI on a loopback address, as native apps use. */
export const isLoopbackRedirectUri = (uri: string): boolean => URL.canParse(uri) && isLoopback(new URL(uri));

/**
 * Whether a client may register `uri` as a redirect URI: an absolute `https` URI,
 * or `http` on a loopback address, without a fragment (RFC 6749, section 3.1.2).
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

/**
 * Whether `requested` is one of the client's `registered` redirect URIs. They have
 * to match exactly, except that a loopback URI may use any port, since a native
 * app picks a free one when it starts (RFC 8252, section 7.3; OAuth 2.1 in
 * draft-ietf-oauth-v2-1-17, sections 2.3.1 and 8.4.2).
 */
export const matchesRedirectUri = (requested: string, registered: string[]): boolean => {
  if (registered.includes(requested)) {
    return true;
  }

  if (!URL.canParse(requested)) {
    return false;
  }

  const url = new URL(requested);
  if (!isLoopback(url)) {
    return false;
  }

  const withoutPort = (candidate: URL) => {
    const copy = new URL(candidate);
    copy.port = "";
    return copy.href;
  };
  return registered
    .filter((uri) => URL.canParse(uri))
    .map((uri) => new URL(uri))
    .some((candidate) => isLoopback(candidate) && withoutPort(candidate) === withoutPort(url));
};

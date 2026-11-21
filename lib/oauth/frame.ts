import { createMiddleware } from "hono/factory";

/**
 * Keeps a page out of frames on other sites, which could make a user approve
 * without seeing what (clickjacking; RFC 9700, section 4.16).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options
 * @see https://www.rfc-editor.org/rfc/rfc9700#section-4.16
 */
export const forbidFraming = createMiddleware(async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "frame-ancestors 'none'");
  c.header("X-Frame-Options", "DENY");
});

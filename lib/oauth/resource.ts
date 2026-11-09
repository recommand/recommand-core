/**
 * The resource identifier of this API (RFC 8707): the audience of an access
 * token whose client named no resource.
 *
 * @see https://www.rfc-editor.org/rfc/rfc8707#section-2
 */
export const apiResource = () => `${process.env.BASE_URL}/api`;

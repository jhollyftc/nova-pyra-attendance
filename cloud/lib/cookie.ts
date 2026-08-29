/**
 * The session cookie's name, kept free of any crypto imports so that `proxy.ts`
 * can read it without pulling jose into the proxy bundle.
 */
export const COOKIE_NAME = "npa_session";

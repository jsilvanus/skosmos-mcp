// Content-Security-Policy for the HTML pages of the embedded authorization server.
// `formAction` extends `form-action 'self'`: browsers also apply form-action to the redirects a form
// submission follows, so a page whose form ends in a redirect to the OAuth client must list that client.
export function contentSecurityPolicy(formAction: string[] = []): string {
  return (
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action " +
    ["'self'", ...formAction].join(' ')
  );
}

// CSP source for a redirect URI: its origin, or its scheme for custom schemes (e.g. `cursor:`), whose origin is opaque.
export function redirectSource(uri: string): string {
  const url = new URL(uri);
  return url.origin === 'null' ? url.protocol : url.origin;
}

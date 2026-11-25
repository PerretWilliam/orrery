/**
 * Content-Security-Policy for every page. Nothing is loaded from, or sent to, another origin, and no plug-in, frame
 * or `<base>` rewrite is allowed. Inline scripts stay allowed because Next.js writes its bootstrap inline and a nonce
 * needs fully dynamic rendering, which the static shells of the app do not have; the protection against injected
 * markup is that source data and Markdown are only ever rendered as text or as a fixed set of elements.
 * `form-action` is left out on purpose: sign-in is a form post answered by a redirect to GitHub.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

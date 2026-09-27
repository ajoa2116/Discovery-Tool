/** Redact the random-token envelope even in unstructured error text. */
export const redactBrowserSecrets = (text: string) => text.replace(/\bcb[hci]_[A-Za-z0-9_-]{43}/g, '[REDACTED]');

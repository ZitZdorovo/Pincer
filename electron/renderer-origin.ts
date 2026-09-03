// HashRouter may change the fragment, but not the trusted document, query or origin.
export function isTrustedRendererUrl(actual: string, expected: string): boolean {
  try {
    const url = new URL(actual);
    url.hash = '';
    return url.href === expected;
  } catch { return false; }
}

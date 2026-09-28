/** Gateway and Windows nodes may report the same folder with different separators. */
export function sameWorkspacePath(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  const windowsPath = (value: string) => /^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value);
  const leftWindows = windowsPath(left);
  if (leftWindows !== windowsPath(right)) return false;
  const normalize = (value: string) => {
    const withoutTrailingSlash = value.replace(/[\\/]+$/, '');
    return leftWindows ? withoutTrailingSlash.replace(/\\/g, '/').toLocaleLowerCase() : withoutTrailingSlash || '/';
  };
  return normalize(left) === normalize(right);
}

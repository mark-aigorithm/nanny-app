/** Returns a trimmed URI or undefined — avoids React Native empty-string Image warnings. */
export function resolveImageUri(uri?: string | null): string | undefined {
  const value = uri?.trim();
  return value || undefined;
}

export function resolveAvatarUri(name: string, uri?: string | null): string {
  return (
    resolveImageUri(uri) ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`
  );
}

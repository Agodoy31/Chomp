export const CHANNEL_TITLE_REGEX = /^[a-zA-Z0-9 ._\-+&/'!?:,#]+$/;
export const MAX_CHANNEL_TITLE_LENGTH = 100;

export function normalizeChannelName(raw: string): string {
  return raw.trim().replace(/^#+\s*/, '');
}

export function validateChannelTitle(title: string): string | null {
  if (!title) {
    return 'Channel name is required.';
  }
  if (title.length > MAX_CHANNEL_TITLE_LENGTH) {
    return `Channel name cannot exceed ${MAX_CHANNEL_TITLE_LENGTH} characters.`;
  }
  if (!CHANNEL_TITLE_REGEX.test(title)) {
    return 'Channel name contains invalid characters or newlines.';
  }
  return null;
}
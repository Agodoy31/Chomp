export function clubChannelPath(clubId: string, channelId: string): string {
  return `/clubs/${encodeURIComponent(clubId)}/channels/${encodeURIComponent(channelId)}`;
}

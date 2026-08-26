export function normalizeTwitchUsername(input) {
  const raw = String(input ?? '').trim();

  if (!raw) {
    throw new Error('Please provide a Twitch username.');
  }

  let username = raw;

  try {
    const parsed = new URL(raw);
    const firstPathSegment = parsed.pathname
      .split('/')
      .filter(Boolean)
      .find(Boolean);

    if (firstPathSegment) {
      username = firstPathSegment;
    }
  } catch {
    // Not a URL, so treat it as a plain username.
  }

  username = username.replace(/^@+/, '').trim().toLowerCase();

  if (!/^[a-z0-9_]{3,25}$/.test(username)) {
    throw new Error(
      'Twitch usernames should be 3-25 characters using letters, numbers, or underscores.'
    );
  }

  return username;
}

export function twitchChannelUrlFor(username) {
  return `https://www.twitch.tv/${normalizeTwitchUsername(username)}`;
}

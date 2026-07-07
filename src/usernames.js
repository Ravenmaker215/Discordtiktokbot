export function normalizeTikTokUsername(input) {
  const raw = String(input ?? '').trim();

  if (!raw) {
    throw new Error('Please provide a TikTok username.');
  }

  let username = raw;

  try {
    const parsed = new URL(raw);
    const atSegment = parsed.pathname
      .split('/')
      .find((segment) => segment.startsWith('@'));

    if (atSegment) {
      username = atSegment;
    }
  } catch {
    // Not a URL, so treat it as a plain username.
  }

  username = username
    .replace(/^@+/, '')
    .replace(/\/live\/?$/i, '')
    .replace(/[?#].*$/, '')
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9._]{2,24}$/.test(username)) {
    throw new Error(
      'TikTok usernames should be 2-24 characters using letters, numbers, dots, or underscores.'
    );
  }

  return username;
}

export function liveUrlFor(username) {
  return `https://www.tiktok.com/@${normalizeTikTokUsername(username)}/live`;
}

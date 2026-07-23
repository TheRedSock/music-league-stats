const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_TRACKS_URL = "https://api.spotify.com/v1/tracks";
const MAX_IDS_PER_REQUEST = 50;
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30_000;
const INTER_BATCH_DELAY_MS = 150;

export class SpotifyBudgetExceededError extends Error {
  readonly waitMs: number;

  constructor(
    message = "Spotify request budget exceeded for this step.",
    waitMs = 2_000,
  ) {
    super(message);
    this.name = "SpotifyBudgetExceededError";
    this.waitMs = waitMs;
  }
}

export class SpotifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyConfigError";
  }
}

export type SpotifyTrackArtist = {
  id: string;
  name: string;
};

export type SpotifyTrackResult = {
  id: string;
  name: string;
  artists: SpotifyTrackArtist[];
};

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

export function parseSpotifyTrackId(uri: string): string | null {
  const match = /^spotify:track:([A-Za-z0-9]+)$/.exec(uri.trim());
  return match?.[1] ?? null;
}

function requireSpotifyCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new SpotifyConfigError(
      "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set.",
    );
  }
  return { clientId, clientSecret };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(MAX_BACKOFF_MS, base + jitter);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(MAX_BACKOFF_MS, asSeconds * 1000);
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.min(MAX_BACKOFF_MS, Math.max(0, asDate - Date.now()));
  }
  return null;
}

export type SpotifyFetchOptions = {
  /** Absolute timestamp; stop retrying/waiting beyond this. */
  deadlineMs: number;
  onWait?: (waitMs: number, reason: string) => void | Promise<void>;
};

async function waitWithinBudget(
  waitMs: number,
  reason: string,
  options: SpotifyFetchOptions,
): Promise<void> {
  if (waitMs <= 0) return;
  const remaining = options.deadlineMs - Date.now();
  if (remaining <= 0 || waitMs > remaining) {
    throw new SpotifyBudgetExceededError(
      `Need to wait ${waitMs}ms (${reason}) but step budget is exhausted.`,
      waitMs,
    );
  }
  await options.onWait?.(waitMs, reason);
  await sleep(waitMs);
}

async function fetchAccessToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.expiresAtMs - 30_000 > Date.now()
  ) {
    return tokenCache.accessToken;
  }

  const { clientId, clientSecret } = requireSpotifyCredentials();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Spotify token request failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const json = JSON.parse(text) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + json.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

async function fetchTracksRaw(
  ids: string[],
  options: SpotifyFetchOptions,
): Promise<Array<SpotifyTrackResult | null>> {
  if (ids.length === 0) return [];
  if (ids.length > MAX_IDS_PER_REQUEST) {
    throw new Error(`Spotify track batch cannot exceed ${MAX_IDS_PER_REQUEST} ids.`);
  }

  let refreshedAuth = false;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (Date.now() >= options.deadlineMs) {
      throw new SpotifyBudgetExceededError();
    }

    let accessToken: string;
    try {
      accessToken = await fetchAccessToken(refreshedAuth);
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await waitWithinBudget(
        backoffMs(attempt),
        "token request failure",
        options,
      );
      continue;
    }

    let response: Response;
    try {
      response = await fetch(`${SPOTIFY_TRACKS_URL}?ids=${ids.join(",")}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await waitWithinBudget(backoffMs(attempt), "network error", options);
      continue;
    }

    if (response.status === 401 && !refreshedAuth) {
      refreshedAuth = true;
      tokenCache = null;
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt >= MAX_RETRIES) {
        const body = (await response.text()).slice(0, 200);
        throw new Error(
          `Spotify tracks request failed (${response.status}): ${body}`,
        );
      }
      const retryAfter = parseRetryAfterMs(response.headers.get("Retry-After"));
      const waitMs = retryAfter ?? backoffMs(attempt);
      const reason =
        response.status === 429
          ? "Spotify rate limit"
          : `Spotify ${response.status}`;
      await waitWithinBudget(waitMs, reason, options);
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Spotify tracks request failed (${response.status}): ${text.slice(0, 200)}`,
      );
    }

    const json = JSON.parse(text) as {
      tracks: Array<{
        id: string;
        name: string;
        artists: Array<{ id: string; name: string }>;
      } | null>;
    };

    return (json.tracks ?? []).map((track) =>
      track
        ? {
            id: track.id,
            name: track.name,
            artists: (track.artists ?? []).map((artist) => ({
              id: artist.id,
              name: artist.name,
            })),
          }
        : null,
    );
  }

  throw new Error("Spotify tracks request exhausted retries.");
}

/**
 * Fetch tracks in chunks of 50 with rate-limit retries and soft pacing.
 * Unprocessed ids (when the step budget is exhausted) are returned separately.
 */
export async function fetchTracksByIds(
  ids: string[],
  options: SpotifyFetchOptions,
): Promise<{
  results: Map<string, SpotifyTrackResult | null>;
  remainingIds: string[];
}> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const results = new Map<string, SpotifyTrackResult | null>();
  const remainingIds: string[] = [];

  for (let i = 0; i < uniqueIds.length; i += MAX_IDS_PER_REQUEST) {
    if (Date.now() >= options.deadlineMs) {
      remainingIds.push(...uniqueIds.slice(i));
      break;
    }

    const batch = uniqueIds.slice(i, i + MAX_IDS_PER_REQUEST);
    try {
      const tracks = await fetchTracksRaw(batch, options);
      for (let index = 0; index < batch.length; index++) {
        const id = batch[index]!;
        const track = tracks[index] ?? null;
        results.set(id, track?.id === id ? track : null);
      }
    } catch (error) {
      if (error instanceof SpotifyBudgetExceededError) {
        remainingIds.push(...uniqueIds.slice(i));
        break;
      }
      throw error;
    }

    if (i + MAX_IDS_PER_REQUEST < uniqueIds.length) {
      try {
        await waitWithinBudget(
          INTER_BATCH_DELAY_MS,
          "batch pacing",
          options,
        );
      } catch (error) {
        if (error instanceof SpotifyBudgetExceededError) {
          remainingIds.push(...uniqueIds.slice(i + MAX_IDS_PER_REQUEST));
          break;
        }
        throw error;
      }
    }
  }

  return { results, remainingIds };
}

export const SPOTIFY_MAX_IDS_PER_REQUEST = MAX_IDS_PER_REQUEST;

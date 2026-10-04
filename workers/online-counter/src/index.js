import { DurableObject } from "cloudflare:workers";

const COUNTER_OBJECT_NAME = "chainscreen-site-cloudflare-monthly-uniques";
const CACHE_KEY = "rolling-30d-cloudflare-analytics";
const DEFAULT_CACHE_TTL_MS = 86_400_000;
const DEFAULT_ZONE_ID = "81541ae7461abc123344e1e3aa16639d";
const DEFAULT_WINDOW_DAYS = 30;
const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const MAU_QUERY = `
query MonthlyActiveUsers($zoneTag: string, $dateStart: Date) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(
        limit: 1
        filter: { date_geq: $dateStart }
      ) {
        uniq {
          uniques
        }
      }
    }
  }
}
`;

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (!isVisitorEndpointPath(requestUrl.pathname)) {
      return createJsonResponse(request, { error: "not_found" }, 404);
    }

    const counterObjectId = env.ONLINE_PRESENCE.idFromName(COUNTER_OBJECT_NAME);
    return env.ONLINE_PRESENCE.get(counterObjectId).fetch(request);
  },
};

export class OnlinePresence extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(request),
      });
    }

    if (request.method !== "POST" && request.method !== "GET") {
      return createJsonResponse(request, { error: "method_not_allowed" }, 405, {
        Allow: "GET, POST, OPTIONS",
      });
    }

    const now = Date.now();
    const cacheTtlMs = getCacheTtlMs(this.env);
    const cachedAnalytics = await this.storage.get(CACHE_KEY);

    if (isFreshAnalytics(cachedAnalytics, now, cacheTtlMs)) {
      return createJsonResponse(request, {
        ...cachedAnalytics,
        cached: true,
      });
    }

    try {
      const analytics = await fetchMonthlyActiveUsers(this.env, now);
      await this.storage.put(CACHE_KEY, analytics);

      return createJsonResponse(request, {
        ...analytics,
        cached: false,
      });
    } catch {
      if (cachedAnalytics) {
        return createJsonResponse(request, {
          ...cachedAnalytics,
          cached: true,
          stale: true,
        });
      }

      return createJsonResponse(request, { error: "analytics_unavailable" }, 503);
    }
  }
}

function isVisitorEndpointPath(pathname) {
  const normalizedPathname = pathname.replace(/\/+$/, "");
  return normalizedPathname === "/api/online";
}

function isFreshAnalytics(cachedAnalytics, now, cacheTtlMs) {
  return Boolean(
    cachedAnalytics &&
      typeof cachedAnalytics.fetchedAt === "number" &&
      now - cachedAnalytics.fetchedAt < cacheTtlMs
  );
}

function getCacheTtlMs(env) {
  const configuredTtl = Number(env.CF_ANALYTICS_CACHE_TTL_MS);
  return Number.isFinite(configuredTtl) && configuredTtl > 0
    ? configuredTtl
    : DEFAULT_CACHE_TTL_MS;
}

async function fetchMonthlyActiveUsers(env, now) {
  if (!env.CF_ANALYTICS_API_TOKEN) {
    throw new Error("Missing CF_ANALYTICS_API_TOKEN");
  }

  const analyticsWindow = getRollingAnalyticsWindow(now, getWindowDays(env));
  const response = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: MAU_QUERY,
      variables: {
        zoneTag: env.CF_ZONE_ID || DEFAULT_ZONE_ID,
        dateStart: analyticsWindow.dateStart,
      },
    }),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok || responseBody?.errors?.length) {
    throw new Error("Cloudflare Analytics request failed");
  }

  const analyticsGroup =
    responseBody?.data?.viewer?.zones?.[0]?.httpRequests1dGroups?.[0];
  const visitors = Number(analyticsGroup?.uniq?.uniques);

  if (!Number.isFinite(visitors) || visitors < 0) {
    throw new Error("Cloudflare Analytics returned an invalid visitor count");
  }

  return {
    visitors,
    period: "rolling-30d",
    source: "cloudflare-graphql-mau",
    windowDays: analyticsWindow.windowDays,
    fetchedAt: now,
    updatedAt: new Date(now).toISOString(),
    since: analyticsWindow.since,
    until: analyticsWindow.until,
  };
}

function getWindowDays(env) {
  const configuredWindowDays = Number(env.CF_ANALYTICS_WINDOW_DAYS);
  return Number.isFinite(configuredWindowDays) && configuredWindowDays > 0
    ? configuredWindowDays
    : DEFAULT_WINDOW_DAYS;
}

function getRollingAnalyticsWindow(now, windowDays) {
  const nowDate = new Date(now);
  const start = new Date(
    Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate() - (windowDays - 1)
    )
  );

  return {
    windowDays,
    dateStart: start.toISOString().slice(0, 10),
    since: start.toISOString(),
    until: new Date(now).toISOString(),
  };
}

function createJsonResponse(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...createCorsHeaders(request),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function createCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = getAllowedOrigin(origin);

  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
  };
}

function getAllowedOrigin(origin) {
  if (
    origin === "https://chainscreen.io" ||
    origin === "https://www.chainscreen.io" ||
    /^http:\/\/localhost(:\d+)?$/.test(origin || "") ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin || "")
  ) {
    return origin;
  }

  return "https://chainscreen.io";
}

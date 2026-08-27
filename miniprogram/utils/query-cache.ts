const DEFAULT_STALE_TIME = 60 * 1000;

type QueryKey = string | readonly unknown[];

type QueryOptions<T> = {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  staleTime?: number;
  force?: boolean;
};

type QueryCacheEntry<T> = {
  data: T;
  updatedAt: number;
};

const queryCache = new Map<string, QueryCacheEntry<unknown>>();
const pendingQueries = new Map<string, Promise<unknown>>();

const serializeQueryKey = (queryKey: QueryKey) =>
  typeof queryKey === "string" ? queryKey : JSON.stringify(queryKey);

export async function fetchQuery<T>({
  queryKey,
  queryFn,
  staleTime = DEFAULT_STALE_TIME,
  force = false,
}: QueryOptions<T>): Promise<T> {
  const cacheKey = serializeQueryKey(queryKey);
  const cached = queryCache.get(cacheKey) as QueryCacheEntry<T> | undefined;

  if (!force && cached && Date.now() - cached.updatedAt < staleTime) {
    return cached.data;
  }

  const pending = pendingQueries.get(cacheKey) as Promise<T> | undefined;
  if (!force && pending) {
    return pending;
  }

  let queryPromise: Promise<T>;
  queryPromise = queryFn()
    .then((data) => {
      queryCache.set(cacheKey, { data, updatedAt: Date.now() });
      return data;
    })
    .finally(() => {
      if (pendingQueries.get(cacheKey) === queryPromise) {
        pendingQueries.delete(cacheKey);
      }
    });

  pendingQueries.set(cacheKey, queryPromise);
  return queryPromise;
}

export function invalidateQuery(queryKey: QueryKey) {
  queryCache.delete(serializeQueryKey(queryKey));
}

export function getCurrentUserQueryKey() {
  const app = getApp<any>();
  return (
    app.globalData?.userInfo?.id ||
    wx.getStorageSync("userInfo")?.id ||
    "guest"
  );
}

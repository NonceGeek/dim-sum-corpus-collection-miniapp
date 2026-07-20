import ENV from "../config/setting";
import { promptCurrentPageLogin } from "./auth";

/**
 * 小程序 request 封装
 * - 自动带 token
 * - token 过期自动刷新并重试
 * - 打印使用 JSON.stringify 避免 Worker 克隆错误
 */

let isRefreshing = false;
let refreshQueue: Array<{ retry: () => void; reject: (e: any) => void }> = [];
let activeRefreshPromise: Promise<boolean> | null = null;

export function clearAuthState() {
  wx.removeStorageSync("accessToken");
  wx.removeStorageSync("refreshToken");
  const app = getApp<{
    globalData?: { accessToken?: string; refreshToken?: string };
  }>();
  if (app?.globalData) {
    app.globalData.accessToken = "";
    app.globalData.refreshToken = "";
  }
}

export function createAuthRequiredError() {
  const error = new Error("登录后才能使用该功能") as Error & {
    code: string;
    error: string;
  };
  error.code = "AUTH_REQUIRED";
  error.error = error.message;
  return error;
}

function request(url: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const app = getApp<{ globalData: { accessToken?: string } }>();
    const token =
      wx.getStorageSync("accessToken") || app?.globalData?.accessToken || "";
    const shouldAttachToken = options.auth !== false;

    wx.request({
      url: `${ENV.API_PRIMARY_URL}${url}`,
      method: options.method || "GET",
      data: options.data || {},
      timeout: 10000,
      header: {
        ...(options.header || {}),
        ...(shouldAttachToken && token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },

      success: async (res) => {
        try {
          // 只打印序列化后的对象，避免 Worker postMessage 报错
          // console.log(`[request] URL: ${url}`, JSON.stringify(res));

          // 只有 401 才视为 token 过期，403 是权限不足
          const isTokenExpired = res.statusCode === 401;

          if (!isTokenExpired) {
            return resolve(res.data);
          }

          if (!token) {
            if (shouldAttachToken) {
              promptCurrentPageLogin();
            }
            return reject(createAuthRequiredError());
          }

          // 刷新后仍返回 401 时停止重试，由发起操作的页面决定是否提示登录
          const retryCount = options._retryCount || 0;
          if (retryCount >= 1) {
            clearAuthState();
            promptCurrentPageLogin();
            return reject(createAuthRequiredError());
          }

          handleTokenExpired(
            url,
            { ...options, _retryCount: retryCount + 1 },
            resolve,
            reject,
          );
        } catch (err) {
          console.error("[request] success 回调异常:", err);
          reject(err);
        }
      },

      fail: (err) => {
        console.error("[request] wx.request fail:", JSON.stringify(err));
        reject(err);
      },
    });
  });
}

function handleTokenExpired(
  url: string,
  options: any = {},
  resolve: (value: any) => void,
  reject: (arg0: any) => void,
) {
  if (isRefreshing) {
    // ✅ 已在刷新，排队等待
    refreshQueue.push({
      retry: () => request(url, options).then(resolve).catch(reject),
      reject,
    });
    return;
  }

  isRefreshing = true;

  refreshAccessToken()
    .then((ok) => {
      isRefreshing = false;

      if (!ok) {
        // 刷新失败只返回鉴权错误，不在请求层决定页面跳转
        clearAuthState();
        promptCurrentPageLogin();
        const authError = createAuthRequiredError();
        const queue = refreshQueue.slice();
        refreshQueue = [];
        queue.forEach(({ reject: rj }) => rj(authError));

        return reject(authError);
      }

      // ✅ 刷新成功，执行队列
      const queue = refreshQueue.slice();
      refreshQueue = [];
      queue.forEach(({ retry }) => {
        try {
          retry();
        } catch (e) {
          console.error(e);
        }
      });

      // ✅ 当前请求重试
      request(url, options).then(resolve).catch(reject);
    })
    .catch(() => {
      isRefreshing = false;
      clearAuthState();
      promptCurrentPageLogin();
      const authError = createAuthRequiredError();
      const queue = refreshQueue.slice();
      refreshQueue = [];
      queue.forEach(({ reject: rj }) => rj(authError));
      reject(authError);
    });
}

/**
 * 刷新 token
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!activeRefreshPromise) {
    activeRefreshPromise = refreshToken().finally(() => {
      activeRefreshPromise = null;
    });
  }

  return activeRefreshPromise;
}

function refreshToken(): Promise<boolean> {
  return new Promise((resolve) => {
    const refreshToken = wx.getStorageSync("refreshToken");
    if (!refreshToken) {
      console.warn("[refreshToken] 没有 refreshToken");
      return resolve(false);
    }

    wx.request({
      url: `${ENV.API_BASE_URL}/auth/refresh`,
      method: "POST",
      data: { refreshToken },

      success(res) {
        console.log("[refreshToken] 返回:", JSON.stringify(res));

        if (res.statusCode !== 200 || !(res.data as any)?.accessToken) {
          console.warn("[refreshToken] 刷新失败");
          return resolve(false);
        }

        const { accessToken, refreshToken: newRefreshToken } = res.data as {
          accessToken: string;
          refreshToken: string;
        };
        wx.setStorageSync("accessToken", accessToken);
        wx.setStorageSync("refreshToken", newRefreshToken);
        const app = getApp<{
          globalData?: { accessToken?: string; refreshToken?: string };
        }>();
        if (app?.globalData) {
          app.globalData.accessToken = accessToken;
          app.globalData.refreshToken = newRefreshToken;
        }
        console.log("[refreshToken] 刷新成功");
        resolve(true);
      },

      fail(err) {
        console.error("[refreshToken] 请求失败:", JSON.stringify(err));
        resolve(false);
      },
    });
  });
}

export default request;

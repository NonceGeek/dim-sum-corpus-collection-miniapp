import ENV from "../config/setting";

/**
 * 小程序 request 封装
 * - 自动带 token
 * - token 过期自动刷新并重试
 * - 打印使用 JSON.stringify 避免 Worker 克隆错误
 */

let isRefreshing = false;
let refreshQueue: Array<{ retry: () => void; reject: (e: any) => void }> = [];
// 全局"正在跳转登录页"标志：保证无论多少请求同时失败，只跳一次、只弹一次 toast
let isRedirecting = false;

/**
 * 统一跳转登录页
 * 加锁保证只执行一次，避免多个失败请求各自 reLaunch 造成 login 页反复闪烁
 */
function redirectToLogin() {
  if (isRedirecting) return;
  isRedirecting = true;

  wx.removeStorageSync("accessToken");
  wx.removeStorageSync("refreshToken");

  wx.showToast({
    title: "登录已过期，请重新登录",
    icon: "none",
    duration: 1500,
  });

  setTimeout(() => {
    wx.reLaunch({ url: "/pages/login/login" });
  }, 800);
}

/**
 * 复位跳转锁（由 login 页 onShow 调用），
 * 以便下次登录再次过期时仍能正常跳转
 */
export function resetRedirectFlag() {
  isRedirecting = false;
}

function request(url: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const app = getApp<{ globalData: { accessToken?: string } }>();
    const token =
      wx.getStorageSync("accessToken") || app?.globalData?.accessToken || "";

    wx.request({
      url: `${ENV.API_PRIMARY_URL}${url}`,
      method: options.method || "GET",
      data: options.data || {},
      timeout: 10000,
      header: {
        ...(options.header || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

          // 重试次数限制（最多重试 3 次）
          const retryCount = options._retryCount || 0;
          if (retryCount >= 3) {
            console.error("[request] 重试 3 次仍失败");
            redirectToLogin();
            return reject(new Error("登录过期，请重新登录"));
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

  refreshToken()
    .then((ok) => {
      isRefreshing = false;

      if (!ok) {
        // 刷新失败：拒绝所有排队请求，并统一跳转登录页（只跳一次）
        const queue = refreshQueue.slice();
        refreshQueue = [];
        queue.forEach(({ reject: rj }) => rj(new Error("登录过期")));

        redirectToLogin();
        return reject(new Error("登录过期"));
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
      refreshQueue = [];
      reject(new Error("refresh error"));
    });
}

/**
 * 刷新 token
 */
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

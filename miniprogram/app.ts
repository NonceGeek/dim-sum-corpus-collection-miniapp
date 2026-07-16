// app.ts
import ENV from "./config/setting";
import { IAppOption } from "../typings";

// 主题类型定义
export type ThemeMode = "auto" | "light" | "dark";
export type ThemeValue = "light" | "dark";
export const STATIC_FILE = "/public/image/yue.jpg";
let loginPromise: Promise<string> | null = null;

App<IAppOption>({
  globalData: {
    userInfo: null,
    accessToken: "",
    refreshToken: "",
    themeMode: "auto",
    theme: "light",
  },

  onLaunch() {
    // 从 storage 恢复全局数据（解决热启动问题）
    this.restoreGlobalData();
    // 初始化主题
    this.initTheme();

    // 监听系统主题变化
    wx.onThemeChange((result) => {
      console.log("系统主题变化:", result.theme);
      if (this.globalData.themeMode === "auto") {
        this.applyTheme(result.theme as ThemeValue);
      }
    });
  },

  /**
   * 从 storage 恢复全局数据
   * 解决小程序热启动时 globalData 丢失的问题
   */
  restoreGlobalData() {
    try {
      const accessToken = wx.getStorageSync("accessToken");
      const refreshToken = wx.getStorageSync("refreshToken");
      const userInfo = wx.getStorageSync("userInfo");

      // 恢复数据到 globalData
      if (accessToken) this.globalData.accessToken = accessToken;
      if (refreshToken) this.globalData.refreshToken = refreshToken;
      if (userInfo) this.globalData.userInfo = userInfo;

      if (accessToken || userInfo) {
        console.log("✅ 从 storage 恢复全局数据:", {
          hasToken: !!accessToken,
          hasUser: !!userInfo,
        });
      }
    } catch (error) {
      console.error("恢复全局数据失败:", error);
    }
  },
  /**
   * 初始化主题设置
   */
  async initTheme() {
    try {
      const savedMode = (await this.getStorage("themeMode")) as ThemeMode;
      const systemInfo = wx.getSystemInfoSync();
      const systemTheme = (systemInfo.theme || "light") as ThemeValue;

      if (savedMode && ["auto", "light", "dark"].includes(savedMode)) {
        this.globalData.themeMode = savedMode;
        if (savedMode === "auto") {
          this.applyTheme(systemTheme);
        } else {
          this.applyTheme(savedMode as ThemeValue);
        }
      } else {
        // 默认跟随系统
        this.globalData.themeMode = "auto";
        this.applyTheme(systemTheme);
      }
    } catch (e) {
      console.error("初始化主题失败:", e);
      this.applyTheme("light");
    }
  },

  /**
   * 应用主题到页面
   */
  applyTheme(theme: ThemeValue) {
    this.globalData.theme = theme;

    // 设置页面根节点的主题类
    const pages = getCurrentPages();
    pages.forEach((page: any) => {
      if (typeof page.onThemeChange === "function") {
        page.onThemeChange({ theme });
      } else if (page.setData) {
        page.setData({ currentTheme: theme });
      }
    });

    this.applyNavigationBarTheme(theme);

    console.log("主题已应用:", theme);
  },

  /**
   * 应用原生导航栏主题
   */
  applyNavigationBarTheme(theme: ThemeValue) {
    const navBarStyle =
      theme === "dark"
        ? { backgroundColor: "#161B22", frontColor: "#ffffff" }
        : { backgroundColor: "#FFFFFF", frontColor: "#000000" };

    wx.setNavigationBarColor({
      frontColor: navBarStyle.frontColor as "#ffffff" | "#000000",
      backgroundColor: navBarStyle.backgroundColor,
      animation: { duration: 300, timingFunc: "easeInOut" },
    });
  },

  /**
   * 获取当前主题模式
   */
  getThemeMode(): ThemeMode {
    return this.globalData.themeMode as ThemeValue;
  },

  /**
   * 获取当前实际主题
   */
  getTheme(): ThemeValue {
    this.applyNavigationBarTheme(this.globalData.theme as ThemeValue);
    return this.globalData.theme as ThemeValue;
  },

  /**
   * 设置主题模式
   */
  async setThemeMode(mode: ThemeMode) {
    this.globalData.themeMode = mode;
    await this.setStorage("themeMode", mode);

    if (mode === "auto") {
      const systemInfo = wx.getSystemInfoSync();
      this.applyTheme((systemInfo.theme || "light") as ThemeValue);
    } else {
      this.applyTheme(mode as ThemeValue);
    }

    console.log("主题模式已设置:", mode);
  },

  // 封装异步获取 storage
  getStorage(key: string): Promise<any> {
    return new Promise((resolve) => {
      wx.getStorage({
        key,
        success: (res) => resolve(res.data),
        fail: () => resolve(null),
      });
    });
  },

  setStorage(key: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      wx.setStorage({
        key,
        data,
        success: () => resolve(),
        fail: reject,
      });
    });
  },

  /**
   * 退出登录
   */
  logout() {
    // 清除用户信息和token
    this.globalData.userInfo = null;
    this.globalData.accessToken = "";
    this.globalData.refreshToken = "";

    // 清除本地存储
    wx.removeStorageSync("accessToken");
    wx.removeStorageSync("refreshToken");
    wx.removeStorageSync("userInfo");

    // 退出后回到游客可浏览的首页
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },

  /**
   * 确保登录，返回 accessToken，可设置重试次数
   * 自动支持审核模式 mock token
   */
  ensureLogin(_retries = 1): Promise<string> {
    if (!loginPromise) {
      loginPromise = (async () => {
        // 审核模式直接返回 mock token
        if (ENV.IS_REVIEW) {
          console.log("审核模式，使用 mock token");
          const mockToken = "review-token";
          const mockUser: { nickname: string; avatar: string } = {
            nickname: "审核用户",
            avatar: "",
          };
          this.globalData.accessToken = mockToken;
          this.globalData.userInfo = mockUser as any;
          await Promise.all([
            this.setStorage("accessToken", mockToken),
            this.setStorage("userInfo", mockUser),
          ]);
          return mockToken;
        }

        // 尝试从 storage 获取 token
        const token = await this.getStorage("accessToken");
        if (token) {
          this.globalData.accessToken = token;
          console.log("已存在 token，直接使用");
          return token;
        }

        console.log("No token in storage, manual login required.");
        throw new Error("需要手动登录");
      })().finally(() => {
        loginPromise = null; // 登录完成后清掉
      });
    }
    return loginPromise;
  },

  // 尝试登录，失败时自动重试
  async tryLogin(retries: number): Promise<string> {
    try {
      return await this.doLogin();
    } catch (err: any) {
      console.warn(
        `登录失败: ${err.message || err.errMsg || err}`,
        `剩余重试次数: ${retries}`,
      );
      if (retries > 0) {
        await new Promise((res) => setTimeout(res, 500)); // 延迟 500ms 再重试
        return this.tryLogin(retries - 1);
      }
      throw new Error(err.message || "登录失败");
    }
  },

  // 执行微信登录
  doLogin(): Promise<string> {
    wx.showLoading({ title: "登录中..." });
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            wx.hideLoading();
            return reject(new Error("登录失败：未获取 code"));
          }

          wx.request({
            url: `${ENV.API_BASE_URL}/auth/login`,
            method: "POST",
            data: { code: res.code, miniprogramApp: "corpus-collection-app" },
            timeout: 15000, // 审核环境可能较慢
            success: async (resp) => {
              wx.hideLoading();

              console.log("返回结果：", resp);
              if (resp.statusCode !== 200) {
                return reject(resp.data);
              } else {
                console.log("登录接口返回", resp.data); // 审核模式排查用
                await this.handleLoginSuccess(resp.data);
                resolve(this.globalData.accessToken);
              }
            },
            fail: (err) => {
              wx.hideLoading();
              reject(err);
            },
          });
        },
        fail: (err) => {
          wx.hideLoading();
          reject(err);
        },
      });
    });
  },

  // 处理登录成功后的公共逻辑
  async handleLoginSuccess(data: any) {
    const { accessToken, refreshToken, user } = data || {};
    if (!accessToken) throw new Error("登录失败：未返回 token");

    // 更新全局状态
    this.globalData.accessToken = accessToken;
    this.globalData.refreshToken = refreshToken;
    this.globalData.userInfo = user;

    // 异步存储
    await Promise.all([
      this.setStorage("accessToken", accessToken),
      this.setStorage("refreshToken", refreshToken),
      this.setStorage("userInfo", user),
    ]);

    console.log("登录成功", user);
  },
});

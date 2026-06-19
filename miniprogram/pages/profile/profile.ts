import request from "../../utils/http";
import ENV from "../../config/setting";
const { miniProgram } = wx.getAccountInfoSync();

// 主题模式选项
const THEME_OPTIONS = [
  { label: "跟随系统", value: "auto" },
  { label: "浅色模式", value: "light" },
  { label: "深色模式", value: "dark" },
];

// 主题模式文本映射
const THEME_MODE_TEXT: Record<string, string> = {
  auto: "跟随系统",
  light: "浅色模式",
  dark: "深色模式",
};
Page({
  data: {
    unreadCount: 3,
    theme: "light",
    currentTheme: "light" as "light" | "dark",
    themeMode: "auto" as "auto" | "light" | "dark",
    themeModeText: "跟随系统",
    showThemeSheet: false,
    themeOptions: THEME_OPTIONS,
    username: "",
    avatar: "",
    submissionCount: 0,
    unreadNotificationCount: 0,
    version: miniProgram.version || `${ENV.VERSION}`,
  },
  async onLoad() {
    this.syncUserInfo();
    await this.loadProfileSummary();
  },

  syncUserInfo() {
    const app = getApp<any>();
    const { name, avatar } =
      wx.getStorageSync("userInfo") || app?.globalData?.userInfo || {};
    this.setData({
      username: name,
      avatar,
    });
  },

  async loadProfileSummary() {
    try {
      const res = await request("/profile/summary");
      const { submissionCount, unreadNotificationCount } = res;
      this.setData({
        submissionCount,
        unreadNotificationCount,
      });
    } catch (err: any) {
      console.log("获取用户数据出错：", err);
      wx.showModal({
        title: "获取用户数据出错",
        content: err.error,
        showCancel: false,
      });
    }
  },

  onMessageClick() {
    wx.navigateTo({ url: "/pages/message/message" });
  },

  onWorksClick() {
    wx.navigateTo({ url: "/pages/mine/mine" });
  },
  onShow() {
    // 每次显示页面时同步主题状态
    this.syncTheme();
  },

  onPullDownRefresh() {
    this.syncUserInfo();
    this.syncTheme();
    this.loadProfileSummary().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 初始化主题
   */
  initTheme() {
    const app = getApp<any>();
    const themeMode = app.getThemeMode() || "auto";
    const currentTheme = app.getTheme() || "light";

    this.setData({
      themeMode,
      currentTheme,
      themeModeText: THEME_MODE_TEXT[themeMode],
    });
  },

  /**
   * 同步主题状态
   */
  syncTheme() {
    const app = getApp<any>();
    const themeMode = app.getThemeMode();
    const currentTheme = app.getTheme();

    if (
      this.data.themeMode !== themeMode ||
      this.data.currentTheme !== currentTheme
    ) {
      this.setData({
        themeMode,
        currentTheme,
        themeModeText: THEME_MODE_TEXT[themeMode],
      });
    }
  },

  /**
   * 点击主题设置
   */
  onThemeSettingTap() {
    this.setData({
      showThemeSheet: true,
    });
  },

  /**
   * 选择主题
   */
  onThemeSelect(e: any) {
    const { value } = e.detail.selected;
    const app = getApp<any>();

    app.setThemeMode(value);

    // 更新页面状态
    setTimeout(() => {
      const currentTheme = app.getTheme();
      this.setData({
        themeMode: value,
        currentTheme,
        themeModeText: THEME_MODE_TEXT[value],
        showThemeSheet: false,
      });
    }, 100);
  },

  /**
   * 关闭主题选择弹窗
   */
  onThemeSheetClose() {
    this.setData({
      showThemeSheet: false,
    });
  },
  onThemeChange(params: any) {
    console.log("主题变化:", params.theme);
    this.setData({
      theme: params.theme,
      currentTheme: params.theme,
    });
  },

  onLogout() {
    wx.showModal({
      title: "提示",
      content: "确定要退出登录吗？",
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.reLaunch({ url: "/pages/login/login" });
        }
      },
    });
  },
});

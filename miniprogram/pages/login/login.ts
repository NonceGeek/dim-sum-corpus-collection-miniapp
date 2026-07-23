import { IAppOption } from "../../../typings";
import ENV from "../../config/setting";
const { miniProgram } = wx.getAccountInfoSync();

function decodeRedirect(rawRedirect: string): string {
  try {
    return decodeURIComponent(rawRedirect);
  } catch (err) {
    console.warn("登录回跳地址解析失败:", err);
    return "";
  }
}

Page({
  data: {
    loading: false,
    currentTheme: "light",
    agreedToTerms: false,
    title: ENV.title,
    subtitle: ENV.subtitle,
    version: miniProgram.version || `${ENV.VERSION}`,
    redirectUrl: "",
    returnToPrevious: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.syncTheme();
    this.setData({ returnToPrevious: options.returnToPrevious === "1" });
    const redirect = decodeRedirect(options.redirect || "");
    if (
      redirect.startsWith("/pages/") &&
      !redirect.startsWith("/pages/login/")
    ) {
      this.setData({ redirectUrl: redirect });
    }
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  async handleLogin() {
    if (this.data.loading) return;

    console.log("handleLogin agreedToTerms:", this.data.agreedToTerms);
    if (!this.data.agreedToTerms) {
      wx.showToast({
        title: "请先阅读并同意用户协议",
        icon: "none",
        duration: 2000,
      });
      return;
    }

    this.setData({ loading: true });

    try {
      // Reuse the existing doLogin method which handles wx.login + backend request
      const app = getApp<IAppOption>();
      await app.doLogin();

      wx.showToast({
        title: "登录成功",
        icon: "success",
      });

      const redirectUrl = this.data.redirectUrl;
      setTimeout(() => {
        if (this.data.returnToPrevious && getCurrentPages().length > 1) {
          wx.navigateBack();
        } else if (redirectUrl) {
          wx.redirectTo({ url: redirectUrl });
        } else {
          wx.reLaunch({ url: "/pages/index/index" });
        }
      }, 1500);
    } catch (err: any) {
      console.error("Login failed", err);
      wx.showToast({
        title: err.error || err.errMsg || "登录失败",
        icon: "none",
        duration: 2000,
      });
      this.setData({ loading: false });
    }
  },

  onCancelLogin() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }

    wx.reLaunch({ url: "/pages/index/index" });
  },

  // 协议复选框变化
  onAgreementChange(e: any) {
    console.log("e:", e);
    const checked = e.detail.value.length > 0;
    this.setData({
      agreedToTerms: checked,
    });
  },

  // 跳转到用户服务协议
  goToTerms() {
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(ENV.termsUrl)}`,
    });
  },

  // 跳转到隐私政策
  goToPrivacy() {
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(ENV.privacyUrl)}`,
    });
  },
});

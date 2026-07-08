import { IAppOption } from "../../../typings";
import ENV from "../../config/setting";
const { miniProgram } = wx.getAccountInfoSync();

Page({
  data: {
    loading: false,
    currentTheme: "light",
    agreedToTerms: false,
    title: ENV.title,
    subtitle: ENV.subtitle,
    version: miniProgram.version || `${ENV.VERSION}`,
  },

  onLoad() {
    this.syncTheme();
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

      // Redirect to main page
      setTimeout(() => {
        wx.reLaunch({
          url: "/pages/index/index",
        });
      }, 1500);
    } catch (err: any) {
      console.error("Login failed", err);
      wx.showToast({
        title: String(err) || "登录失败",
        icon: "none",
        duration: 2000,
      });
      this.setData({ loading: false });
    }
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

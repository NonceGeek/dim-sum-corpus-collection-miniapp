import { isLoggedIn, promptLogin } from "../../utils/auth";
import { showCommonDialog } from "../../utils/common-dialog";
import { formatDate } from "../../utils/date";
import request from "../../utils/http";

const formatRules = (rules: unknown) => {
  if (Array.isArray(rules)) {
    return rules.filter(Boolean).join("\n");
  }

  return typeof rules === "string" ? rules : "";
};

const getTitleFontSize = (title: string) => {
  const characters = Array.from(title.trim());
  const visualLength = characters.reduce((length, character) => {
    return length + (/^[\x00-\xff]$/.test(character) ? 0.55 : 1);
  }, 0);

  if (visualLength === 0) return 46;

  const availableWidth = 600 - Math.max(0, characters.length - 1) * 4;
  return Math.max(36, Math.min(46, Math.floor(availableWidth / visualLength)));
};

Page({
  data: {
    activityId: "",
    activity: {} as any,
    titleFontSize: 46,
    description: "",
    rules: "",
    loading: true,
    currentTheme: "light",
    joinConsentPopupVisible: false,
    shouldResumeJoin: false,
  },

  onLoad(options: Record<string, string>) {
    const activityId = decodeURIComponent(options.id || "");
    this.setData({
      activityId,
      shouldResumeJoin: options.join === "1",
    });
    this.syncTheme();
    this.loadActivity();
  },

  onShow() {
    this.syncTheme();
    if (!this.data.shouldResumeJoin || !isLoggedIn()) return;

    this.setData({
      shouldResumeJoin: false,
      joinConsentPopupVisible: true,
    });
  },

  syncTheme() {
    const app = getApp<any>();
    this.setData({ currentTheme: app.getTheme() || "light" });
  },

  async loadActivity() {
    if (!this.data.activityId) {
      this.setData({ loading: false });
      showCommonDialog(this, {
        title: "无法打开活动",
        content: "缺少活动信息，请返回后重试。",
      });
      return;
    }

    this.setData({ loading: true });
    try {
      const activity = await request(`/activities/${this.data.activityId}`);
      activity.startsAt = formatDate(activity.startsAt, "YYYY-MM-DD");
      activity.endsAt = formatDate(activity.endsAt, "YYYY-MM-DD");
      this.setData({
        activity,
        titleFontSize: getTitleFontSize(activity.title || ""),
        description: activity.description || "暂无活动描述",
        rules: formatRules(activity.rules) || "暂无活动规则",
      });
    } catch (err: any) {
      console.error("获取活动详情失败", err);
      showCommonDialog(this, {
        title: "获取活动详情失败",
        content: err?.error || err?.errMsg || "请稍后重试",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBackToBrowse() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }

    wx.redirectTo({
      url: `/pages/tracks/tracks?id=${encodeURIComponent(this.data.activityId)}`,
    });
  },

  onJoin() {
    const returnUrl = `/pages/activity-detail/activity-detail?id=${encodeURIComponent(this.data.activityId)}&join=1`;
    if (!isLoggedIn()) {
      promptLogin(returnUrl, {
        content: "登录后才能投稿，当前仍可继续浏览活动内容。",
        returnToPrevious: true,
        onConfirm: () => this.setData({ shouldResumeJoin: true }),
      });
      return;
    }

    this.setData({ joinConsentPopupVisible: true });
  },

  onJoinConsentClose() {
    this.setData({ joinConsentPopupVisible: false });
  },

  onJoinConsentComplete(e: WechatMiniprogram.CustomEvent) {
    const questionnaireJourneyId = e.detail.questionnaireJourneyId || "";
    this.setData({ joinConsentPopupVisible: false });
    wx.navigateTo({
      url:
        `/pages/post/post?mode=edit&tag=${e.detail.activityId || this.data.activityId}` +
        (questionnaireJourneyId
          ? `&questionnaireJourneyId=${encodeURIComponent(questionnaireJourneyId)}`
          : ""),
    });
  },
});

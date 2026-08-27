import ENV from "../../config/setting";
import { formatDate } from "../../utils/date";
import {
  isLoggedIn,
  navigateToProtectedPage,
  promptLogin,
} from "../../utils/auth";
import request from "../../utils/http";
import { fetchQuery } from "../../utils/query-cache";
import { showCommonDialog } from "../../utils/common-dialog";

const TYPE_JSON = ENV.TYPE_JSON;

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

  // 毛玻璃标题卡片约有 600rpx 可用宽度，同时为字符间距预留空间。
  const availableWidth = 600 - Math.max(0, characters.length - 1) * 4;
  return Math.max(36, Math.min(46, Math.floor(availableWidth / visualLength)));
};

Page({
  data: {
    trackId: "",
    track: {} as any,
    trackLoading: true,
    trackTextReady: false,
    trackTitleFontSize: 46,
    currentTrackType: "all",
    cardList: [] as any[],
    page: 1,
    total: 0,
    loading: false,
    noMore: false,
    ruleDialogVisible: false,
    joinConsentPopupVisible: false,
    shouldResumeJoin: false,
    ruleDialogDescription: "",
    ruleDialogRules: "",
    ruleDialogConfirmBtn: {
      content: "确定",
      variant: "base",
      theme: "primary",
      shape: "round",
      size: "medium",
      hoverClass: "none",
    },
    select: "phrase",
    type: [{ label: "全部", value: "all" }, ...ENV.TYPE],
  },

  onLoad(options) {
    const id = options.id;
    this.setData({
      trackId: id,
      shouldResumeJoin: options.join === "1",
    });
    this.syncTheme();
    this.loadTrack();
  },
  async loadTrack() {
    this.setData({
      trackLoading: true,
      trackTextReady: false,
    });

    try {
      const track = await request(`/activities/${this.data.trackId}`);
      track.startsAt = formatDate(track.startsAt, "YYYY-MM-DD");
      track.endsAt = formatDate(track.endsAt, "YYYY-MM-DD");
      track.activityTag = track.activityTag || "";
      this.setData({
        track,
        trackTitleFontSize: getTitleFontSize(track.title || ""),
        trackLoading: false,
        trackTextReady: true,
      });
      await this.loadCardList();
    } catch (err) {
      this.setData({
        trackLoading: false,
      });
      console.log("获取活动或作品列表数据失败", err);
      showCommonDialog(this, {
        title: "获取活动或作品列表数据失败",
        content: err.error || err.errMsg + "，请稍后重试",
      });
    }
  },

  onShow() {
    this.syncTheme();
    if (this.data.shouldResumeJoin && isLoggedIn()) {
      this.setData({
        shouldResumeJoin: false,
        joinConsentPopupVisible: true,
      });
    }
  },

  onReachBottom() {
    if (!this.data.loading && !this.data.noMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadCardList();
    }
  },

  onPullDownRefresh() {
    this.setData({
      page: 1,
      noMore: false,
      cardList: [],
    });
    this.loadCardList({ force: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  onTrackTap(e: any) {
    const type = e.currentTarget.dataset.type;
    if (this.data.currentTrackType === type) return;
    this.setData({
      currentTrackType: type,
      page: 1,
      noMore: false,
      cardList: [],
      loading: false,
    });
    this.loadCardList();
  },

  async loadCardList(options: { force?: boolean } = {}) {
    if (this.data.loading || this.data.noMore) {
      return;
    }

    this.setData({
      loading: true,
    });

    try {
      const { currentTrackType, page, cardList: oldList } = this.data;

      let url = `/activities/${this.data.trackId}/works?page=${page}&pageSize=10`;

      if (currentTrackType !== "all") {
        const typeLabel = TYPE_JSON[currentTrackType as keyof typeof TYPE_JSON];
        url += `&submissionType=${typeLabel}`;
      }

      const snapshot = await fetchQuery({
        queryKey: ["tracks", "works", this.data.trackId, currentTrackType],
        force: options.force || page > 1,
        queryFn: async () => {
          const { items = [], pagination } = await request(url);
          return {
            cardList: page === 1 ? items : [...oldList, ...items],
            page,
            total: pagination.total,
            noMore: items.length < 10,
          };
        },
      });

      this.setData({
        cardList: snapshot.cardList,
        page: snapshot.page,
        noMore: snapshot.noMore,
        total: snapshot.total,
      });
    } catch (err: any) {
      console.error("加载卡片列表失败", err);

      showCommonDialog(this, {
        title: "加载失败",
        content: err.error || err.errMsg + "，请稍后重试",
      });
    } finally {
      this.setData({
        loading: false,
      });
    }
  },
  onCardTap(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post/post?id=${id}&mode=view` });
  },

  onWaterfallTap(e: any) {
    const { id } = e.detail;
    wx.navigateTo({ url: `/pages/post/post?id=${id}&mode=view` });
  },

  onMyWorks() {
    navigateToProtectedPage(
      "/pages/mine/mine",
      "登录后才能查看我的参赛作品，当前仍可继续浏览活动内容。",
    );
  },

  onAllTracks() {
    wx.navigateTo({ url: "/pages/upload/upload" });
  },

  getShareConfig() {
    const { track } = this.data;

    return {
      title: track.title,
      path: `/pages/tracks/tracks?id=${track.id}`,
      imageUrl: track.bannerUrl || "",
    };
  },

  onShare() {
    return this.getShareConfig();
  },

  onShareAppMessage() {
    return this.getShareConfig();
  },

  onRule() {
    const { track } = this.data;
    this.setData({
      ruleDialogVisible: true,
      ruleDialogDescription: track.description || "暂无",
      ruleDialogRules: formatRules(track.rules) || "暂无",
    });
  },

  onRuleDialogClose() {
    this.setData({ ruleDialogVisible: false });
  },

  onPost() {
    if (!isLoggedIn()) {
      promptLogin(`/pages/tracks/tracks?id=${this.data.trackId}&join=1`, {
        content: "登录后才能投稿，当前仍可继续浏览活动内容。",
      });
      return;
    }

    this.setData({ joinConsentPopupVisible: true });
  },

  onJoinConsentClose() {
    this.setData({ joinConsentPopupVisible: false });
  },

  onJoinConsentComplete(e: WechatMiniprogram.CustomEvent) {
    this.setData({ joinConsentPopupVisible: false });
    this.navigateToPost(
      e.detail.activityId,
      e.detail.questionnaireJourneyId || "",
    );
  },

  navigateToPost(activityId: string, questionnaireJourneyId: string) {
    wx.navigateTo({
      url:
        "/pages/post/post?mode=edit&tag=" +
        (activityId || this.data.track.id || this.data.trackId) +
        (questionnaireJourneyId
          ? `&questionnaireJourneyId=${encodeURIComponent(questionnaireJourneyId)}`
          : ""),
    });
  },
});

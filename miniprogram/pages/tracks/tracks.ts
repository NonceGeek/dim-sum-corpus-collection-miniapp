import { formatDate } from "../../utils/date";
import request from "../../utils/http";

const TYPE_JSON = {
  phrase: "用语",
  poem: "诗歌",
  story: "故事",
  slogan: "标语",
  geographic: "地名解说",
  rest: "歇后语",
};

Page({
  data: {
    trackId: "",
    track: {} as any,
    trackTextReady: false,
    currentTrackType: "all",
    cardList: [] as any[],
    page: 1,
    total: 0,
    loading: false,
    noMore: false,
    select: "phrase",
    type: [
      { label: "全部", value: "all" },
      { label: "用语", value: "phrase" },
      { label: "诗歌", value: "poem" },
      { label: "故事", value: "story" },
      { label: "标语", value: "slogan" },
      { label: "地名解说", value: "geographic" },
      { label: "歇后语", value: "rest" },
    ],
  },

  onLoad(options) {
    const id = options.id;
    this.setData({ trackId: id });
    this.syncTheme();
    this.loadTrack();
  },
  async loadTrack() {
    try {
      wx.showLoading({ title: "加载中..." });
      this.setData({ trackTextReady: false });
      const track = await request(`/activities/${this.data.trackId}`);
      wx.hideLoading();
      track.startsAt = formatDate(track.startsAt, "YYYY-MM-DD");
      track.endsAt = formatDate(track.endsAt, "YYYY-MM-DD");
      this.setData({ track, trackTextReady: true });
      await this.loadCardList();
    } catch (err) {
      console.log("获取活动或作品列表数据失败", err);
      wx.showModal({
        title: "获取活动或作品列表数据失败",
        content: err.error || err.errMsg + "，请稍后重试",
        showCancel: false,
      });
    }
  },

  onShow() {
    this.syncTheme();
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
    this.loadCardList().finally(() => {
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

  async loadCardList() {
    if (this.data.loading || this.data.noMore) {
      return;
    }

    this.setData({
      loading: true,
    });
    wx.showLoading({ title: "加载中..." });
    try {
      const { currentTrackType, page, cardList: oldList } = this.data;

      let url = `/activities/${this.data.trackId}/works?page=${page}&pageSize=10`;
      wx.hideLoading();

      if (currentTrackType !== "all") {
        const typeLabel = TYPE_JSON[currentTrackType as keyof typeof TYPE_JSON];
        url += `&submissionType=${typeLabel}`;
      }

      const { items = [], pagination } = await request(url);

      const noMore = items.length < 10;

      this.setData({
        cardList: page === 1 ? items : [...oldList, ...items],

        noMore,
        total: pagination.total,
      });
    } catch (err: any) {
      console.error("加载卡片列表失败", err);

      wx.showModal({
        title: "加载失败",
        content: err.error || err.errMsg + "，请稍后重试",
        showCancel: false,
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
    wx.navigateTo({ url: "/pages/mine/mine" });
  },

  onAllTracks() {
    wx.navigateTo({ url: "/pages/upload/upload" });
  },

  getShareConfig() {
    const { track, cardList } = this.data;

    return {
      title: track.title,
      path: `/pages/tracks/tracks?id=${track.id}`,
      imageUrl: cardList[0]?.cover || "",
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
    const { rules } = track;
    wx.showModal({
      title: "活动规则",
      content: rules,
      showCancel: false,
    });
  },
  onPost() {
    wx.navigateTo({
      url: "/pages/post/post?mode=edit&tag=" + this.data.track.id,
    });
  },
});

import request from "../../utils/http";

const CARDLIST = [
  {
    id: 1,
    type: "phrase",
    cover: "https://tdesign.gtimg.com/mobile/demos/example1.png",
    avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
    author: "创作者A",
  },
  {
    id: 2,
    type: "story",
    cover: "https://tdesign.gtimg.com/mobile/demos/example2.png",
    avatar: "https://tdesign.gtimg.com/mobile/demos/avatar2.png",
    author: "播客达人",
  },
  {
    id: 3,
    type: "phrase",
    cover: "https://tdesign.gtimg.com/mobile/demos/example3.png",
    avatar: "https://tdesign.gtimg.com/mobile/demos/avatar3.png",
    author: "旅行者",
  },
];

Page({
  data: {
    trackId: "",
    track: {} as any,
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
      const track = await request(`/activities/${this.data.trackId}`);
      // TODO 开始结束时间格式化
      this.setData({ track });
      await this.loadCardList();
    } catch (err) {
      console.log("获取活动或作品列表数据失败", err);
      wx.showModal({
        title: "获取活动或作品列表数据失败",
        content: err.error + "，请稍后重试",
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

    try {
      const { currentTrackType, page, cardList: oldList } = this.data;

      let url = `/activities/${this.data.trackId}/works?page=${page}&pageSize=10`;

      if (currentTrackType !== "all") {
        url += `&type=${currentTrackType}`;
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
        content: err.error || "请稍后重试",
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
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onWaterfallTap(e: any) {
    const { id } = e.detail;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
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

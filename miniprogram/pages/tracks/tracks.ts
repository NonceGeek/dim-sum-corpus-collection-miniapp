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
    currentTrackType: "all",
    cardList: [] as any[],
    page: 1,
    pageSize: 10,
    loading: false,
    noMore: false,
    select: "phrase",

    track: {
      id: 1,
      title: "粤语诗歌朗诵赛",
      from: "2026-05-01",
      to: "2026-06-15",
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
  },

  onLoad() {
    this.syncTheme();
    this.loadCardList();
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
    if (this.data.loading || this.data.noMore) return;
    const { currentTrackType } = this.data;
    this.setData({ loading: true });

    const app = getApp<any>();
    try {
      // const res = await app.getContentList({
      //   page: this.data.page,
      //   pageSize: this.data.pageSize,
      //   trackType: this.data.currentTrackType || "all",
      // });

      console.log("currentTrackType", currentTrackType);
      if (currentTrackType === "all") {
        this.setData({ cardList: CARDLIST });
        return;
      }
      const cardList = CARDLIST.filter(
        (item) => item.type === currentTrackType,
      );
      console.log("cardList", cardList, currentTrackType);
      this.setData({ cardList });
      // if (res.success && res.data) {
      // const newList = res.data.list || res.data;
      // const isFirstPage = this.data.page === 1;
      // this.setData({
      //   cardList: isFirstPage ? newList : [...this.data.cardList, ...newList],
      //   noMore: res.data.list ? newList.length < this.data.pageSize : false,
      // });
      // } else {
      //   this.setData({ noMore: true });
      // }
    } catch (err) {
      console.error("加载卡片列表失败", err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onCardTap(e: any) {
    const id = e.currentTarget.dataset.id;
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
    wx.showModal({
      title: "活动规则",
      content: "这里是活动规则说明...",
      showCancel: false,
    });
  },
  onPost() {
    wx.navigateTo({ url: "/pages/post/post?tag=" + this.data.track.id });
  },
});

import request from "../../utils/http";

const STATUS = [
  {
    label: "全部",
    value: "all",
  },
  {
    label: "审核中",
    value: "reviewStatus=pending_review",
  },
  {
    label: "已审核",
    value: "reviewStatus=approved",
  },
  {
    label: "审核失败",
    value: "reviewStatus=rejected",
  },
  {
    label: "已获奖",
    value: "awardStatus=awarded",
  },
  {
    label: "已领奖",
    value: "awardStatus=claimed",
  },
  {
    label: "领奖逾期",
    value: "awardStatus=expired",
  },
];

Page({
  data: {
    currentTheme: "light",

    filterExpanded: false,
    status: STATUS,
    activeTrack: "all",
    activeStatus: "all",

    tracks: [],

    works: [],
    visibleWorks: [],

    page: 1,

    total: 0,

    loading: false,
    noMore: false,
  },

  async onLoad() {
    this.syncTheme();
    await this.loadOwnTracks();
    await this.loadOwnWorks();
  },
  async loadOwnWorks() {
    if (this.data.loading || this.data.noMore) {
      return;
    }

    wx.showLoading({ title: "加载中..." });
    this.setData({
      loading: true,
    });

    try {
      const { page, works: oldWorks, activeStatus, activeTrack } = this.data;

      const res = await request(
        `/submissions/mine?page=${page}&pageSize=10&${activeStatus === "all" ? "" : activeStatus}&activityId=${activeTrack === "all" ? "" : activeTrack}`,
      );
      wx.hideLoading();
      const { items = [], pagination } = res;

      const works = items;

      const noMore = items.length < 10;

      this.setData({
        works: page === 1 ? works : [...oldWorks, ...works],

        visibleWorks: page === 1 ? works : [...oldWorks, ...works],

        total: pagination.total || 0,

        noMore,
      });
    } catch (err: any) {
      wx.hideLoading();
      console.log("获取我的投稿数据出错：", err);

      wx.showModal({
        title: "获取失败",
        content: err.error || "请稍后再试",
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
      this.setData({
        loading: false,
      });
    }
  },

  async loadOwnTracks() {
    wx.showLoading({ title: "加载中..." });
    try {
      const res = await request("/profile/activities");
      wx.hideLoading();
      const { items } = res;
      const mapItems = items.map((item) => ({
        id: item.id,
        title: item.title,
      }));

      this.setData({
        tracks: [
          { id: "all", title: "全部" },
          ...mapItems,
          { id: "other", title: "其他" },
        ] as any,
      });
    } catch (err: any) {
      wx.hideLoading();
      console.log("获取我的参赛活动数据出错：", err);
      wx.showModal({
        title: "获取我的参赛活动数据出错",
        content: err.error,
        showCancel: false,
      });
    }
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme ? app.getTheme() || "light" : "light";
    this.setData({ currentTheme });
  },

  onBack() {
    wx.navigateBack();
  },

  onMyWorks() {
    this.setData({ filterExpanded: false });
  },

  onToggleFilters() {
    this.setData({ filterExpanded: !this.data.filterExpanded });
  },

  onTrackTap(e: any) {
    this.setData({ activeTrack: e.currentTarget.dataset.value });
  },

  onStatusTap(e: any) {
    this.setData({ activeStatus: e.currentTarget.dataset.value });
  },

  onSubmit() {
    this.setData({
      page: 1,
      noMore: false,
      works: [],
      visibleWorks: [],
      filterExpanded: false,
    });

    this.loadOwnWorks();
  },
  onWaterfallTap(e: any) {
    const { id } = e.detail;
    wx.navigateTo({ url: `/pages/post/post?id=${id}&mode=view` });
  },

  onNavigateToActivity() {
    wx.navigateTo({
      url: "/pages/featured/featured",
    });
  },
  onReachBottom() {
    if (this.data.loading || this.data.noMore) {
      return;
    }

    this.setData({
      page: this.data.page + 1,
    });

    this.loadOwnWorks();
  },
  onPullDownRefresh() {
    this.setData({
      page: 1,
      noMore: false,
      works: [],
      visibleWorks: [],
    });

    this.loadOwnWorks().finally(() => {
      wx.stopPullDownRefresh();
    });
  },
});

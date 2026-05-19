import request from "../../utils/http";

const STATUS = [
  {
    label: "全部",
    value: "all",
  },
  {
    label: "审核中",
    value: "pending_review",
  },
  {
    label: "获奖",
    value: "gift",
  },
];

interface IWork {
  id: string;
  title: string;
  submissionType: string;
  reviewStatus: string;
  reviewReason: string;
  activity: {
    id: string;
    title: string;
  };
  createdAt: string;
}
// const WORKS = [
//   {
//     id: 1,
//     track: "speech",
//     status: "pending",
//     trackLabel: "粤语歇后语大赛",
//     rank: 5,
//     title: "123456",
//     author: "用户1",
//     cover: "https://tdesign.gtimg.com/mobile/demos/example1.png",
//     avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
//   },
//   {
//     id: 2,
//     track: "poetry",
//     status: "gift",
//     trackLabel: "粤语诗歌朗诵赛",
//     rank: 12,
//     title: "4567",
//     author: "用户1",
//     cover: "https://tdesign.gtimg.com/mobile/demos/example2.png",
//     avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
//   },
//   {
//     id: 3,
//     track: "discovery",
//     status: "pending",
//     trackLabel: "粤语地名解说",
//     rank: 17,
//     title: "89900",
//     author: "用户1",
//     cover: "https://tdesign.gtimg.com/mobile/demos/example3.png",
//     avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
//   },
// ];

Page({
  data: {
    currentTheme: "light",

    filterExpanded: false,

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

    this.setData({
      loading: true,
    });

    const app = getApp<any>();

    const { name, avatar } =
      wx.getStorageSync("userInfo") || app?.globalData?.userInfo || {};

    try {
      const { page, works: oldWorks } = this.data;

      const res = await request(`/submissions/mine?page=${page}&pageSize=10`);

      const { items = [], pagination } = res;

      const works = items.map((item: IWork) => ({
        ...item,
        avatar,
        author: name,
      }));

      const noMore = items.length < 10;

      this.setData({
        works: page === 1 ? works : [...oldWorks, ...works],

        visibleWorks: page === 1 ? works : [...oldWorks, ...works],

        total: pagination.total || 0,

        noMore,
      });
    } catch (err: any) {
      console.log("获取我的投稿数据出错：", err);

      wx.showModal({
        title: "获取失败",
        content: err.error || "请稍后再试",
        showCancel: false,
      });
    } finally {
      this.setData({
        loading: false,
      });
    }
  },

  async loadOwnTracks() {
    try {
      const res = await request("/profile/activities");
      const { items } = res;
      this.setData({
        tracks: items,
      });
    } catch (err: any) {
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

  onJoin() {
    wx.navigateTo({ url: "/pages/post/post?mode=view" });
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
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
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

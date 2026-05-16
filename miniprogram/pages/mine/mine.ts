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
    activeTrack: "discovery",
    tracks: [] as { id: string; title: string }[],
    works: [] as IWork[],
    visibleWorks: [] as any[],
    status: STATUS,
    activeStatus: "all",
    page: 1,
    pageSize: 10,
    total: 0,
    username: "",
    avatar: "",
  },

  async onLoad() {
    this.syncTheme();
    this.updateVisibleWorks();
    await this.loadOwnTracks();
    await this.loadOwnWorks();
  },
  async loadOwnWorks() {
    const app = getApp<any>();
    const { name, avatar } =
      wx.getStorageSync("userInfo") || app?.globalData?.userInfo || {};
    try {
      const res = await request("/submissions/mine");
      const { items, pagination } = res;
      const works = items.map((item: IWork) => ({
        ...item,
        avatar,
        author: name,
      }));
      this.setData({
        works,
        total: pagination.total,
        page: pagination.page,
      });
    } catch (err: any) {
      console.log("获取我的投稿数据出错：", err);
      wx.showModal({
        title: "获取我的投稿数据出错",
        content: err.error,
        showCancel: false,
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

  updateVisibleWorks() {
    const { activeTrack, activeStatus, works } = this.data;
    let visibleWorks =
      activeTrack === "all"
        ? [...works]
        : works.filter((item) => item.id === activeTrack);

    if (activeStatus !== "all") {
      visibleWorks = visibleWorks.filter(
        (item) => item.status === activeStatus,
      );
    }

    this.setData({ visibleWorks });
  },

  onBack() {
    wx.navigateBack();
  },

  onMyWorks() {
    this.setData({ filterExpanded: false });
  },

  onJoin() {
    wx.navigateTo({ url: "/pages/post/post" });
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
    this.updateVisibleWorks();
    this.setData({ filterExpanded: false });
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
});

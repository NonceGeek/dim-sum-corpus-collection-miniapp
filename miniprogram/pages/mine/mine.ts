const TRACKS = [
  { label: "全部", value: "all" },
  { label: "粤语诗歌朗诵赛", value: "poetry" },
  { label: "粤语地名解说", value: "discovery" },
  { label: "粤语歇后语大赛", value: "speech" },
];

const STATUS = [
  {
    label: "全部",
    value: "all",
  },
  {
    label: "审核中",
    value: "pending",
  },
  {
    label: "获奖",
    value: "gift",
  },
];

const WORKS = [
  {
    id: 1,
    track: "speech",
    status: "pending",
    trackLabel: "粤语歇后语大赛",
    rank: 5,
    title: "123456",
    author: "用户1",
    cover: "https://tdesign.gtimg.com/mobile/demos/example1.png",
    avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
  },
  {
    id: 2,
    track: "poetry",
    status: "gift",
    trackLabel: "粤语诗歌朗诵赛",
    rank: 12,
    title: "4567",
    author: "用户1",
    cover: "https://tdesign.gtimg.com/mobile/demos/example2.png",
    avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
  },
  {
    id: 3,
    track: "discovery",
    status: "pending",
    trackLabel: "粤语地名解说",
    rank: 17,
    title: "89900",
    author: "用户1",
    cover: "https://tdesign.gtimg.com/mobile/demos/example3.png",
    avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
  },
];

Page({
  data: {
    currentTheme: "light",
    filterExpanded: false,
    activeTrack: "discovery",
    tracks: TRACKS,
    works: WORKS,
    visibleWorks: [] as any[],
    status: STATUS,
    activeStatus: "all",
  },

  onLoad() {
    this.syncTheme();
    this.updateVisibleWorks();
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
    const { activeTrack, activeStatus } = this.data;
    let visibleWorks =
      activeTrack === "all"
        ? [...WORKS]
        : WORKS.filter((item) => item.track === activeTrack);

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
});

import request from "../../utils/http";
import { guardProtectedPage } from "../../utils/auth";
import {
  fetchQuery,
  getCurrentUserQueryKey,
} from "../../utils/query-cache";
import { showCommonDialog } from "../../utils/common-dialog";

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
    value: "reviewStatus=approved&awardStatus=awarded",
  },
  {
    label: "已领奖",
    value: "reviewStatus=approved&awardStatus=claimed",
  },
  {
    label: "领奖逾期",
    value: "reviewStatus=approved&awardStatus=expired",
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

    visibleWorks: [],

    page: 1,
    pageSize: 10,

    total: 0,

    loading: false,
    isInitialWorksLoading: true,
    noMore: false,
    flag: false,
  },

  async onLoad() {
    this.syncTheme();

    if (
      !guardProtectedPage("/pages/mine/mine")
    ) {
      this.setData({ isInitialWorksLoading: false });
      return;
    }

    await this.loadOwnTracks();
    await this.loadOwnWorks();
  },
  async loadOwnWorks(options: { force?: boolean } = {}) {
    if (this.data.loading || this.data.noMore) {
      return;
    }

    const isInitialLoad =
      this.data.page === 1 && this.data.visibleWorks.length === 0;

    this.setData({
      loading: true,
      ...(isInitialLoad ? { isInitialWorksLoading: true } : {}),
    });

    try {
      const {
        page,
        pageSize,
        visibleWorks: oldWorks,
        activeStatus,
        activeTrack,
        flag,
      } = this.data;

      let url = `/submissions/mine?page=${page}&pageSize=${pageSize}`;
      if (activeStatus !== "all") {
        url += `&${activeStatus}`;
      }
      if (activeTrack !== "all" && activeTrack !== "other") {
        url += `&activityId=${activeTrack}`;
      }
      if (activeTrack === "other") {
        url += "&withoutActivity=true";
      }
      const snapshot = await fetchQuery({
        queryKey: [
          "mine",
          "works",
          getCurrentUserQueryKey(),
          activeTrack,
          activeStatus,
        ],
        force: options.force || page > 1,
        queryFn: async () => {
          const res = await request(url);
          const { items = [], pagination } = res;
          const works = page === 1 ? items : [...oldWorks, ...items];
          return {
            visibleWorks: works,
            page,
            total: pagination.total || 0,
            noMore: items.length < pageSize,
            flag: flag || (pagination.total || works.length) > 0,
          };
        },
      });
      this.setData({
        visibleWorks: snapshot.visibleWorks,
        page: snapshot.page,
        total: snapshot.total,
        noMore: snapshot.noMore,
        flag: snapshot.flag,
      });
    } catch (err: any) {
      console.log("获取我的投稿数据出错：", err);

      if (err?.code === "AUTH_REQUIRED") {
        return;
      }

      showCommonDialog(this, {
        title: "获取失败",
        content: err.error || err.errMsg + "，请稍后再试",
      });
    } finally {
      this.setData({
        loading: false,
        ...(isInitialLoad ? { isInitialWorksLoading: false } : {}),
      });
    }
  },

  async loadOwnTracks(options: { force?: boolean } = {}) {
    try {
      const tracks = await fetchQuery({
        queryKey: ["mine", "tracks", getCurrentUserQueryKey()],
        force: options.force,
        queryFn: async () => {
          const res = await request("/profile/activities");
          const mapItems = (res.items || []).map((item) => ({
            id: item.id,
            title: item.title,
          }));
          return [
            { id: "all", title: "全部" },
            ...mapItems,
            { id: "other", title: "其他" },
          ] as any;
        },
      });
      this.setData({ tracks });
    } catch (err: any) {
      console.log("获取我的参赛活动数据出错：", err);

      if (err?.code === "AUTH_REQUIRED") {
        return;
      }

      showCommonDialog(this, {
        title: "获取我的参赛活动数据出错",
        content: err.error || err.errMsg + "，请稍后重试",
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
    this.setData({
      activeTrack: e.currentTarget.dataset.value,
    });
  },

  onTrackTapOutside(e) {
    this.setData(
      {
        activeTrack: e.currentTarget.dataset.value,
        page: 1,
        noMore: false,
        visibleWorks: [],
      },
      () => {
        this.loadOwnWorks();
      },
    );
  },

  onStatusTap(e: any) {
    this.setData({ activeStatus: e.currentTarget.dataset.value });
  },

  onSubmit() {
    this.setData({
      page: 1,
      noMore: false,
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
      visibleWorks: [],
    });

    this.loadOwnWorks({ force: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
});

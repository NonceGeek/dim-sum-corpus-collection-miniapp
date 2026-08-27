import { STATIC_FILE } from "../../app";
import ENV from "../../config/setting";
import request from "../../utils/http";
import { fetchQuery } from "../../utils/query-cache";

const SHARE_TITLE = `${ENV.title}｜${ENV.subtitle}`;
const SHARE_PATH = "/pages/index/index";
const TIMELINE_IMAGE = "/public/image/logo.png";

interface ISwiperList {
  id: string;
  title: string;
  bannerUrl: string;
  linkType: string;
  linkId: string;
  value: string;
}

Page({
  data: {
    current: 0,
    autoplay: true,
    duration: 500,
    interval: 10000,
    bannerImageProps: {
      mode: "widthFix",
    },
    swiperList: [],

    cardList: [],
    page: 1,
    pageSize: 20,
    loading: false,
    isInitialCardLoading: true,
    noMore: false,
  },
  loadMoreObserver: null as any,

  async onLoad() {
    this.syncTheme();
    wx.showShareMenu({
      menus: ["shareAppMessage", "shareTimeline"],
    });
    await this.loadSwiperData();
    await this.loadCardList();
    wx.nextTick(() => {
      this.initLoadMoreObserver();
    });
  },

  onUnload() {
    if (this.loadMoreObserver) {
      this.loadMoreObserver.disconnect();
      this.loadMoreObserver = null;
    }
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  async loadSwiperData(options: { force?: boolean } = {}) {
    try {
      const swiperList = await fetchQuery({
        queryKey: ["index", "swiper"],
        force: options.force,
        queryFn: async () => {
          wx.showLoading({ title: "加载中..." });
          try {
            const res = await request("/activities?timeStatus=ongoing");
            const activities = (res.items || []).slice(0, 5);
            return activities.map((activity: ISwiperList) => ({
              id: activity.id,
              title: activity.title,
              imageUrl: activity.bannerUrl || STATIC_FILE,
              linkType: "activity",
              linkId: activity.id,
              value: activity.bannerUrl || STATIC_FILE,
            }));
          } finally {
            wx.hideLoading();
          }
        },
      });
      this.setData({ swiperList });
    } catch (err: any) {
      console.error("加载轮播图失败", err);
      wx.showToast({
        title: err.error || err.errMsg,
        icon: "none",
        duration: 2000,
      });
    }
  },

  async loadCardList(options: { force?: boolean } = {}) {
    if (this.data.loading || this.data.noMore) return;

    const isInitialLoad =
      this.data.page === 1 && this.data.cardList.length === 0;

    this.setData({
      loading: true,
      ...(isInitialLoad ? { isInitialCardLoading: true } : {}),
    });

    try {
      const { page, pageSize } = this.data;
      const snapshot = await fetchQuery({
        queryKey: ["index", "submissions"],
        force: options.force || page > 1,
        queryFn: async () => {
          const res = await request(
            `/home/submissions?page=${page}&pageSize=${pageSize}&sort=latest`,
          );
          const items = res.items || [];
          return {
            cardList: page === 1 ? items : [...this.data.cardList, ...items],
            page,
            noMore: items.length < pageSize,
          };
        },
      });
      this.setData({
        cardList: snapshot.cardList,
        page: snapshot.page,
        noMore: snapshot.noMore,
      });
    } catch (err: any) {
      console.error("加载卡片列表失败", err);
      wx.showToast({
        title: err.error || err.errMsg,
        icon: "none",
        duration: 2000,
      });
    } finally {
      this.setData({
        loading: false,
        ...(isInitialLoad ? { isInitialCardLoading: false } : {}),
      });
    }
  },

  loadNextPage() {
    if (this.data.loading || this.data.noMore) return;

    this.setData({ page: this.data.page + 1 }, () => {
      this.loadCardList();
    });
  },

  initLoadMoreObserver() {
    if (this.loadMoreObserver) {
      this.loadMoreObserver.disconnect();
    }

    this.loadMoreObserver = wx.createIntersectionObserver(this);
    this.loadMoreObserver
      .relativeToViewport({ bottom: 240 })
      .observe(".load-more-trigger", (res) => {
        if (res.intersectionRatio > 0) {
          this.loadNextPage();
        }
      });
  },

  onReachBottom() {
    this.loadNextPage();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, noMore: false });
    Promise.all([
      this.loadSwiperData({ force: true }),
      this.loadCardList({ force: true }),
    ]).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onShareAppMessage() {
    return {
      title: SHARE_TITLE,
      path: SHARE_PATH,
    };
  },

  onShareTimeline() {
    return {
      title: SHARE_TITLE,
      query: "",
      imageUrl: TIMELINE_IMAGE,
    };
  },

  onWaterfallTap(e: any) {
    const { id } = e.detail;
    wx.navigateTo({ url: `/pages/post/post?id=${id}&mode=view` });
  },

  onClickToTrack(e) {
    const index = e.detail.index;
    console.log("index:", index);
    const { swiperList } = this.data;
    console.log("swiperList:", swiperList[index]);
    const trackId = (swiperList[index] as unknown as ISwiperList).linkId;
    wx.navigateTo({
      url: `/pages/tracks/tracks?id=${trackId}`,
    });
  },
});

import { STATIC_FILE } from "../../app";
import request from "../../utils/http";

interface ISwiperList {
  id: string;
  title: string;
  imageUrl: string;
  linkType: string;
  linkId: string;
}

Page({
  data: {
    current: 0,
    autoplay: true,
    duration: 500,
    interval: 3000,
    swiperList: [],

    cardList: [],
    page: 1,
    pageSize: 20,
    loading: false,
    noMore: false,
    activeTab: "home",
  },
  loadMoreObserver: null as any,

  async onLoad() {
    this.syncTheme();
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

  async loadSwiperData() {
    try {
      wx.showLoading({ title: "加载中..." });
      const res = await request("/home");
      wx.hideLoading();
      const { banners } = res;
      const swiperList = banners.map((banner: ISwiperList) => ({
        ...banner,
        value: banner.imageUrl || STATIC_FILE,
      }));
      this.setData({
        swiperList,
      });
    } catch (err: any) {
      console.error("加载轮播图失败", err);
      wx.showToast({
        title: err.error || err.errMsg,
        icon: "none",
        duration: 2000,
      });
    }
  },

  async loadCardList() {
    if (this.data.loading || this.data.noMore) return;

    this.setData({ loading: true });

    try {
      const { page, pageSize } = this.data;
      const res = await request(
        `/home/submissions?page=${page}&pageSize=${pageSize}&sort=latest`,
      );
      const { items } = res;
      const newList = items;
      const isFirstPage = this.data.page === 1;
      this.setData({
        cardList: isFirstPage ? newList : [...this.data.cardList, ...newList],
        noMore: items ? newList.length < pageSize : false,
      });
    } catch (err: any) {
      console.error("加载卡片列表失败", err);
      wx.showToast({
        title: err.error || err.errMsg,
        icon: "none",
        duration: 2000,
      });
    } finally {
      this.setData({ loading: false });
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
    Promise.all([this.loadSwiperData(), this.loadCardList()]).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onWaterfallTap(e: any) {
    const { id } = e.detail;
    wx.navigateTo({ url: `/pages/post/post?id=${id}&mode=view` });
  },

  onTabChange(e: any) {
    const value = e.detail.value;
    this.setData({ activeTab: value });
    if (value === "featured") {
      wx.navigateTo({ url: "/pages/featured/featured" });
    } else if (value === "upload") {
      wx.navigateTo({ url: "/pages/post/post?mode=edit" });
    } else if (value === "profile") {
      wx.navigateTo({ url: "/pages/profile/profile" });
    }
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

import { STATIC_FILE } from "../../app";
import ENV from "../../config/setting";
import { navigateToProtectedPage } from "../../utils/auth";
import request from "../../utils/http";

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
    noMore: false,
    activeTab: "home",
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
    this.setData({ activeTab: "home" });
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  async loadSwiperData() {
    try {
      wx.showLoading({ title: "加载中..." });
      const res = await request("/activities?timeStatus=ongoing", {
        auth: false,
      });
      wx.hideLoading();
      const activities = (res.items || []).slice(0, 5);
      const swiperList = activities.map((activity: ISwiperList) => ({
        id: activity.id,
        title: activity.title,
        imageUrl: activity.bannerUrl || STATIC_FILE,
        linkType: "activity",
        linkId: activity.id,
        value: activity.bannerUrl || STATIC_FILE,
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
        { auth: false },
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

  onTabChange(e: any) {
    const value = e.detail.value;
    this.setData({ activeTab: value });
    if (value === "featured") {
      wx.navigateTo({ url: "/pages/featured/featured" });
    } else if (value === "upload") {
      this.setData({ activeTab: "home" });
      navigateToProtectedPage(
        "/pages/post/post?mode=edit",
        "登录后才能投稿，当前仍可继续浏览公开内容。",
      );
    } else if (value === "profile") {
      this.setData({ activeTab: "home" });
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

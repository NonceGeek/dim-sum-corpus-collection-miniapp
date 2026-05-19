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
    swiperList: ["/public/image/200.png", "/public/image/logo.png"],

    cardList: [
      {
        id: 1,
        imageUrl: "/public/image/叉烧饭.jpg",
        avatar: "",
        author: "用户",
      },
      {
        id: 2,
        imageUrl: "/public/image/200.png",
        avatar: "",
        author: "用户2",
      },
    ],
    page: 1,
    pageSize: 10,
    loading: false,
    noMore: false,
    activeTab: "home",
  },

  async onLoad() {
    this.syncTheme();
    await this.loadSwiperData();
    // this.loadCardList();
    console.log("swiperList:", this.data.swiperList);
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
      const res = await request("/home");
      if (res.success && res.data) {
        const { banners, latestSubmissions } = res.data;
        const swiperList = banners.map((banner: ISwiperList) => ({
          ...banners,
          value: banner.imageUrl,
          cardList: latestSubmissions,
        }));
        this.setData({
          swiperList,
        });
      }
    } catch (err: any) {
      console.error("加载轮播图失败", err);
      wx.showToast({
        title: err.error,
        icon: "none",
        duration: 2000,
      });
    }
  },

  // async loadCardList() {
  //   if (this.data.loading || this.data.noMore) return;

  //   this.setData({ loading: true });
  //   const app = getApp<any>();

  //   try {
  //     const res = await app.getContentList({
  //       page: this.data.page,
  //       pageSize: this.data.pageSize,
  //     });

  //     if (res.success && res.data) {
  //       const newList = res.data.list || res.data;
  //       const isFirstPage = this.data.page === 1;
  //       // this.setData({
  //       //   cardList: isFirstPage ? newList : [...this.data.cardList, ...newList],
  //       //   noMore: res.data.list ? newList.length < this.data.pageSize : false,
  //       // });
  //     } else {
  //       this.setData({ noMore: true });
  //     }
  //   } catch (err) {
  //     console.error("加载卡片列表失败", err);
  //   } finally {
  //     this.setData({ loading: false });
  //   }
  // },

  // onReachBottom() {
  //   this.setData({ page: this.data.page + 1 });
  //   this.loadCardList();
  // },

  // onPullDownRefresh() {
  //   this.setData({ page: 1, noMore: false });
  //   Promise.all([this.loadSwiperData(), this.loadCardList()]).finally(() => {
  //     wx.stopPullDownRefresh();
  //   });
  // },

  onWaterfallTap(e: any) {
    const { id } = e.detail;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
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
  onClickToTrack(index: number) {
    const { swiperList } = this.data;
    const trackId = (swiperList[index] as unknown as ISwiperList).linkId;
    wx.navigateTo({
      url: `/pages/tracks/tracks?id=${trackId}`,
    });
  },
});

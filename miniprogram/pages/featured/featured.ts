import request from "../../utils/http";

interface ITrack {
  id: string;
  title: string;
  description: string;
  bannerUrl: string;
  status: string;
  startsAt: string;
  endsAt: string;
  submissionCount: number;
}

// function isVideo(url) {
//   return /\.(mp4|mov|m3u8|webm)$/i.test(url);
// }

Page({
  data: {
    currentTheme: "light",
    currentIndex: 0,
    descIndex: 0,
    descAnimClass: "show",
    descTexts: ["你讲咩呀～", "收声啦你", "边个教你噶"],
    tabScrollLeft: 0,
    allTracksPopupVisible: false,
    visibleTabs: [] as any[],
    topTracks: [] as ITrack[],
    allTracks: [] as ITrack[],
    allTracksPage: 1,
    allTracksTotal: 0,
    allTracksLoading: false,
    allTracksNoMore: false,
  },

  timer: null as any,

  async onLoad() {
    this.syncTheme();
    this.startDescCycle();

    await this.loadTopTracks();
  },
  async loadTopTracks() {
    try {
      wx.showLoading({ title: "加载中..." });
      const { items } = await request("/activities");
      wx.hideLoading();
      const tracks = items.map((item) => {
        item.status =
          item.endsAt > new Date().toISOString() ? "active" : "unactive";
        return item;
      });
      this.setData(
        {
          topTracks: tracks,
        },
        () => this.updateVisibleTabs(),
      );
    } catch (err) {
      console.log("加载活动报错:", err);
      wx.showToast({
        title: err.error,
        icon: "none",
        duration: 2000,
      });
    }
  },

  onUnload() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  },

  onShow() {
    this.syncTheme();
  },

  onContentSwiperChange(e: any) {
    const current = e.detail.current;
    this.setData({
      currentIndex: current,
    });
    this.updateVisibleTabs();
  },

  onTabSwiperChange(e: any) {
    this.setData({
      currentIndex: e.detail.current,
    });
  },

  onTabTap(e: any) {
    const position = e.currentTarget.dataset.position;
    const trackCount = this.data.topTracks.length;
    let newIndex = this.data.currentIndex;

    if (position === "prev") {
      newIndex = (this.data.currentIndex - 1 + trackCount) % trackCount;
    } else if (position === "next") {
      newIndex = (this.data.currentIndex + 1) % trackCount;
    }

    this.setData({
      currentIndex: newIndex,
    });
    this.updateVisibleTabs();
  },

  updateVisibleTabs() {
    const trackCount = this.data.topTracks.length;
    if (trackCount === 0) return;
    const current = this.data.currentIndex;
    const prevIndex = (current - 1 + trackCount) % trackCount;
    const nextIndex = (current + 1) % trackCount;
    this.setData({
      visibleTabs: [
        {
          ...this.data.topTracks[prevIndex],
          _position: "prev",
          _originalIndex: prevIndex,
        },
        {
          ...this.data.topTracks[current],
          _position: "current",
          _originalIndex: current,
        },
        {
          ...this.data.topTracks[nextIndex],
          _position: "next",
          _originalIndex: nextIndex,
        },
      ],
    });
  },

  startDescCycle() {
    this.timer = setInterval(() => {
      this.setData({ descAnimClass: "hide" });
      setTimeout(() => {
        let next = this.data.descIndex + 1;
        if (next >= this.data.descTexts.length) {
          next = 0;
        }
        this.setData({
          descIndex: next,
          descAnimClass: "show",
        });
      }, 500);
    }, 3000);
  },
  scrollTabToCenter(index: number) {
    const query = wx.createSelectorQuery();

    query.select(`#tab-${index}`).boundingClientRect();
    query.select(".tab-scroll").boundingClientRect();

    query.exec((res) => {
      const tabRect = res[0] as any;
      const scrollRect = res[1] as any;

      if (!tabRect || !scrollRect) return;

      // 当前 scrollLeft
      const currentScrollLeft = this.data.tabScrollLeft || 0;

      // tab中心点
      const tabCenter = tabRect.left + tabRect.width / 2;

      // scroll-view中心点
      const scrollCenter = scrollRect.width / 2;

      // 需要移动距离
      const distance = tabCenter - scrollCenter;

      this.setData({
        tabScrollLeft: currentScrollLeft + distance,
      });
    });
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme ? app.getTheme() || "light" : "light";
    this.setData({ currentTheme });
  },

  onMyWorks() {
    wx.navigateTo({
      url: "/pages/mine/mine",
    });
  },

  onMorePosts(e: any) {
    const itemId = e.currentTarget.dataset.id;
    this.setData({ allTracksPopupVisible: false });
    wx.navigateTo({
      url: `/pages/tracks/tracks?id=${itemId}`,
    });
  },

  onAllTracks() {
    this.setData({
      allTracksPopupVisible: true,
      allTracks: [],
      allTracksPage: 1,
      allTracksNoMore: false,
    });

    this.loadMoreTracks();
  },

  onAllTracksPopupChange(e: any) {
    this.setData({ allTracksPopupVisible: e.detail.visible });
  },

  onPopupTrackTap(e: any) {
    const trackId = e.currentTarget.dataset.id;
    this.setData({ allTracksPopupVisible: false });
    wx.navigateTo({
      url: `/pages/tracks/tracks?id=${trackId}`,
    });
  },

  onPost(e: any) {
    const itemId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/post/post?tag=${itemId}&mode=edit`,
    });
  },
  onShowDetails(e) {
    const itemId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/tracks/tracks?id=${itemId}`,
    });
  },
  async loadMoreTracks() {
    if (this.data.allTracksLoading || this.data.allTracksNoMore) {
      return;
    }

    this.setData({
      allTracksLoading: true,
    });

    try {
      wx.showLoading({ title: "加载中..." });
      const { allTracksPage, allTracks } = this.data;
      const pageSize = 10;

      const res = await request(
        `/activities?page=${allTracksPage}&pageSize=${pageSize}&includeExpired=true`,
      );

      wx.hideLoading();

      const items = (res.items || []).map((item: any) => ({
        ...item,
        status: item.endsAt > new Date().toISOString() ? "active" : "unactive",
      }));

      const nextTracks = allTracksPage === 1 ? items : [...allTracks, ...items];
      const total = res.pagination?.total;

      this.setData({
        allTracks: nextTracks,
        allTracksTotal: typeof total === "number" ? total : nextTracks.length,
        allTracksNoMore:
          typeof total === "number"
            ? nextTracks.length >= total
            : items.length < pageSize,
      });
    } catch (err: any) {
      console.log("加载更多活动失败:", err);

      wx.showToast({
        title: err.error || "加载失败",
        icon: "none",
      });
    } finally {
      this.setData({
        allTracksLoading: false,
      }, () => {
        this.loadNextPageIfPopupListNotScrollable();
      });
    }
  },

  loadNextPageIfPopupListNotScrollable() {
    if (
      !this.data.allTracksPopupVisible ||
      this.data.allTracksLoading ||
      this.data.allTracksNoMore ||
      this.data.allTracks.length === 0
    ) {
      return;
    }

    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(this);
      query.select(".tracks-popup-list").boundingClientRect();
      query.select(".tracks-popup-list-content").boundingClientRect();

      query.exec((res) => {
        const listRect = res[0] as any;
        const contentRect = res[1] as any;

        if (!listRect || !contentRect) {
          return;
        }

        if (contentRect.height <= listRect.height + 1) {
          this.onTracksScrollToLower();
        }
      });
    });
  },

  onTracksScrollToLower() {
    if (this.data.allTracksLoading || this.data.allTracksNoMore) {
      return;
    }

    this.setData({
      allTracksPage: this.data.allTracksPage + 1,
    });

    this.loadMoreTracks();
  },
});

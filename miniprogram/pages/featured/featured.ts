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
    tracks: [
      {
        id: 1,
        title: "粤语诗歌朗诵赛",
        enTitle: "Poetry",
        sub: "2.3万个作品已参赛",
        desc: "用粤语展示你的创作，分享你的情感。",
        status: "active",
        videoList: [
          {
            cover: "https://tdesign.gtimg.com/mobile/demos/example1.png",
            avatar: "https://tdesign.gtimg.com/mobile/demos/avatar1.png",
            author: "创作者A",
          },
          {
            cover: "https://tdesign.gtimg.com/mobile/demos/example2.png",
            avatar: "https://tdesign.gtimg.com/mobile/demos/avatar2.png",
            author: "播客达人",
          },
          {
            cover: "https://tdesign.gtimg.com/mobile/demos/example3.png",
            avatar: "https://tdesign.gtimg.com/mobile/demos/avatar3.png",
            author: "旅行者",
          },
        ],
      },

      {
        id: 2,
        title: "粤语地名解说",
        enTitle: "Discovery",
        sub: "1.6万个作品已参赛",
        desc: "向外走，探索真实世界的广度。",
        status: "active",
        videoList: [
          {
            cover: "https://tdesign.gtimg.com/mobile/demos/example3.png",
            avatar: "https://tdesign.gtimg.com/mobile/demos/avatar3.png",
            author: "旅行者",
          },
        ],
      },

      {
        id: 3,
        title: "粤语歇后语大赛",
        enTitle: "Speech",
        sub: "8千个作品已参赛",
        desc: "用粤语展示你的创作，分享你的情感。",
        status: "unactive",
        videoList: [
          {
            cover: "https://tdesign.gtimg.com/mobile/demos/example2.png",
            avatar: "https://tdesign.gtimg.com/mobile/demos/avatar2.png",
            author: "开发者",
          },
        ],
      },
    ],
  },

  timer: null as any,

  onLoad() {
    this.syncTheme();
    this.startDescCycle();
    this.updateVisibleTabs();
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
    const trackCount = this.data.tracks.length;
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
    const trackCount = this.data.tracks.length;
    const current = this.data.currentIndex;
    const prevIndex = (current - 1 + trackCount) % trackCount;
    const nextIndex = (current + 1) % trackCount;

    this.setData({
      visibleTabs: [
        {
          ...this.data.tracks[prevIndex],
          _position: "prev",
          _originalIndex: prevIndex,
        },
        {
          ...this.data.tracks[current],
          _position: "current",
          _originalIndex: current,
        },
        {
          ...this.data.tracks[nextIndex],
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
      url: `/pages/tracks/tracks?type=${itemId}`,
    });
  },

  onAllTracks() {
    this.setData({ allTracksPopupVisible: true });
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
      url: `/pages/post/post?tag=${itemId}`,
    });
  },
  onShowDetails(e) {
    const itemId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/tracks/tracks?id=${id}`,
    });
  },
});

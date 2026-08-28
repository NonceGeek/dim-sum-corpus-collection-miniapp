import { formatDate } from "../../utils/date";
import {
  isLoggedIn,
  navigateToProtectedPage,
  promptLogin,
} from "../../utils/auth";
import request from "../../utils/http";
import { fetchQuery } from "../../utils/query-cache";
import { showCommonDialog } from "../../utils/common-dialog";

interface ITrack {
  id: string;
  title: string;
  description: string;
  displayTitle?: string;
  displayDescription?: string;
  bannerUrl: string;
  status: string;
  startsAt: string;
  endsAt: string;
  submissionCount: number;
}
const TITLE_ARRAY = [
  {
    title: "粤语唔止一种讲法",
    subtitle: "欢迎所有野生创作",
  },
  {
    title: "15种民间表达",
    subtitle: "欢迎你用粤语重新定义世界",
  },
  {
    title: "粤语唔止一种讲法",
    subtitle: "欢迎所有野生创作",
  },
  {
    title: "收集民间灵魂",
    subtitle: "欢迎乱入粤语世界",
  },
  {
    title: "万千讲法",
    subtitle: "皆是人间烟火",
  },
  {
    title: "字有乡音",
    subtitle: "话有来处",
  },
  {
    title: "让正在消失的表达",
    subtitle: "重新被听见",
  },
  {
    title: "收录民间癫话",
    subtitle: "欢迎对号入座",
  },
  {
    title: "15种粤语生存方式",
    subtitle: "欢迎唔被定义嘅你",
  },
  {
    title: "15种人间声气",
    subtitle: "欢迎你留下讲法",
  },
  {
    title: "15种民间声气",
    subtitle: "欢迎唔被定义嘅你",
  },
  {
    title: "收录民间声气",
    subtitle: "等你发声",
  },
  {
    title: "你把声",
    subtitle: "值得被听见",
  },
];

const getRandomTitle = () => {
  const index = Math.floor(Math.random() * TITLE_ARRAY.length);
  return TITLE_ARRAY[index];
};

const truncateText = (text = "", maxLength: number) => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
};

const formatTrack = (item: any) => {
  const requiredTypes = item.mediaRequirements?.requiredTypes || [];
  const requiresVideo = requiredTypes.includes("video");
  const requiresAudio = requiredTypes.includes("audio");
  const requiresImage = requiredTypes.includes("image");

  return {
    ...item,
    displayTitleFull: truncateText(item.title, 35),
    displayTitle: truncateText(item.title, 8),
    displayDescription: truncateText(item.description, 100),
    displayDescriptionFull: truncateText(item.description, 100),
    status: item.endsAt > new Date().toISOString() ? "active" : "unactive",
    startsAt: formatDate(item.startsAt, "YYYY-MM-DD"),
    endsAt: formatDate(item.endsAt, "YYYY-MM-DD"),
    requiresVideo,
    requiresAudio,
    requiresImage,
    hasMediaReq: requiresVideo || requiresAudio || requiresImage,
  };
};

Page({
  data: {
    currentTheme: "light",
    bannerTitle: "",
    bannerSubtitle: "",
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
    allTracksSkeletons: [0, 1],
    joinConsentPopupVisible: false,
    joinConsentActivityId: "",
    shouldResumeJoin: false,
  },

  timer: null as any,

  async onLoad(options: any = {}) {
    this.setData({
      joinConsentActivityId: options.joinActivityId || "",
      shouldResumeJoin: Boolean(options.joinActivityId),
    });
    this.syncTheme();
    this.updateBannerTitle();
    this.startDescCycle();

    await this.loadTopTracks();
  },

  updateBannerTitle() {
    const bannerTitle = getRandomTitle();
    this.setData({
      bannerTitle: bannerTitle.title,
      bannerSubtitle: bannerTitle.subtitle,
    });
  },

  async loadTopTracks(options: { force?: boolean } = {}) {
    try {
      const tracks = await fetchQuery({
        queryKey: ["featured", "top-tracks"],
        force: options.force,
        queryFn: async () => {
          wx.showLoading({ title: "加载中..." });
          try {
            const { items = [] } = await request("/activities");
            return items.map(formatTrack);
          } finally {
            wx.hideLoading();
          }
        },
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

  async onPullDownRefresh() {
    try {
      await this.loadTopTracks({ force: true });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  onShow() {
    this.syncTheme();
    if (!this.data.shouldResumeJoin) return;

    const shouldOpenJoinConsent =
      Boolean(this.data.joinConsentActivityId) && isLoggedIn();
    this.setData({
      shouldResumeJoin: false,
      ...(shouldOpenJoinConsent ? { joinConsentPopupVisible: true } : {}),
    });
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
    navigateToProtectedPage(
      "/pages/mine/mine",
      "登录后才能查看我的作品，当前仍可继续浏览精选内容。",
    );
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
    if (!isLoggedIn()) {
      promptLogin(
        `/pages/featured/featured?joinActivityId=${encodeURIComponent(itemId)}`,
        {
          content: "登录后才能投稿，当前仍可继续浏览精选内容。",
          returnToPrevious: true,
          onConfirm: () =>
            this.setData({
              joinConsentActivityId: itemId,
              shouldResumeJoin: true,
            }),
        },
      );
      return;
    }

    this.setData({
      joinConsentActivityId: itemId,
      joinConsentPopupVisible: true,
    });
  },

  onJoinConsentClose() {
    this.setData({ joinConsentPopupVisible: false });
  },

  onJoinConsentComplete(e: WechatMiniprogram.CustomEvent) {
    const { activityId, questionnaireJourneyId } = e.detail;
    this.setData({ joinConsentPopupVisible: false });
    wx.navigateTo({
      url:
        `/pages/post/post?tag=${encodeURIComponent(activityId)}&mode=edit` +
        (questionnaireJourneyId
          ? `&questionnaireJourneyId=${encodeURIComponent(questionnaireJourneyId)}`
          : ""),
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
      const { allTracksPage, allTracks } = this.data;
      const pageSize = 10;

      const res = await request(
        `/activities?page=${allTracksPage}&pageSize=${pageSize}&includeExpired=true`,
      );

      const items = (res.items || []).map(formatTrack);

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
      this.setData(
        {
          allTracksLoading: false,
        },
        () => {
          this.loadNextPageIfPopupListNotScrollable();
        },
      );
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
  onClickTrack(e: any) {
    const trackId = e.currentTarget.dataset.id;
    const timeStatus = e.currentTarget.dataset.timestatus;
    if (timeStatus === "not_started") {
      showCommonDialog(this, {
        title: "投稿还未开始",
        content: "等阵先啦～",
      });
      return;
    } else {
      wx.navigateTo({
        url: `/pages/tracks/tracks?id=${trackId}`,
      });
    }
  },
});

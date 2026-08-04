const FALLBACK_IMAGE_RATIO = 1.25;
const BASE_IMAGE_WIDTH = 330;
const BASE_TITLE_LINE_HEIGHT = 40;
const BASE_FOOTER_HEIGHT = 84;
const BASE_CARD_GAP = 12;

Component({
  properties: {
    items: {
      type: Array,
      value: [],
    },
    loading: {
      type: Boolean,
      value: false,
    },
    appendLoading: {
      type: Boolean,
      value: false,
    },
    showStatus: {
      type: Boolean,
      value: false,
    },
    showPlayBadge: {
      type: Boolean,
      value: false,
    },
    showFeatured: { type: Boolean, value: false },
  },
  data: {
    leftItems: [],
    rightItems: [],
    leftHeight: 0,
    rightHeight: 0,
    _layoutQueue: [],
    _layoutTimer: null as any,
  },
  observers: {
    items(items: any[]) {
      const safeItems = Array.isArray(items) ? items : [];
      (this as any)._currentItems = safeItems;
      this.refreshColumns(safeItems);
      this.prefetchImageInfo(safeItems);
    },
  },
  lifetimes: {
    attached() {
      this.refreshColumns((this.data.items as any[]) || []);
    },
  },

  methods: {
    refreshColumns(items: any[]) {
      const cache = (this as any)._imageRatioCache || {};

      const leftItems: any[] = [];
      const rightItems: any[] = [];

      let leftHeight = 0;
      let rightHeight = 0;

      items.forEach((item, index) => {
        const decoratedItem = {
          ...item,
          _wfIndex: index,
          _isAudioOnly: this.isAudioOnlyMedia(item),
          _badgeCount: this.getBadgeCount(item),
          displayViewCount: this.formatViewCount(item?.viewCount),
        };

        const height = this.getEstimatedItemHeight(item, cache);

        if (leftHeight <= rightHeight) {
          leftItems.push(decoratedItem);
          leftHeight += height;
        } else {
          rightItems.push(decoratedItem);
          rightHeight += height;
        }
      });

      this.setData({
        leftItems: leftItems as never[],
        rightItems: rightItems as never[],
        leftHeight,
        rightHeight,
      });
    },

    formatViewCount(viewCount: number | string) {
      const count = Number(viewCount) || 0;

      if (count >= 10000) {
        return `${Math.floor(count / 1000)}K+`;
      }

      if (count >= 1000) {
        return count.toLocaleString("en-US");
      }

      return `${count}`;
    },

    isAudioOnlyMedia(item: any) {
      const media = Array.isArray(item?.media) ? item.media : [];
      return media.length > 0 && media.every((file) => file?.type === "audio");
    },

    getEstimatedItemHeight(item: any, cache?: any) {
      const isAudioOnly = this.isAudioOnlyMedia(item);
      const imageRatio = isAudioOnly
        ? 0
        : cache?.[item?.coverUrl] || this.getImageRatio(item?.coverUrl);

      const title = item?.title || "";

      // ❗升级：按字符 + 中英文混合估算
      const titleLength = title.replace(/[^\x00-\xff]/g, "aa").length;
      const titleLines = Math.max(1, Math.ceil(titleLength / 14));

      const titleHeight = titleLines * BASE_TITLE_LINE_HEIGHT;
      const badgeCount = this.getBadgeCount(item);
      const badgeHeight =
        isAudioOnly && badgeCount > 0 ? badgeCount * 52 + 12 : 0;

      return (
        imageRatio * BASE_IMAGE_WIDTH +
        titleHeight +
        BASE_FOOTER_HEIGHT +
        badgeHeight +
        BASE_CARD_GAP
      );
    },

    getBadgeCount(item: any) {
      let count = 0;
      const reviewStatus = item?.reviewStatus;
      const awardStatus = item?.awardStatus;
      const showStatus = this.data.showStatus;

      if (
        showStatus &&
        (reviewStatus === "pending_review" ||
          reviewStatus === "ai_reviewing" ||
          reviewStatus === "review_needed" ||
          reviewStatus === "rejected")
      ) {
        count += 1;
      }

      if (
        showStatus &&
        reviewStatus === "approved" &&
        (awardStatus === "awarded" ||
          awardStatus === "claimed" ||
          awardStatus === "expired")
      ) {
        count += 1;
      }

      if (
        this.data.showFeatured &&
        item?.isFeatured &&
        reviewStatus === "approved"
      ) {
        count += 1;
      }

      return count;
    },

    getImageRatio(url: string) {
      const cache = (this as any)._imageRatioCache || {};
      return cache[url] ?? FALLBACK_IMAGE_RATIO;
    },

    prefetchImageInfo(items: any[]) {
      const cache = ((this as any)._imageRatioCache ||= {});
      const loading = ((this as any)._imageRatioLoading ||= new Set());

      const urlsToFetch = items
        .map((i) => i?.coverUrl)
        .filter((url) => url && !cache[url] && !loading.has(url));

      if (urlsToFetch.length === 0) return;

      let pending = urlsToFetch.length;

      urlsToFetch.forEach((url) => {
        loading.add(url);

        wx.getImageInfo({
          src: url,
          success: (res) => {
            cache[url] =
              res?.width && res?.height
                ? res.height / res.width
                : FALLBACK_IMAGE_RATIO;
          },
          fail: () => {
            cache[url] = FALLBACK_IMAGE_RATIO;
          },
          complete: () => {
            loading.delete(url);
            pending--;
            if (pending === 0) {
              this.refreshColumns(
                (this as any)._currentItems || this.data.items || [],
              );
            }
          },
        });
      });
    },
    onItemTap(e: any) {
      const { id, index } = e.currentTarget.dataset;
      this.triggerEvent("itemtap", { id, index, item: this.data.items[index] });
    },
  },
});

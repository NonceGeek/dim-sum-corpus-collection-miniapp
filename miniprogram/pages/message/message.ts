import request from "../../utils/http";

const getIcon = (type) => {
  const obj = {
    系统提示: "system-messages",
    活动通知: "loudspeaker",
    中奖信息: "gift",
    审核信息: "chat-bubble-error",
  };
  return obj[type as keyof typeof obj];
};

Page({
  data: {
    currentTheme: "light",

    messages: [],

    page: 1,
    pageSize: 10,

    loading: false,
    noMore: false,
    showButton: false,
  },

  async onLoad() {
    this.syncTheme();
    await this.loadMessages();
  },

  async loadMessages() {
    if (this.data.loading || this.data.noMore) return;

    this.setData({
      loading: true,
    });

    try {
      wx.showLoading({
        title: "加载中...",
      });
      const { page, pageSize, messages: oldMessages } = this.data;

      const res = await request(`/messages?page=${page}&pageSize=${pageSize}`);
      wx.hideLoading();
      const {
        items,
        pagination: { total },
      } = res;
      const list = (items || []).map((item) => ({
        ...item,
        icon: getIcon(item.type),
      }));

      const noMore = list.length < 10;
      const findUnread = list.some((item) => !item.isRead);

      this.setData({
        messages: page === 1 ? list : [...oldMessages, ...list],
        noMore,
        showButton: findUnread,
      });
    } catch (err) {
      console.error("loadMessages error", err);
    } finally {
      this.setData({
        loading: false,
      });
    }
  },
  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  async onMessageTap(e: any) {
    const { id, workid, type } = e.currentTarget.dataset;
    console.log(e.currentTarget.dataset);

    try {
      const res = await request(`/messages/${id}/read`, {
        method: "PATCH",
      });
      if (res.isRead && res.id === id) {
        const messages = this.data.messages.map((item: any) => {
          if (item.id === id) {
            return { ...item, isRead: true };
          }
          return item;
        });
        if (workid) {
          if (type === "中奖信息") {
            wx.navigateTo({
              url: `/pages/mine/mine`,
            });
          } else if (type === "审核信息") {
            wx.navigateTo({
              url: `/pages/post/post?id=${workid}&mode=view`,
            });
          }
        }
        this.setData({ messages });
      } else {
        wx.showModal({
          title: "错误提示",
          content: err.error + "，清稍后再试",
          showCancel: false,
        });
      }
    } catch (err) {
      console.log("消息已读接口报错：", err);
      wx.showModal({
        title: "错误提示",
        content: err.error + "，清稍后再试",
        showCancel: false,
      });
    }
  },
  onReachBottom() {
    if (this.data.loading || this.data.noMore) {
      return;
    }

    this.setData({
      page: this.data.page + 1,
    });

    this.loadMessages();
  },
  onPullDownRefresh() {
    this.setData({
      page: 1,
      noMore: false,
      messages: [],
    });

    this.loadMessages().finally(() => {
      wx.stopPullDownRefresh();
    });
  },
  async onReadAll() {
    try {
      const res = await request("/messages/read-all", {
        method: "PATCH",
      });
      if (res.unreadNotificationCount === 0) {
        wx.showToast({ title: "标记成功！", duration: 2000, icon: "none" });
        const messages = this.data.messages.map((item: any) => {
          return { ...item, isRead: true };
        });
        this.setData({ messages });
      } else {
        wx.showModal({
          title: "错误提示",
          content: "标记失败，请稍后重试！",
          showCancel: false,
        });
      }
    } catch (err) {
      console.log("将所有消息标记为已读出错：", err);
      wx.showModal({
        title: "错误提示",
        content: err.error + "，请稍后重试",
        showCancel: false,
      });
    }
  },
});

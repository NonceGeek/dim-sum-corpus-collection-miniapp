import request from "../../utils/http";
import {
  fetchQuery,
  getCurrentUserQueryKey,
  invalidateQuery,
} from "../../utils/query-cache";
import { showCommonDialog } from "../../utils/common-dialog";

const getMessagesQueryKey = () => ["message", "list", getCurrentUserQueryKey()];

const getIconColor = (type) => {
  const obj = {
    系统提示: "system-messages",
    活动通知: "loudspeaker",
    中奖信息: "gift",
    审核信息: "chat-bubble-error",
  };
  const colorjson = {
    "system-messages": "#4a7cf3",
    loudspeaker: "#10b981",
    gift: "#7c5cff",
    "chat-bubble-error": "#f59e0b",
  };
  const icon = obj[type as keyof typeof obj];
  return { icon, color: colorjson[icon] };
};

Page({
  data: {
    currentTheme: "light",

    messages: [],

    page: 1,
    pageSize: 10,

    loading: false,
    isInitialLoading: true,
    noMore: false,
    showButton: false,
    initialSkeletons: [0, 1, 2, 3],
    appendSkeletons: [0, 1],
  },

  async onLoad() {
    this.syncTheme();
    await this.loadMessages();
  },

  async loadMessages(options: { force?: boolean } = {}) {
    if (this.data.loading || this.data.noMore) return;

    const isInitialLoad =
      this.data.page === 1 && this.data.messages.length === 0;

    this.setData({
      loading: true,
      ...(isInitialLoad ? { isInitialLoading: true } : {}),
    });

    try {
      const { page, pageSize, messages: oldMessages } = this.data;

      const snapshot = await fetchQuery({
        queryKey: getMessagesQueryKey(),
        force: options.force || page > 1,
        queryFn: async () => {
          const res = await request(
            `/messages?page=${page}&pageSize=${pageSize}`,
          );
          const list = (res.items || []).map((item) => {
            const { icon, color } = getIconColor(item.type);
            return { ...item, icon, color };
          });
          const messages = page === 1 ? list : [...oldMessages, ...list];
          return {
            messages,
            page,
            noMore: list.length < pageSize,
            showButton: messages.some((item) => !item.isRead),
          };
        },
      });

      this.setData({
        messages: snapshot.messages,
        page: snapshot.page,
        noMore: snapshot.noMore,
        showButton: snapshot.showButton,
      });
    } catch (err) {
      console.error("loadMessages error", err);
      showCommonDialog(this, {
        title: "提示",
        content: err.errMsg || "请求出错",
      });
    } finally {
      this.setData({
        loading: false,
        ...(isInitialLoad ? { isInitialLoading: false } : {}),
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
          if (type === "审核信息" || type === "中奖信息") {
            wx.navigateTo({
              url: `/pages/post/post?id=${workid}&mode=view`,
            });
          }
        }
        this.setData({ messages });
        invalidateQuery(getMessagesQueryKey());
      } else {
        showCommonDialog(this, {
          title: "错误提示",
          content: "消息状态更新失败，请稍后再试",
        });
      }
    } catch (err) {
      console.log("消息已读接口报错：", err);
      showCommonDialog(this, {
        title: "错误提示",
        content: err.error || err.errMsg + "，清稍后再试",
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

    this.loadMessages({ force: true }).finally(() => {
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
        invalidateQuery(getMessagesQueryKey());
      } else {
        showCommonDialog(this, {
          title: "错误提示",
          content: "标记失败，请稍后重试！",
        });
      }
    } catch (err) {
      console.log("将所有消息标记为已读出错：", err);
      showCommonDialog(this, {
        title: "错误提示",
        content: err.error || err.errMsg + "，请稍后重试",
      });
    }
  },
});

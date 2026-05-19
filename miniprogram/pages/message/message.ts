import request from "../../utils/http";

const MOCK_MESSAGES = [
  {
    id: 1,
    icon: "🎉",
    title: "恭喜！您的作品获奖了",
    content:
      "您在「听见广州」活动中获得二等奖，奖金 500 元，请尽快填写领奖信息。",
    time: "今天 10:30",
    read: false,
  },
  {
    id: 2,
    icon: "📢",
    title: "活动通知",
    content: "「粤港澳粤语大赛」已开始征集，点击查看详情并上传您的作品。",
    time: "昨天 15:20",
    read: false,
  },
  {
    id: 3,
    icon: "💬",
    title: "系统提示",
    content: "您的账号已完成实名认证，感谢您的配合。",
    time: "3天前",
    read: true,
  },
];

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
      const { page, pageSize, messages: oldMessages } = this.data;

      const res = await request(`/message?page=${page}&pageSize=${pageSize}`);

      const {
        items,
        pagination: { total },
      } = res;
      const list = (items || []).map((item) => ({
        ...item,
        icon: getIcon(item.type),
      }));

      const noMore = list.length < 10;

      this.setData({
        messages: page === 1 ? list : [...oldMessages, ...list],

        noMore,
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

  onMessageTap(e: any) {
    const { id, workId } = e.currentTarget.dataset;
    // TODO 后端请求标记为已读
    const messages = this.data.messages.map((item: any) => {
      if (item.id === id) {
        return { ...item, read: true };
      }
      return item;
    });
    if (workId) {
      wx.navigateTo({
        url: `/pages/post/post?id=${workId}?mode=view`,
      });
    }
    this.setData({ messages });
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
});

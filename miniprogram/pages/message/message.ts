Page({
  data: {
    currentTheme: "light",
    messages: [
      {
        id: 1,
        icon: "🎉",
        title: "恭喜！您的作品获奖了",
        content: "您在「听见广州」活动中获得二等奖，奖金 500 元，请尽快填写领奖信息。",
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
    ],
  },

  onMessageTap(e: any) {
    const { id } = e.currentTarget.dataset;
    const messages = this.data.messages.map((item: any) => {
      if (item.id === id) {
        return { ...item, read: true };
      }
      return item;
    });
    this.setData({ messages });
  },
});
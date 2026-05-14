// pages/upload/upload.ts
Page({
  data: {
    mode: "edit",
    currentTheme: "light",
    selectedType: "",
    title: "",
    content: "",
    imageList: [],
    selectedTopics: [],
    canPublish: false,
    pickerVisible: false,
    pickerValue: [],
    typeOptions: [
      { label: "用语", value: "用语" },
      { label: "诗歌", value: "诗歌" },
      { label: "故事", value: "故事" },
      { label: "标语", value: "标语" },
      { label: "地名解说", value: "地名解说" },
      { label: "歇后语", value: "歇后语" },
    ],
    topicPopupVisible: false,
    topicSearchKeyword: "",
    filteredTopicList: [],
    availableTopics: [
      "日常用语",
      "方言特色",
      "网络流行语",
      "传统文化",
      "诗词歌赋",
      "民间故事",
      "历史典故",
      "地方美食",
      "旅游攻略",
      "城市印象",
      "乡土情怀",
      "成语俗语",
      "趣味歇后语",
      "经典名句",
      "原创作品",
    ],
    // 录音弹窗
    recordPopupVisible: false,
    recording: false,
    recordTime: 0,
    recordTimer: null as number | null,
    touchStartTime: 0,
    touchStartTimer: null as number | null,
    touchStartX: 0,
    touchStartY: 0,
    justFinishedRecording: false,
    audioUrl: "",
    audioDuration: "",
  },

  onLoad() {
    this.syncTheme();
  },

  onShow() {
    this.syncTheme();
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  // 显示类型选择器
  onShowTypePicker() {
    this.setData({ pickerVisible: true });
  },

  // Picker 关闭
  onPickerVisibleChange(e: any) {
    this.setData({ pickerVisible: e.detail.visible });
  },

  // 类型选择确认
  onTypeChange(e: any) {
    const { value, label } = e.detail;
    if (value && value.length > 0) {
      this.setData({
        selectedType: label[0],
        pickerValue: value,
        pickerVisible: false,
      });
      this.checkCanPublish();
    }
  },

  // 类型选择取消
  onPickerCancel() {
    this.setData({ pickerVisible: false });
  },

  // 标题输入
  onTitleInput(e: any) {
    const title = e.detail.value;
    this.setData({ title });
    this.checkCanPublish();
  },

  // 内容输入
  onContentInput(e: any) {
    const content = e.detail.value;
    this.setData({ content });
    this.checkCanPublish();
  },

  // 选择图片
  onChooseImage() {
    const maxCount = 9 - this.data.imageList.length;
    wx.chooseMedia({
      count: maxCount,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const tempFiles = res.tempFiles.map((file: any) => file.tempFilePath);
        this.setData({
          imageList: [...this.data.imageList, ...tempFiles],
        });
        this.checkCanPublish();
      },
    });
  },

  // 删除图片
  onDeleteImage(e: any) {
    const index = e.currentTarget.dataset.index;
    const imageList = this.data.imageList.filter((_, i) => i !== index);
    this.setData({ imageList });
    this.checkCanPublish();
  },

  // 添加话题
  onAddTopic() {
    this.setData({
      topicPopupVisible: true,
      topicSearchKeyword: "",
      filteredTopicList: this.data.availableTopics,
    });
  },

  // 关闭话题弹窗
  onTopicPopupClose() {
    this.setData({ topicPopupVisible: false });
  },

  // 话题搜索
  onTopicSearch(e: any) {
    const keyword = e.detail.value;
    this.setData({ topicSearchKeyword: keyword });
    this.filterTopics(keyword);
  },

  onTopicSearchSubmit(e: any) {
    const keyword = e.detail.value;
    this.filterTopics(keyword);
  },

  // 过滤话题列表
  filterTopics(keyword: string) {
    const filtered = this.data.availableTopics.filter((topic) =>
      topic.toLowerCase().includes(keyword.toLowerCase()),
    );
    this.setData({ filteredTopicList: filtered });
  },

  // 选择话题
  onSelectTopic(e: any) {
    const topic = e.currentTarget.dataset.topic;
    const index = this.data.selectedTopics.indexOf(topic);
    if (index === -1) {
      // 添加话题
      if (this.data.selectedTopics.length >= 5) {
        wx.showToast({ title: "最多添加5个话题", icon: "none" });
        return;
      }
      this.setData({
        selectedTopics: [...this.data.selectedTopics, topic],
      });
    } else {
      // 移除话题
      this.setData({
        selectedTopics: this.data.selectedTopics.filter((_, i) => i !== index),
      });
    }
  },

  // 移除话题
  onRemoveTopic(e: any) {
    const index = e.currentTarget.dataset.index;
    const selectedTopics = this.data.selectedTopics.filter(
      (_, i) => i !== index,
    );
    this.setData({ selectedTopics });
  },

  // 检查是否可以发布
  checkCanPublish() {
    const hasContent =
      this.data.selectedType &&
      (this.data.title.trim() ||
        this.data.content.trim() ||
        this.data.imageList.length > 0);
    this.setData({ canPublish: hasContent });
  },

  // 取消发布
  onCancel() {
    if (
      this.data.title ||
      this.data.content ||
      this.data.imageList.length > 0
    ) {
      wx.showModal({
        title: "提示",
        content: "确定要放弃编辑吗？",
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack();
          }
        },
      });
    } else {
      wx.navigateBack();
    }
  },

  // 导航栏返回
  onNavbarBack() {
    this.onCancel();
  },

  // 发布内容
  onPublish() {
    if (!this.data.canPublish) return;

    const publishData = {
      type: this.data.selectedType,
      title: this.data.title,
      content: this.data.content,
      images: this.data.imageList,
      topics: this.data.selectedTopics,
    };

    console.log("发布内容：", publishData);

    wx.showToast({ title: "发布成功", icon: "success" });

    // TODO: 调用发布 API
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },

  // 切换录音弹窗
  onToggleRecordPopup() {
    this.setData({ recordPopupVisible: true });
  },

  // 关闭录音弹窗
  onRecordPopupClose(e: any) {
    if (e.detail.visible === false) {
      // 如果正在录音，先停止
      if (this.data.recording) {
        this.onStopRecordInternal();
      }
      this.setData({ recordPopupVisible: false });
    }
  },

  // 开始录音
  onStartRecord(e: any) {
    const touch = e.touches[0];

    this.setData({
      touchStartTime: Date.now(),
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
    });

    if (this.data.touchStartTimer) {
      clearTimeout(this.data.touchStartTimer);
    }

    const timer = setTimeout(() => {
      this.checkAndStartRecord();
    }, 200) as unknown as number;

    this.setData({ touchStartTimer: timer });
  },

  // 录音按钮触摸移动，取消录音
  onRecordTouchMove(e: any) {
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - this.data.touchStartX);
    const deltaY = Math.abs(touch.clientY - this.data.touchStartY);

    if (deltaX > 15 || deltaY > 15) {
      if (this.data.touchStartTimer) {
        clearTimeout(this.data.touchStartTimer);
        this.setData({ touchStartTimer: null });
      }

      if (this.data.recording) {
        const recorderManager = (this as any).recorderManager;
        if (recorderManager) {
          recorderManager.stop();
        }
        this.setData({
          recording: false,
          recordTime: 0,
        });
        if (this.data.recordTimer) {
          clearInterval(this.data.recordTimer);
          this.setData({ recordTimer: null });
        }
        wx.hideToast();
      }
    }
  },

  // 停止录音（由 touchend 触发）
  onStopRecord(e: any) {
    if (this.data.touchStartTimer) {
      clearTimeout(this.data.touchStartTimer);
      this.setData({ touchStartTimer: null });
    }

    if (!this.data.recording) return;

    this.onStopRecordInternal();
  },

  // 内部停止录音逻辑
  onStopRecordInternal() {
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }

    this.setData({
      recording: false,
      recordTime: 0,
      recordTimer: null,
    });

    const recorderManager = (this as any).recorderManager;
    if (recorderManager) {
      recorderManager.stop();
    }

    wx.hideToast();
    this.setData({ justFinishedRecording: true });
    setTimeout(() => {
      this.setData({ justFinishedRecording: false });
    }, 300);
  },

  // 检查并开始录音
  checkAndStartRecord() {
    wx.getSetting({
      success: (res) => {
        if (!res.authSetting["scope.record"]) {
          wx.authorize({
            scope: "scope.record",
            success: () => {
              this.doStartRecord();
            },
            fail: () => {
              wx.showModal({
                title: "提示",
                content: "需要录音权限才能使用此功能",
                showCancel: false,
              });
            },
          });
        } else {
          this.doStartRecord();
        }
      },
    });
  },

  // 真正开始录音
  doStartRecord() {
    this.setData({
      recording: true,
      recordTime: 0,
    });

    const timer = setInterval(() => {
      this.setData({
        recordTime: this.data.recordTime + 1,
      });
    }, 1000);
    this.setData({ recordTimer: timer });

    const recorderManager = wx.getRecorderManager();
    recorderManager.start({
      format: "mp3",
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 128000,
    });

    recorderManager.onStop((res) => {
      console.log("录音完成", res);
      const { tempFilePath, duration } = res;
      const durationSec = Math.floor(duration / 1000);
      this.setData({
        audioUrl: tempFilePath,
        audioDuration: `${durationSec}秒`,
      });
      wx.showToast({
        title: `录音完成 ${durationSec}秒`,
        icon: "success",
        duration: 1500,
      });
    });

    (this as any).recorderManager = recorderManager;

    wx.showToast({
      title: "正在录音...",
      icon: "loading",
      duration: 1000,
    });
  },

  // 播放录音
  onPlayAudio() {
    const { audioUrl } = this.data;
    if (!audioUrl) {
      wx.showToast({ title: "暂无录音", icon: "none" });
      return;
    }

    const backgroundAudioManager = wx.getBackgroundAudioManager();
    if (backgroundAudioManager.src) {
      backgroundAudioManager.stop();
    }

    backgroundAudioManager.title = "录音播放";
    backgroundAudioManager.epname = "录音";
    backgroundAudioManager.singer = "用户";
    backgroundAudioManager.coverImgUrl = "";

    backgroundAudioManager.onPlay(() => {
      wx.showToast({ title: "正在播放...", icon: "loading", duration: 1000 });
    });

    backgroundAudioManager.onError((err) => {
      wx.showToast({
        title: `播放错误: ${err.errCode}`,
        icon: "none",
        duration: 3000,
      });
    });

    backgroundAudioManager.src = audioUrl;
  },

  // 删除录音
  onDeleteAudio() {
    wx.showModal({
      title: "确认删除",
      content: "确定要删除录音吗？",
      success: (res) => {
        if (res.confirm) {
          this.setData({
            audioUrl: "",
            audioDuration: "",
          });
        }
      },
    });
  },
});

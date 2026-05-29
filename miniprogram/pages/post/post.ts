import request from "../../utils/http";
import ENV from "../../config/setting";
import { formatDate } from "../../utils/date";
// pages/upload/upload.ts
Page({
  data: {
    mode: "",
    currentTheme: "light",
    post: {} as any,
    postActionsVisible: false,
    selectedType: "",
    selectedActivity: null as { id: string; title: string } | null,
    activityPopupVisible: false,
    activityList: [] as { id: string; title: string }[],
    activityPage: 1,
    activityNoMore: false,
    activityLoading: false,
    activityKeyword: "",
    title: "",
    content: "",
    imageList: [],
    selectedTopics: [] as string[],
    selectedTopicMap: {} as Record<string, boolean>,
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
    filteredTopicList: [] as string[],
    // TODO
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
    recordTimer: null as any,
    touchStartTime: 0,
    touchStartTimer: null as number | null,
    touchStartX: 0,
    touchStartY: 0,
    justFinishedRecording: false,
    audioUrl: "",
    audioDuration: 0,
    // 滑动悬停目标：'' | 'cancel' | 'asr'
    hoverTarget: "",
    recordMode: "normal" as "normal" | "discard" | "asr",
    // 转文字结果弹窗
    asrPopupVisible: false,
    asrText: "",
    pendingAudioUrl: "",
    pendingAudioDuration: 0,
  },
  recorderManager: null as any,

  async onLoad(options) {
    const { tag, id, mode } = options;
    const userInfo = wx.getStorageSync("userInfo");
    this.syncTheme();

    this.setData(
      {
        mode: mode || "edit",
        userId: userInfo.id,
      },
      async () => {
        console.log("this.:", this.data.mode);
        tag && (await this.loadTrack(tag));
        id && (await this.loadPost(id));
        const { mode } = this.data;
        let view = {};
        console.log("mode:", mode, this.data.mode);
        if (mode === "view") {
          view = await request(`/works/${id}/view`, { method: "POST" });
          console.log("view:", view);
        }
        this.setData({ ...(view ? { view: view.viewCount } : {}) });
      },
    );

    this.recorderManager = wx.getRecorderManager();
    this.handleRecordStop = this.handleRecordStop.bind(this);
    this.recorderManager.onStop(this.handleRecordStop);
  },
  onUnload() {
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }
    if (this.recorderManager) {
      this.recorderManager.stop();
    }
  },
  async loadTrack(id: string) {
    try {
      const track = await request(`/activities/${id}`);
      this.setData({
        ...(track.submissionTypes.length
          ? {
              typeOptions: track.submissionTypes.map((t) => ({
                label: t,
                value: t,
              })),
            }
          : {}),
        selectedType:
          track.submissionTypes.length === 1
            ? track.submissionTypes[0]
            : this.data.selectedType,
        selectedActivity: track,
      });
    } catch (err: any) {
      console.log("获取活动数据失败", err);
      wx.showModal({
        title: "获取活动数据失败",
        content: err.error + "，请稍后重试",
        showCancel: false,
      });
    }
  },

  async loadPost(id: string) {
    try {
      const res = await request(`/submissions/${id}`);
      // TODO：缺参加的活动
      this.setData({
        post: res,

        title: res.title,
        content: res.intro,
        imageList: res.media.filter(
          (m) => m.type === "video" || m.type === "image",
        ),
        selectedTopics: res.tags,
        selectedTopicMap: (res.tags || []).reduce(
          (map: Record<string, boolean>, topic: string) => {
            map[topic] = true;
            return map;
          },
          {},
        ),
        audioUrl: res.media.find((m) => m.type === "audio")?.url || "",
        audioDuration:
          res.media.find((m) => m.type === "audio")?.durationSec || 0,
      });
    } catch (err: any) {
      console.log("获取投稿数据失败：", err);
      wx.showModal({
        title: "获取投稿数据失败",
        content: err.error + "，请稍后再试",
        showCancel: false,
      });
    }
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

  compressImageFile(filePath: string) {
    return new Promise<string>((resolve) => {
      wx.compressImage({
        src: filePath,
        quality: 80,
        success: (res) => resolve(res.tempFilePath),
        fail: () => resolve(filePath),
      });
    });
  },

  compressVideoFile(filePath: string) {
    return new Promise<string>((resolve) => {
      wx.compressVideo({
        src: filePath,
        quality: "medium",
        bitrate: 1000,
        fps: 24,
        resolution: 0.8,
        success: (res) => resolve(res.tempFilePath),
        fail: () => resolve(filePath),
      });
    });
  },

  async compressMediaFile(file: any) {
    const compressedPath =
      file.type === "video"
        ? await this.compressVideoFile(file.url)
        : await this.compressImageFile(file.url);

    return {
      ...file,
      url: compressedPath,
    };
  },

  getFileExtension(filePath: string, fileType: string) {
    const path = filePath.split("?")[0];
    const ext = path.includes(".") ? path.split(".").pop() : "";
    return ext || (fileType === "video" ? "mp4" : "jpg");
  },

  uploadMediaFile(
    file: any,
    token: string,
    dateStr: string,
    timestamp: number,
  ) {
    return new Promise((resolve, reject) => {
      const uploadPath = file.url;
      const ext = this.getFileExtension(uploadPath, file.type);

      wx.uploadFile({
        url: `${ENV.API_BASE_URL}/upload`,
        filePath: uploadPath,
        name: "file",
        formData: {
          fileName: `${dateStr}_corpus_collection_${file.type}_${timestamp}.${ext}`,
        },
        header: {
          Authorization: `Bearer ${token}`,
        },
        success: (res) => {
          let data: any = {};

          try {
            data = JSON.parse(res.data);
          } catch (e) {
            reject(new Error("返回数据解析失败"));
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(data?.error || "上传失败"));
            return;
          }

          resolve({
            ...file,
            url: data.url,
          });
        },
        fail: reject,
      });
    });
  },

  // 选择图片
  async onChooseImage() {
    const mediaRequirements =
      this.data.selectedActivity?.mediaRequirements || {};
    const images = mediaRequirements?.images || {};
    const audio = mediaRequirements?.audio || {};
    const video = mediaRequirements?.video || {};
    const maxDuration = (video.required && video.maxDurationSec) || 30;
    const mediaType =
      images.required && video.required
        ? ["image", "video"]
        : images.required
          ? ["image"]
          : video.required
            ? ["video", "image"]
            : ["video", "image"];
    const maxCount = 9 - this.data.imageList.length;

    wx.chooseMedia({
      count: maxCount,
      mediaType: mediaType as ("image" | "video")[],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      maxDuration: maxDuration,
      success: async (res) => {
        try {
          wx.showLoading({ title: "压缩中..." });

          const tempFiles = res.tempFiles.map((file: any) => ({
            url: file.tempFilePath,
            type: file.fileType === "video" ? "video" : "image",
            ...(file.fileType === "video"
              ? { durationSec: file.duration }
              : {}),
          }));
          const compressedFiles = await Promise.all(
            tempFiles.map((file) => this.compressMediaFile(file)),
          );

          wx.showLoading({ title: "上传中..." });

          const token = wx.getStorageSync("accessToken") || "";
          const timestamp = Date.now();
          const dateStr = formatDate(new Date(), "YYYYMMDD");
          const files = await Promise.all(
            compressedFiles.map((file) =>
              this.uploadMediaFile(file, token, dateStr, timestamp),
            ),
          );

          this.setData({
            imageList: [...this.data.imageList, ...files],
          });
          this.checkCanPublish();
        } catch (err: any) {
          wx.showModal({
            title: "上传失败",
            content: err?.message || "请稍后重试",
            showCancel: false,
          });
          console.error(err);
        } finally {
          wx.hideLoading();
        }
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

  // 打开活动选择弹窗
  onShowActivityPopup() {
    this.setData({
      activityPopupVisible: true,
      activityKeyword: "",
      activityList: [],
      activityPage: 1,
      activityNoMore: false,
    });
    this.loadActivityList();
  },

  // 关闭活动选择弹窗
  onActivityPopupClose() {
    this.setData({ activityPopupVisible: false });
  },

  // 加载活动列表
  async loadActivityList() {
    if (this.data.activityLoading || this.data.activityNoMore) return;
    this.setData({ activityLoading: true });
    try {
      const { activityPage, activityKeyword, activityList } = this.data;
      const keyword = activityKeyword
        ? `&keyword=${encodeURIComponent(activityKeyword)}`
        : "";
      const res = await request(
        `/activities?page=${activityPage}&pageSize=10${keyword}`,
      );
      const items = (res.items || []).map((item: any) => ({
        id: item.id,
        title: item.title,
      }));
      this.setData({
        activityList: activityPage === 1 ? items : [...activityList, ...items],
        activityNoMore: items.length < 10,
      });
    } catch (err) {
      console.error("加载活动列表失败", err);
    } finally {
      this.setData({ activityLoading: false });
    }
  },

  // 滚动到底部加载更多
  onActivityScrollToLower() {
    if (this.data.activityNoMore || this.data.activityLoading) return;
    this.setData({ activityPage: this.data.activityPage + 1 });
    this.loadActivityList();
  },

  // 关键词搜索（输入时实时触发）
  onActivitySearch(e: any) {
    const keyword = e.detail.value ?? "";
    this.setData({
      activityKeyword: keyword,
      activityList: [],
      activityPage: 1,
      activityNoMore: false,
    });
    this.loadActivityList();
  },

  // 选中活动
  onSelectActivity(e: any) {
    const { id, title } = e.currentTarget.dataset;

    this.setData(
      {
        selectedActivity: { id, title },
        activityPopupVisible: false,
      },
      async () => {
        await this.loadTrack(id);
      },
    );
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
  async onTopicSearch(e: any) {
    const keyword = e.detail.value;
    this.setData({
      topicSearchKeyword: keyword,
    });

    this.filterTopics(keyword);
  },

  onTopicSearchSubmit(e: any) {
    const keyword = e.detail.value;
    this.filterTopics(keyword);
  },

  // 过滤话题列表
  filterTopics(keyword: string) {
    const filtered = this.data.availableTopics.filter((topic) =>
      topic.includes(keyword),
    );
    this.setData({ filteredTopicList: filtered });
  },

  normalizeTopic(topic: string) {
    return (topic || "").trim().replace(/^#+/, "").trim();
  },

  // 手动添加话题
  onAddCustomTopic() {
    const topic = this.normalizeTopic(this.data.topicSearchKeyword);

    if (!topic) {
      wx.showToast({ title: "请输入标签", icon: "none" });
      return;
    }

    if (this.data.selectedTopics.includes(topic)) {
      wx.showToast({ title: "标签已添加", icon: "none" });
      return;
    }

    this.setData({
      selectedTopics: [...this.data.selectedTopics, topic],
      selectedTopicMap: {
        ...this.data.selectedTopicMap,
        [topic]: true,
      },
      topicSearchKeyword: "",
      filteredTopicList: this.data.availableTopics,
    });
  },

  // 选择话题
  onSelectTopic(e: any) {
    const topic = this.normalizeTopic(e.currentTarget.dataset.topic);

    const selectedTopics = [...this.data.selectedTopics];
    const selectedTopicMap = {
      ...this.data.selectedTopicMap,
    };

    if (selectedTopicMap[topic]) {
      delete selectedTopicMap[topic];

      this.setData({
        selectedTopics: selectedTopics.filter((t) => t !== topic),
        selectedTopicMap,
      });
    } else {
      selectedTopicMap[topic] = true;

      this.setData({
        selectedTopics: [...selectedTopics, topic],
        selectedTopicMap,
      });
    }
  },

  // 移除话题
  onRemoveTopic(e: any) {
    const index = e.currentTarget.dataset.index;
    const topic = this.data.selectedTopics[index];
    const selectedTopics = this.data.selectedTopics.filter(
      (_, i) => i !== index,
    );
    const selectedTopicMap = { ...this.data.selectedTopicMap };
    delete selectedTopicMap[topic];
    this.setData({ selectedTopics, selectedTopicMap });
  },

  // 检查是否可以发布
  checkCanPublish() {
    const {
      selectedActivity,
      selectedType,
      title,
      content,
      imageList,
      audioUrl,
      audioDuration,
    } = this.data;

    const { mediaRequirements: { images = {}, audio = {}, video = {} } = {} } =
      selectedActivity || { mediaRequirements: {} };

    let canPublish = true;

    // 必须选类型
    if (!selectedType) {
      canPublish = false;
    }

    // 内容至少有一个
    const hasBasicContent =
      title.trim() || content.trim() || imageList.length > 0 || audioUrl;

    if (!hasBasicContent) {
      canPublish = false;
    }

    // 图片校验
    if (images.required) {
      const imageCount = imageList.filter((i) => i.type === "image").length;

      if (
        imageCount < (images.min || 0) ||
        imageCount > (images.max || Infinity)
      ) {
        canPublish = false;
      }
    }

    if (video.required) {
      const videoCount = imageList.filter((i) => i.type === "video").length;
      const imageCount = imageList.filter((i) => i.type === "image").length;
      if (videoCount && imageCount === 0) {
        canPublish = false;
      }
    }
    if (audio.required) {
      // 音频校验
      if (!audioUrl) {
        canPublish = false;
      }

      if (audioDuration > (audio.maxDurationSec || Infinity)) {
        canPublish = false;
      }
    }

    this.setData({ canPublish });
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
  async onPublish() {
    if (!this.data.canPublish) return;

    const {
      selectedActivity,
      selectedType,
      title,
      content,
      imageList,
      selectedTopics,
      audioUrl,
      audioDuration,
    } = this.data;
    const { mediaRequirements: { images = {}, audio = {}, video = {} } = {} } =
      selectedActivity || { mediaRequirements: {} };
    console.log("images:", images);
    console.log("audio:", audio);
    console.log("video:", video);
    const imageCount = imageList.filter(
      (image) => image.type === "image",
    ).length;
    const videoCount = imageList.filter((i) => i.type === "video").length;
    if (images.required) {
      const imageListForImage = imageList.filter(
        (image) => image.type === "image",
      );
      if (
        imageListForImage.length < images.min ||
        imageListForImage.length > images.max
      ) {
        wx.showModal({
          title: "提示",
          content:
            "图片不能少于" + images.min + "张,并且不能大于" + images.max + "张",
          showCancel: false,
        });
        return;
      }
    }

    if (audio.required) {
      if (!audioUrl) {
        wx.showModal({
          title: "提示",
          content: "请上传录音",
          showCancel: false,
        });
        return;
      }
      if (audioDuration > audio.maxDurationSec) {
        wx.showModal({
          title: "提示",
          content: "录音不能多于" + audio.maxDurationSec + "秒",
          showCancel: false,
        });
        return;
      }
    }

    if (videoCount > 0 && imageCount === 0) {
      wx.showModal({
        title: "提示",
        content: "请至少上传一张图片",
        showCancel: false,
      });
      return;
    }

    let imageSortOrder = 0;
    const mediaList = [
      ...(imageList.length
        ? imageList.map((m: any) =>
            m.type === "image"
              ? { ...m, sortOrder: imageSortOrder++ }
              : { ...m },
          )
        : []),
      ...(audioUrl
        ? [
            {
              type: "audio",
              url: audioUrl,
              durationSec: audioDuration,
            },
          ]
        : []),
    ];

    const publishData = {
      ...(selectedActivity ? { activityId: selectedActivity.id } : {}),
      submissionType: selectedType,
      title: title,
      intro: content,
      tags: [
        // ...(this.data.selectedActivity?.category || []),
        ...(selectedActivity?.tags || []),
        ...selectedTopics,
      ],
      media: mediaList,
      precheckResult: {
        verdict: "pass",
      },
    };

    // TODO: precheck
    // const precheck = await request("/submissions/precheck", {
    //   method: "POST",
    //   data: {
    //     title: publishData.title,
    //     intro: publishData.content,
    //     images: publishData.images,
    //   },
    // });
    // if (precheck.verdict === "pass") {
    console.log("发布内容：", publishData);

    const submission = await request("/submissions", {
      method: "POST",
      data: publishData,
    });
    if (submission.error) {
      wx.showModal({
        title: "错误提示",
        content: submission.error,
        showCancel: false,
      });
      return;
    } else {
      wx.showModal({
        title: "提示",
        content: submission.message,
        showCancel: false,
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
    // } else {
    //   // TODO precheck检查出错
    //   wx.showModal({
    //     title: "提示",
    //     content: "内容存在不安全信息，请处理",
    //     showCancel: false,
    //   });
    // }
  },

  // 切换录音弹窗
  onToggleRecordPopup() {
    this.setData({ recordPopupVisible: true });
  },

  // 关闭录音弹窗
  onRecordPopupClose(e?: any) {
    if (e?.detail?.visible === false || !e?.detail) {
      if (this.data.recording) {
        this.setData({
          recordMode: "discard",
        });
        this.recorderManager.stop();
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

  // 录音按钮触摸移动：检测悬停目标
  onRecordTouchMove(e: any) {
    const touch = e.touches[0];
    const deltaX = touch.clientX - this.data.touchStartX;
    const deltaY = touch.clientY - this.data.touchStartY;

    if (!this.data.recording) {
      if (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15) {
        if (this.data.touchStartTimer) {
          clearTimeout(this.data.touchStartTimer);
          this.setData({ touchStartTimer: null });
        }
      }
      return;
    }

    // 向左滑 -> 悬停取消，向右滑 -> 悬停转文字，居中 -> 无悬停
    let hoverTarget = "";
    if (deltaX < -40) hoverTarget = "cancel";
    else if (deltaX > 40) hoverTarget = "asr";

    if (hoverTarget !== this.data.hoverTarget) {
      this.setData({ hoverTarget });
    }
  },

  // 停止录音（由 touchend 触发）
  onStopRecord(e: any) {
    if (this.data.touchStartTimer) {
      clearTimeout(this.data.touchStartTimer);
      this.setData({ touchStartTimer: null });
    }

    if (!this.data.recording) return;

    const { hoverTarget } = this.data;
    this.setData({ hoverTarget: "" });

    if (hoverTarget === "cancel") {
      this.setData({
        recordMode: "discard",
        recordPopupVisible: false,
      });

      this.recorderManager.stop();
    } else if (hoverTarget === "asr") {
      this.setData({
        recordMode: "asr",
      });

      this.recorderManager.stop();
    } else {
      this.setData({
        recordMode: "normal",
      });

      this.recorderManager.stop();
    }
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
                title: "需要录音权限",
                content: "开启录音权限后才能使用语音功能",
                confirmText: "去开启",
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting({
                      success: (settingRes) => {
                        // 用户重新开启
                        if (settingRes.authSetting["scope.record"]) {
                          this.doStartRecord();
                        }
                      },
                    });
                  }
                },
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

    this.recorderManager.start({
      format: "mp3",
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 128000,
    });

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

  // 转文字弹窗：编辑文字内容
  onAsrTextInput(e: any) {
    this.setData({ asrText: e.detail.value });
  },

  // 转文字弹窗：取消，丢弃录音和文字
  onAsrCancel() {
    this.setData({
      asrPopupVisible: false,
      asrText: "",
      pendingAudioUrl: "",
      pendingAudioDuration: 0,
    });
  },

  // 转文字弹窗：发原语音，保存录音文件
  onAsrUseAudio() {
    this.setData({
      audioUrl: this.data.pendingAudioUrl,
      audioDuration: this.data.pendingAudioDuration,
      asrPopupVisible: false,
      asrText: "",
      pendingAudioUrl: "",
      pendingAudioDuration: 0,
    });
  },

  // 转文字弹窗：确认，把文字追加到正文
  onAsrConfirm() {
    const text = this.data.asrText.trim();
    if (!text) {
      wx.showToast({ title: "文字内容为空", icon: "none" });
      return;
    }
    const content = this.data.content ? this.data.content + "\n" + text : text;
    this.setData({
      content,
      asrPopupVisible: false,
      asrText: "",
      pendingAudioUrl: "",
      pendingAudioDuration: 0,
    });
    this.checkCanPublish();
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
            audioDuration: 0,
          });
        }
      },
    });
  },
  async handleRecordStop(res: any) {
    console.log("录音结束：", res);
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }
    const { tempFilePath, duration } = res;
    const durationSec = Math.ceil(duration / 1000);

    const { recordMode } = this.data;

    // 重置录音状态
    this.setData({
      recording: false,
      recordTime: 0,
      recordTimer: null,
    });

    // 丢弃模式
    if (recordMode === "discard") {
      console.log("录音已取消");
      return;
    }

    // 普通录音
    if (recordMode === "normal") {
      this.setData({
        audioUrl: tempFilePath,
        audioDuration: durationSec,
      });

      wx.showToast({
        title: `录音完成 ${durationSec}秒`,
        icon: "success",
      });

      return;
    }

    // ASR 模式
    if (recordMode === "asr") {
      try {
        wx.showLoading({
          title: "上传中...",
        });

        const token = wx.getStorageSync("accessToken") || "";
        const dateStr = formatDate(new Date(), "YYYYMMDD");
        const timestamp = Date.now();

        const uploadRes = await new Promise<any>((resolve, reject) => {
          wx.uploadFile({
            url: `${ENV.API_BASE_URL}/upload`,
            filePath: tempFilePath,
            name: "file",
            formData: {
              fileName: `${dateStr}_corpus_collection_audio_${timestamp}.mp3`,
            },
            header: {
              Authorization: `Bearer ${token}`,
            },
            success: resolve,
            fail: reject,
          });
        });

        wx.hideLoading();

        const data = JSON.parse(uploadRes.data);

        this.setData({
          pendingAudioUrl: data.url,
          pendingAudioDuration: durationSec,
          asrText: "（转换中...）",
          asrPopupVisible: true,
          recordPopupVisible: false,
        });

        // TODO: 这里接 ASR
        setTimeout(() => {
          this.setData({
            asrText: "",
          });
        }, 800);
      } catch (err) {
        wx.hideLoading();

        console.error(err);

        wx.showToast({
          title: "上传失败",
          icon: "none",
        });
      }
    }
  },

  // 查看模式：预览图片
  onPreviewImage(e: any) {
    const url = e.currentTarget.dataset.url;

    const urls = (this.data.imageList || [])
      .filter((f: any) => f.type === "image")
      .map((f: any) => f.url);

    wx.previewImage({
      current: url,
      urls,
    });
  },

  // 查看模式：显示操作弹窗
  onShowPostActions() {
    this.setData({ postActionsVisible: true });
  },

  onPostActionsClose() {
    this.setData({ postActionsVisible: false });
  },

  // 查看模式：跳转编辑
  onEditPost() {
    this.setData({ postActionsVisible: false });
    const id = (this.data.post as any).id;
    wx.navigateTo({ url: `/pages/post/post?id=${id}&mode=edit` });
  },

  onDeletePost() {
    this.setData({ postActionsVisible: false });
    wx.showModal({
      title: "确认删除",
      content: "删除后无法恢复，确定要删除吗？",
      confirmColor: "#f62459",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const id = (this.data.post as any).id;
          await request(`/submissions/${id}`, { method: "DELETE" });
          wx.showToast({ title: "已删除", icon: "success" });
          setTimeout(() => wx.navigateBack(), 1500);
        } catch (err: any) {
          wx.showToast({ title: err.error || "删除失败", icon: "none" });
        }
      },
    });
  },
  onViewNavbarBack() {
    wx.navigateBack();
  },
});

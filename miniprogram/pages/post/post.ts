import request from "../../utils/http";
import ENV from "../../config/setting";
import { formatDate } from "../../utils/date";
import { guardProtectedPage } from "../../utils/auth";
import uploadFileWithAuth from "../../utils/upload";

const MAX_AUDIO_DURATION = 60;
const MAX_VIDEO_DURATION = 30;
const MIN_IMAGE = 1;
const MAX_IMAGE = 8;
const sharedRecorderManager = wx.getRecorderManager();
const sharedAudioManager = wx.getBackgroundAudioManager();
let activeRecorderStopHandler: ((res: any) => void) | null = null;
let activeAudioStateHandler: ((playing: boolean) => void) | null = null;
let activeAudioErrorHandler: ((err: any) => void) | null = null;

sharedRecorderManager.onStop((res) => {
  activeRecorderStopHandler?.(res);
});

sharedAudioManager.onPlay(() => activeAudioStateHandler?.(true));
sharedAudioManager.onPause(() => activeAudioStateHandler?.(false));
sharedAudioManager.onStop(() => activeAudioStateHandler?.(false));
sharedAudioManager.onEnded(() => activeAudioStateHandler?.(false));
sharedAudioManager.onError((err) => {
  activeAudioStateHandler?.(false);
  activeAudioErrorHandler?.(err);
});

const TYPES = [
  { label: "用语", value: "用语" },
  { label: "诗歌", value: "诗歌" },
  { label: "故事", value: "故事" },
  { label: "标语", value: "标语" },
  { label: "地名解说", value: "地名解说" },
  { label: "歇后语", value: "歇后语" },
];

Page({
  data: {
    mode: "",
    currentTheme: "light",
    post: {} as any,
    // postActionsVisible: false,
    selectedType: "",
    selectedActivity: {
      id: "",
      title: "不参与任何活动",
      tags: [],
      mediaRequirements: {},
    } as any,
    activityPopupVisible: false,
    activityList: [] as { id: string; title: string; description: string }[],
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
    typeOptions: TYPES,
    topicPopupVisible: false,
    topicSearchKeyword: "",
    filteredTopicList: [] as string[],
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
    recordStarting: false,
    recording: false,
    recordStopping: false,
    recordReady: false,
    recordProcessing: false,
    recordActionsAnimating: false,
    recordTime: 0,
    recordTimer: null as any,
    recordActionsAnimationTimer: null as any,
    justFinishedRecording: false,
    audioUrl: "",
    audioDuration: 0,
    audioPlaying: false,
    pendingRecordPath: "",
    pendingRecordDuration: 0,
    recordMode: "normal" as "normal" | "discard",
    // 转文字结果弹窗
    asrPopupVisible: false,
    asrText: "",
    pendingAudioUrl: "",
    pendingAudioDuration: 0,
    // 用透明 page-container 接管左滑、安卓返回键和 navigateBack。
    exitGuardVisible: false,
  },
  recorderManager: sharedRecorderManager,
  audioStateHandler: null as any,
  audioErrorHandler: null as any,
  allowRecordPopupClose: false,
  recordCancelledOnHide: false,
  exitConfirmVisible: false,
  pageExitConfirmed: false,

  async onLoad(options) {
    const { tag, id, mode } = options;
    this.syncTheme();

    const query = [
      tag ? `tag=${encodeURIComponent(tag)}` : "",
      id ? `id=${encodeURIComponent(id)}` : "",
      `mode=${encodeURIComponent(mode || "edit")}`,
    ]
      .filter(Boolean)
      .join("&");
    const currentUrl = `/pages/post/post?${query}`;

    if (
      !guardProtectedPage(
        currentUrl,
        mode === "view"
          ? "登录后才能查看作品详情，当前仍可继续浏览公开内容。"
          : "登录后才能投稿，当前仍可继续浏览公开内容。",
      )
    ) {
      return;
    }

    const userInfo = wx.getStorageSync("userInfo");

    this.setData(
      {
        mode: mode || "edit",
        userId: userInfo.id,
        exitGuardVisible: (mode || "edit") === "edit",
      },
      async () => {
        try {
          tag && (await this.loadTrack(tag));
          const postLoaded = id
            ? await this.loadPost(id, {
                retryOnFailure: mode === "view",
              })
            : false;
          const { mode } = this.data;
          if (mode === "view" && postLoaded) {
            const view = await request(`/works/${id}/view`, { method: "POST" });
            this.setData({ view: view?.viewCount });
          }
        } catch (err: any) {
          console.error("onLoad async error:", err);
        }
      },
    );

    this.handleRecordStop = this.handleRecordStop.bind(this);
    this.audioStateHandler = (playing: boolean) => {
      this.setData({ audioPlaying: playing });
    };
    this.audioErrorHandler = (err: any) => {
      wx.showToast({
        title: err.errMsg || `播放错误: ${err.errCode || "未知错误"}`,
        icon: "none",
        duration: 3000,
      });
    };
    activeAudioStateHandler = this.audioStateHandler;
    activeAudioErrorHandler = this.audioErrorHandler;
  },
  onUnload() {
    wx.disableAlertBeforeUnload();
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }
    if (this.data.recordActionsAnimationTimer) {
      clearTimeout(this.data.recordActionsAnimationTimer);
    }
    this.stopAudioPlayback();
    if (activeAudioStateHandler === this.audioStateHandler) {
      activeAudioStateHandler = null;
    }
    if (activeAudioErrorHandler === this.audioErrorHandler) {
      activeAudioErrorHandler = null;
    }
    if (activeRecorderStopHandler === this.handleRecordStop) {
      activeRecorderStopHandler = null;
    }
    if (
      this.recorderManager &&
      this.data.recording &&
      !this.data.recordStopping
    ) {
      this.setData({ recordMode: "discard" });
      this.recorderManager.stop();
    }
  },
  async loadTrack(id: string) {
    wx.showLoading({ title: "加载活动中..." });
    try {
      const track = await request(`/activities/${id}`);
      await new Promise<void>((resolve) => {
        this.setData(
          {
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
          },
          resolve,
        );
      });
      this.checkCanPublish();
      return true;
    } catch (err: any) {
      console.log("获取活动数据失败", err);
      wx.showModal({
        title: "获取活动数据失败",
        content: err.error + "，请稍后重试",
        showCancel: false,
      });
      return false;
    } finally {
      wx.hideLoading();
    }
  },

  async loadPost(
    id: string,
    options: { retryOnFailure?: boolean; showLoading?: boolean } = {},
  ): Promise<boolean> {
    const { retryOnFailure = false, showLoading = true } = options;
    if (showLoading) {
      wx.showLoading({ title: "加载中..." });
    }
    try {
      const res = await request(`/submissions/${id}`);
      console.log("select:", this.data.selectedActivity);
      let selectedActivity = this.data.selectedActivity;

      if (!this.data.selectedActivity?.id && res.activity && res.activity.id) {
        selectedActivity = await request(`/activities/${res.activity.id}`);
      }
      console.log("res:", res);
      console.log(
        "audio:",
        res.media.find((m) => m.type === "audio")?.url || "",
      );
      const audioMedia = res.media.find((m) => m.type === "audio");
      const audioDuration = audioMedia?.durationSec || 0;
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
        availableTopics: [
          ...(res.tags || []).filter(
            (t: string) => !this.data.availableTopics.includes(t),
          ),
          ...this.data.availableTopics,
        ],
        audioUrl: audioMedia?.url || "",
        audioDuration,
        selectedActivity,
        selectedType: res.submissionType,
      });
      this.checkCanPublish();
      return true;
    } catch (err: any) {
      console.log("获取投稿数据失败：", err);
      if (retryOnFailure && err?.code !== "AUTH_REQUIRED") {
        return await this.loadPost(id, {
          retryOnFailure: false,
          showLoading: false,
        });
      }
      if (err?.code !== "AUTH_REQUIRED") {
        wx.showModal({
          title: "获取投稿数据失败",
          content: `${err?.error || err?.message || "请求失败"}，请稍后再试`,
          showCancel: false,
        });
      }
      return false;
    } finally {
      if (showLoading) {
        wx.hideLoading();
      }
    }
  },

  onShow() {
    this.syncTheme();
    this.syncUnsavedExitGuard();
    if (this.recordCancelledOnHide) {
      this.recordCancelledOnHide = false;
      wx.showToast({ title: "录音已因离开小程序取消", icon: "none" });
    }
  },

  onHide() {
    this.stopAudioPlayback();
    if (!this.data.recording) return;

    const alreadyStopping = this.data.recordStopping;
    this.recordCancelledOnHide = true;
    wx.disableAlertBeforeUnload();
    this.setData({ recordMode: "discard", recordStopping: true });
    if (!alreadyStopping) {
      this.recorderManager.stop();
    }
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

  async uploadMediaFile(file: any, dateStr: string, timestamp: string) {
    const uploadPath = file.url;
    const ext = this.getFileExtension(uploadPath, file.type);
    const res = await uploadFileWithAuth({
      url: `${ENV.API_BASE_URL}/upload`,
      filePath: uploadPath,
      name: "file",
      formData: {
        fileName: `${dateStr}_corpus_collection_${file.type}_${timestamp}.${ext}`,
      },
    });

    let data: any = {};
    try {
      data = JSON.parse(res.data);
    } catch {
      throw new Error("返回数据解析失败");
    }

    if (res.statusCode !== 200) {
      throw new Error(data?.error || "上传失败");
    }

    return {
      ...file,
      url: data.url,
    };
  },

  // 选择图片
  async onChooseImage() {
    const mediaRequirements =
      this.data.selectedActivity?.mediaRequirements || {};
    const requiredTypes = mediaRequirements.requiredTypes || [];
    const hasImage = requiredTypes.includes("image");
    const hasVideo = requiredTypes.includes("video");
    const hasMediaRequirement = requiredTypes.length > 0;
    const maxImageCount =
      hasMediaRequirement && !hasImage ? MIN_IMAGE : MAX_IMAGE;
    const maxVideoCount = hasMediaRequirement && !hasVideo ? 0 : 1;
    const ruleDescription = [
      hasImage ? "图片：1-8张" : "图片：1张",
      hasVideo
        ? "视频：1个，且不能超过30秒"
        : "视频：不允许上传",
    ].join("\n");
    const currentImageCount = this.data.imageList.filter(
      (file) => file.type === "image",
    ).length;
    const currentVideoCount = this.data.imageList.filter(
      (file) => file.type === "video",
    ).length;
    const remainingImageCount = Math.max(maxImageCount - currentImageCount, 0);
    const remainingVideoCount = Math.max(maxVideoCount - currentVideoCount, 0);
    const maxCount = remainingImageCount + remainingVideoCount;

    if (maxCount === 0) {
      if (hasMediaRequirement) {
        wx.showModal({
          title: "已达到该活动媒体上限",
          content: ruleDescription,
          showCancel: false,
        });
      } else {
        wx.showToast({ title: "已达到媒体数量上限", icon: "none" });
      }
      return;
    }

    const mediaType = [
      ...(remainingImageCount > 0 ? ["image" as const] : []),
      ...(remainingVideoCount > 0 ? ["video" as const] : []),
    ];
    wx.chooseMedia({
      count: maxCount,
      mediaType,
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      // wx.chooseMedia 只允许相机拍摄时长为 3～30 秒；相册视频同样校验30秒业务上限。
      maxDuration: MAX_VIDEO_DURATION,
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
          const selectedImageCount = tempFiles.filter(
            (file) => file.type === "image",
          ).length;
          const selectedVideoCount = tempFiles.filter(
            (file) => file.type === "video",
          ).length;

          if (
            currentImageCount + selectedImageCount > maxImageCount ||
            currentVideoCount + selectedVideoCount > maxVideoCount
          ) {
            wx.showModal({
              title: "提示",
              content: ruleDescription,
              showCancel: false,
            });
            return;
          }

          const overDurationVideo = tempFiles.find(
            (file) =>
              file.type === "video" &&
              file.durationSec > MAX_VIDEO_DURATION,
          );

          if (overDurationVideo) {
            wx.showModal({
              title: "提示",
              content: `视频不能超过${MAX_VIDEO_DURATION}秒`,
              showCancel: false,
            });
            return;
          }

          const compressedFiles = await Promise.all(
            tempFiles.map((file) => this.compressMediaFile(file)),
          );

          wx.showLoading({ title: "上传中..." });

          const timestamp = Date.now();
          const dateStr = formatDate(new Date(), "YYYYMMDD");
          const files = await Promise.all(
            compressedFiles.map((file, index) =>
              this.uploadMediaFile(file, dateStr, `${timestamp}_${index}`),
            ),
          );

          this.setData({
            imageList: [...this.data.imageList, ...files],
          });
          this.checkCanPublish();
        } catch (err: any) {
          console.error(err);
          if (err?.code === "AUTH_REQUIRED") {
            return;
          }
          wx.showModal({
            title: "上传失败",
            content:
              (err?.message || err?.errMsg || err?.error || "操作失败") +
              "，请稍后重试",
            showCancel: false,
          });
        } finally {
          wx.hideLoading();
        }
      },
      fail: (err) => {
        if (err.errMsg?.includes("cancel")) return;
        console.error("选择图片或视频失败：", err);
        wx.showModal({
          title: "无法选择图片或视频",
          content: err.errMsg || "请检查相册和相机权限后重试",
          showCancel: false,
        });
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
        `/activities?timeStatus=ongoing&page=${activityPage}&pageSize=10${keyword}`,
      );
      const items = (res.items || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
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

  // 不参与任何活动
  onNoActivity() {
    this.setData({
      selectedActivity: { id: "", title: "不参与任何活动" },
      activityPopupVisible: false,
      typeOptions: TYPES,
    });
    this.checkCanPublish();
  },

  // 选中活动
  async onSelectActivity(e: any) {
    const { id } = e.currentTarget.dataset;
    const hasUploadedMedia =
      this.data.imageList.length > 0 || Boolean(this.data.audioUrl);
    const loaded = await this.loadTrack(id);

    if (loaded) {
      this.setData({ activityPopupVisible: false });
      this.checkCanPublish(hasUploadedMedia);
    }
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

    const availableTopics = this.data.availableTopics.includes(topic)
      ? this.data.availableTopics
      : [topic, ...this.data.availableTopics];

    this.setData(
      {
        selectedTopics: [...this.data.selectedTopics, topic],
        selectedTopicMap: {
          ...this.data.selectedTopicMap,
          [topic]: true,
        },
        availableTopics,
        topicSearchKeyword: "",
        filteredTopicList: availableTopics,
      },
      () => this.checkCanPublish(),
    );
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

      this.setData(
        {
          selectedTopics: selectedTopics.filter((t) => t !== topic),
          selectedTopicMap,
        },
        () => this.checkCanPublish(),
      );
    } else {
      selectedTopicMap[topic] = true;

      this.setData(
        {
          selectedTopics: [...selectedTopics, topic],
          selectedTopicMap,
        },
        () => this.checkCanPublish(),
      );
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
    this.setData({ selectedTopics, selectedTopicMap }, () =>
      this.checkCanPublish(),
    );
  },

  getPublishValidation() {
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

    const requiredTypes =
      selectedActivity?.mediaRequirements?.requiredTypes || [];
    const hasImage = requiredTypes.includes("image");
    const hasVideo = requiredTypes.includes("video");
    const hasAudio = requiredTypes.includes("audio");
    const hasMediaRequirement = requiredTypes.length > 0;
    const maxImageCount =
      hasMediaRequirement && !hasImage ? MIN_IMAGE : MAX_IMAGE;
    const violations: string[] = [];
    const tags = [...(selectedActivity?.tags || []), ...selectedTopics]
      .map((tag) => this.normalizeTopic(tag))
      .filter(Boolean);

    const hasBasicContent =
      title.trim() || content.trim() || imageList.length > 0 || audioUrl;

    const imageCount = imageList.filter((i) => i.type === "image").length;
    const videoCount = imageList.filter((i) => i.type === "video").length;

    if (hasMediaRequirement) {
      if (imageCount < MIN_IMAGE || imageCount > maxImageCount) {
        violations.push(
          imageCount < MIN_IMAGE
            ? "缺少图片，至少需要1张"
            : maxImageCount === MIN_IMAGE
              ? `图片只能上传1张，当前有${imageCount}张`
              : `图片最多上传${MAX_IMAGE}张，当前有${imageCount}张`,
        );
      }

      if (hasVideo && videoCount !== 1) {
        violations.push(
          videoCount < 1
            ? "缺少视频，需要上传1个视频"
            : `视频只能上传1个，当前有${videoCount}个`,
        );
      } else if (!hasVideo && videoCount > 0) {
        violations.push("该活动不允许上传视频");
      }

      if (hasAudio && !audioUrl) {
        violations.push("缺少录音，需要上传1个录音");
      } else if (!hasAudio && audioUrl) {
        violations.push("该活动不允许上传录音");
      }
    }

    const overDurationVideo = imageList.find(
      (i) =>
        i.type === "video" &&
        i.durationSec &&
        i.durationSec > MAX_VIDEO_DURATION,
    );
    if (overDurationVideo) {
      violations.push(`视频不能超过${MAX_VIDEO_DURATION}秒`);
    }

    if (audioUrl && audioDuration > MAX_AUDIO_DURATION) {
      violations.push(`录音不能超过${MAX_AUDIO_DURATION}秒`);
    }

    return {
      canPublish:
        Boolean(selectedType) &&
        Boolean(hasBasicContent) &&
        tags.length > 0 &&
        violations.length === 0,
      message: !selectedType
        ? "请选择类型"
        : !hasBasicContent
          ? "请填写内容或上传媒体"
          : tags.length === 0
            ? "请添加标签"
            : violations[0] || "",
      violations,
    };
  },

  // 检查是否可以发布
  checkCanPublish(showMediaRuleError = false) {
    const {
      canPublish,
      message,
      violations = [],
    } = this.getPublishValidation();
    console.log("message:", message);
    this.setData({ canPublish });
    this.syncUnsavedExitGuard();

    if (!showMediaRuleError) {
      return;
    }

    if (violations.length > 0) {
      wx.showModal({
        title: "当前媒体不符合活动规则",
        content:
          violations.map((item) => `• ${item}`).join("\n") +
          "\n\n请调整后再发布。",
        showCancel: false,
      });
    }
  },
  // 取消发布
  onCancel() {
    // page-container 会统一接管左上角、左滑和安卓返回键。
    wx.navigateBack();
  },

  hasUnsavedPostContent() {
    const {
      title,
      content,
      imageList,
      audioUrl,
      recordReady,
      pendingRecordPath,
      selectedTopics,
    } = this.data;

    return Boolean(
      title.trim() ||
      content.trim() ||
      imageList.length > 0 ||
      audioUrl ||
      recordReady ||
      pendingRecordPath ||
      selectedTopics.length > 0,
    );
  },

  syncUnsavedExitGuard() {
    if (
      this.data.mode === "edit" &&
      !this.pageExitConfirmed &&
      !this.exitConfirmVisible &&
      !this.data.exitGuardVisible
    ) {
      this.setData({ exitGuardVisible: true });
    }
  },

  // page-container 会先吃掉一次返回，再由这里决定恢复页面还是正式退出。
  onExitGuardBeforeLeave() {
    if (this.pageExitConfirmed || this.data.mode !== "edit") {
      return;
    }

    this.setData({ exitGuardVisible: false });

    if (this.exitConfirmVisible) {
      return;
    }

    const isRecording = this.data.recording || this.data.recordStopping;
    if (!isRecording && !this.hasUnsavedPostContent()) {
      this.leavePostPage();
      return;
    }

    this.exitConfirmVisible = true;
    wx.showModal({
      title: isRecording ? "录音正在进行" : "提示",
      content: isRecording
        ? "退出将取消本次录音，是否确认退出？"
        : "确定要放弃编辑吗？",
      confirmText: "确认退出",
      confirmColor: isRecording ? "#d54941" : "#576b95",
      success: (res) => {
        if (!res.confirm) {
          this.setData({ exitGuardVisible: true });
          return;
        }

        if (isRecording) {
          const alreadyStopping = this.data.recordStopping;
          this.setData({ recordMode: "discard", recordStopping: true });
          if (!alreadyStopping) {
            this.recorderManager.stop();
          }
        }
        this.leavePostPage();
      },
      fail: () => {
        this.setData({ exitGuardVisible: true });
      },
      complete: () => {
        this.exitConfirmVisible = false;
      },
    });
  },

  leavePostPage() {
    this.pageExitConfirmed = true;
    wx.disableAlertBeforeUnload();
    this.setData({ exitGuardVisible: false }, () => {
      setTimeout(() => wx.navigateBack(), 80);
    });
  },

  // 导航栏返回
  onNavbarBack() {
    this.onCancel();
  },

  // 发布内容
  async onPublish() {
    const validation = this.getPublishValidation();
    console.log("validation:", validation);
    if (!validation.canPublish) {
      if (validation.message) {
        wx.showModal({
          title: "提示",
          content: validation.message,
          showCancel: false,
        });
      }
      return;
    }

    wx.showLoading({ title: "正在提交中..." });
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
      ...(selectedActivity && selectedActivity.id
        ? { activityId: selectedActivity.id }
        : {}),
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
    const imagePrecheck = mediaList
      .map((m) => {
        if (m.type === "image") {
          return m.url;
        }
        return null;
      })
      .filter((m) => m);

    try {
      const precheck = await request("/submissions/precheck", {
        method: "POST",
        data: {
          title: publishData.title,
          intro: publishData.intro,
          images: imagePrecheck,
        },
      });
      console.log("precheck:", precheck);

      if (precheck.verdict !== "pass") {
        wx.hideLoading();
        wx.showModal({
          title: "提示",
          content: precheck.error || "内容审核未通过",
          showCancel: false,
        });
        return;
      }

      console.log("发布内容：", publishData);
      const existedPostEdit = !!this.data.post?.id;
      const url = existedPostEdit
        ? `/submissions/${this.data.post.id}`
        : "/submissions";
      const submission = await request(url, {
        method: existedPostEdit ? "PATCH" : "POST",
        data: publishData,
      });
      wx.hideLoading();

      if (submission.error) {
        wx.showModal({
          title: "错误提示",
          content: submission.error,
          showCancel: false,
        });
      } else {
        wx.showToast({
          title: existedPostEdit ? "修改成功" : "发布成功",
          icon: "success",
          duration: 1500,
        });
        setTimeout(() => {
          this.leavePostPage();
        }, 1500);
      }
    } catch (err: any) {
      wx.hideLoading();
      console.error("发布失败：", err);
      wx.showModal({
        title: "发布失败",
        content: err?.error || err?.message || "请稍后重试",
        showCancel: false,
      });
    }
  },

  // 切换录音弹窗
  onToggleRecordPopup() {
    this.stopAudioPlayback();
    const mediaRequirements =
      this.data.selectedActivity?.mediaRequirements || {};
    const requiredTypes = mediaRequirements.requiredTypes || [];
    const hasAudio = requiredTypes.includes("audio");
    const hasMediaRequirement = requiredTypes.length > 0;

    if (hasMediaRequirement && !hasAudio) {
      wx.showModal({
        title: "该活动不允许上传录音",
        content: "当前活动不包含录音投稿要求",
        showCancel: false,
      });
      return;
    }

    this.allowRecordPopupClose = false;
    this.setData({ recordPopupVisible: true });
  },

  closeRecordPopup() {
    this.allowRecordPopupClose = true;
    this.setData({ recordPopupVisible: false }, () => {
      setTimeout(() => {
        this.allowRecordPopupClose = false;
      }, 100);
    });
  },

  // 关闭录音弹窗
  onRecordPopupClose(e?: any) {
    if (e?.detail?.visible === false || !e?.detail) {
      if (this.allowRecordPopupClose) return;

      if (this.data.recordProcessing) {
        wx.showToast({ title: "正在处理中，请稍候", icon: "none" });
        this.setData({ recordPopupVisible: true });
        return;
      }

      if (this.data.recording || this.data.recordStopping) {
        const alreadyStopping = this.data.recordStopping;
        wx.showModal({
          title: "录音正在进行",
          content: "退出将取消本次录音，是否确认退出？",
          confirmText: "取消录音",
          confirmColor: "#d54941",
          success: (res) => {
            if (!res.confirm) {
              this.setData({ recordPopupVisible: true });
              return;
            }

            wx.disableAlertBeforeUnload();
            this.setData({
              recordMode: "discard",
              recording: false,
              recordStopping: true,
            });
            this.closeRecordPopup();
            if (!alreadyStopping) {
              this.recorderManager.stop();
            }
          },
        });
        this.setData({ recordPopupVisible: true });
        return;
      }

      this.setData(
        {
          recordReady: false,
          recordActionsAnimating: false,
          recordTime: 0,
          pendingRecordPath: "",
          pendingRecordDuration: 0,
        },
        () => this.syncUnsavedExitGuard(),
      );
      this.closeRecordPopup();
    }
  },

  // 主按钮：开始录音、结束录音或使用已完成的原音
  onRecordButtonTap() {
    if (
      this.data.recordStarting ||
      this.data.recordProcessing ||
      this.data.recordStopping
    ) {
      return;
    }

    if (this.data.recording) {
      this.setData({ recordStopping: true, recordMode: "normal" });
      this.recorderManager.stop();
      return;
    }

    if (this.data.recordReady) {
      this.onUseRecordedAudio();
      return;
    }

    this.checkAndStartRecord();
  },

  // 检查并开始录音
  checkAndStartRecord() {
    if (this.data.recordStarting) return;

    const canStart = () =>
      this.data.recordPopupVisible &&
      !this.data.recording &&
      !this.data.recordReady &&
      !this.data.recordProcessing;

    if (!canStart()) return;
    this.setData({ recordStarting: true });

    wx.getSetting({
      success: (res) => {
        if (!canStart()) {
          this.setData({ recordStarting: false });
          return;
        }

        if (!res.authSetting["scope.record"]) {
          wx.authorize({
            scope: "scope.record",
            success: () => {
              this.setData({ recordStarting: false });
              if (canStart()) {
                this.doStartRecord();
              }
            },
            fail: () => {
              this.setData({ recordStarting: false });
              if (!canStart()) return;

              wx.showModal({
                title: "需要录音权限",
                content: "开启录音权限后才能使用语音功能",
                confirmText: "去开启",
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting({
                      success: (settingRes) => {
                        // 用户重新开启
                        if (
                          settingRes.authSetting["scope.record"] &&
                          canStart()
                        ) {
                          this.doStartRecord();
                        }
                      },
                    });
                  }
                },
              });
            },
          });
        } else if (canStart()) {
          this.setData({ recordStarting: false });
          this.doStartRecord();
        }
      },
      fail: () => {
        this.setData({ recordStarting: false });
        wx.showToast({ title: "无法检查录音权限", icon: "none" });
      },
    });
  },

  // 真正开始录音
  doStartRecord() {
    this.stopAudioPlayback();
    activeRecorderStopHandler = this.handleRecordStop;
    this.setData({
      recordStarting: false,
      recording: true,
      recordStopping: false,
      recordReady: false,
      recordActionsAnimating: false,
      recordTime: 0,
      pendingRecordPath: "",
      pendingRecordDuration: 0,
      recordMode: "normal",
    });

    if (this.data.recordActionsAnimationTimer) {
      clearTimeout(this.data.recordActionsAnimationTimer);
    }

    (this as any)._recordStartTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.min(
        MAX_AUDIO_DURATION,
        Math.floor((Date.now() - (this as any)._recordStartTime) / 1000),
      );
      this.setData({
        recordTime: elapsed,
      });
    }, 500);
    this.setData({ recordTimer: timer });

    this.recorderManager.start({
      duration: MAX_AUDIO_DURATION * 1000,
      format: "mp3",
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 96000,
    });

    wx.showToast({
      title: "正在录音...",
      icon: "loading",
      duration: 1000,
    });
  },

  // 取消已完成但尚未使用的录音
  onCancelRecordedAudio() {
    if (this.data.recordProcessing) return;
    this.setData(
      {
        recordReady: false,
        recordActionsAnimating: false,
        recordTime: 0,
        pendingRecordPath: "",
        pendingRecordDuration: 0,
      },
      () => this.syncUnsavedExitGuard(),
    );
  },

  // 使用当前录音：此时才上传录音文件。
  async onUseRecordedAudio() {
    const { pendingRecordPath, pendingRecordDuration } = this.data;
    if (!pendingRecordPath || this.data.recordProcessing) return;

    this.setData({ recordProcessing: true });
    wx.showLoading({ title: "上传中..." });
    try {
      const audioUrl = await this.uploadAudioFile(pendingRecordPath);
      this.stopAudioPlayback();
      this.setData({
        audioUrl,
        audioDuration: pendingRecordDuration,
        recordReady: false,
        recordTime: 0,
        pendingRecordPath: "",
        pendingRecordDuration: 0,
      });
      this.closeRecordPopup();
      this.checkCanPublish();
      wx.showToast({ title: "音频已添加", icon: "success" });
    } catch (err: any) {
      console.error(err);
      if (err?.code !== "AUTH_REQUIRED") {
        wx.showToast({
          title: err.error || err.message || "上传失败",
          icon: "none",
        });
      }
    } finally {
      wx.hideLoading();
      this.setData({ recordProcessing: false });
    }
  },

  // 转文字：上传暂存录音后发起转换
  async onTranscribeRecordedAudio() {
    const { pendingRecordPath, pendingRecordDuration } = this.data;
    if (!pendingRecordPath || this.data.recordProcessing) return;

    this.setData({ recordProcessing: true });
    wx.showLoading({ title: "上传中..." });
    try {
      const audioUrl = await this.uploadAudioFile(pendingRecordPath);
      this.setData({
        pendingAudioUrl: audioUrl,
        pendingAudioDuration: pendingRecordDuration,
        asrText: "（转换中...）",
        asrPopupVisible: true,
        recordReady: false,
        recordTime: 0,
        pendingRecordPath: "",
        pendingRecordDuration: 0,
      });
      this.closeRecordPopup();

      wx.hideLoading();
      const asrRes = await request("/transcriptions", {
        method: "POST",
        data: { audioUrl },
      });
      console.log("asrRes:", asrRes);
      setTimeout(() => {
        this.setData({ asrText: asrRes.text });
      }, 800);
    } catch (err: any) {
      console.error(err);
      if (err?.code !== "AUTH_REQUIRED") {
        wx.showToast({
          title: err.error || err.errMsg || err.message || "转换失败",
          icon: "none",
        });
      }
    } finally {
      wx.hideLoading();
      this.setData({ recordProcessing: false });
    }
  },

  // 播放录音
  onPlayAudio() {
    const { audioUrl } = this.data;
    if (!audioUrl) {
      wx.showToast({ title: "暂无录音", icon: "none" });
      return;
    }

    if (this.data.audioPlaying) {
      this.stopAudioPlayback();
      return;
    }

    sharedAudioManager.title = "录音播放";
    sharedAudioManager.epname = "录音";
    sharedAudioManager.singer = "用户";
    sharedAudioManager.coverImgUrl = "";

    if (sharedAudioManager.src === audioUrl) {
      sharedAudioManager.play();
    } else {
      // BackgroundAudioManager 设置新 src 后会自动开始播放。
      sharedAudioManager.src = audioUrl;
    }
  },

  stopAudioPlayback() {
    if (sharedAudioManager.src || this.data.audioPlaying) {
      sharedAudioManager.stop();
    }
    if (this.data.audioPlaying) {
      this.setData({ audioPlaying: false });
    }
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
    this.stopAudioPlayback();
    this.setData(
      {
        audioUrl: this.data.pendingAudioUrl,
        audioDuration: this.data.pendingAudioDuration,
        asrPopupVisible: false,
        asrText: "",
        pendingAudioUrl: "",
        pendingAudioDuration: 0,
      },
      () => this.checkCanPublish(),
    );
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
          this.stopAudioPlayback();
          this.setData(
            {
              audioUrl: "",
              audioDuration: 0,
            },
            () => this.checkCanPublish(),
          );
        }
      },
    });
  },

  async uploadAudioFile(filePath: string): Promise<string> {
    const dateStr = formatDate(new Date(), "YYYYMMDD");
    const timestamp = Date.now();
    const uploadRes = await uploadFileWithAuth({
      url: `${ENV.API_BASE_URL}/upload`,
      filePath,
      name: "file",
      formData: {
        fileName: `${dateStr}_corpus_collection_audio_${timestamp}.mp3`,
      },
    });

    let data: any = {};
    try {
      data = JSON.parse(uploadRes.data);
    } catch {
      throw new Error("返回数据解析失败");
    }

    if (uploadRes.statusCode !== 200) {
      throw new Error(data?.error || "上传失败");
    }

    return data.url;
  },

  handleRecordStop(res: any) {
    console.log("录音结束：", res);
    wx.disableAlertBeforeUnload();
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }
    if (this.data.recordActionsAnimationTimer) {
      clearTimeout(this.data.recordActionsAnimationTimer);
    }
    const { tempFilePath, duration } = res;
    // 系统自动停止时返回值可能略大于配置上限，统一限制到 60 秒。
    const durationSec = Math.min(
      MAX_AUDIO_DURATION,
      Math.ceil(duration / 1000),
    );

    const { recordMode } = this.data;

    // 重置录音状态
    this.setData({
      recording: false,
      recordStopping: false,
      recordTimer: null,
      recordActionsAnimationTimer: null,
    });

    if (recordMode === "discard") {
      console.log("录音已取消");
      this.setData(
        {
          recordReady: false,
          recordActionsAnimating: false,
          recordTime: 0,
          pendingRecordPath: "",
          pendingRecordDuration: 0,
          recordMode: "normal",
        },
        () => this.syncUnsavedExitGuard(),
      );
      return;
    }

    const animationTimer = setTimeout(() => {
      this.setData({
        recordActionsAnimating: false,
        recordActionsAnimationTimer: null,
      });
    }, 700);

    this.setData(
      {
        recordReady: true,
        recordActionsAnimating: true,
        recordTime: durationSec,
        pendingRecordPath: tempFilePath,
        pendingRecordDuration: durationSec,
        recordActionsAnimationTimer: animationTimer,
        recordMode: "normal",
      },
      () => this.syncUnsavedExitGuard(),
    );

    wx.showToast({
      title: "录音完成，请选择下一步",
      icon: "none",
    });
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
  // onShowPostActions() {
  //   this.setData({ postActionsVisible: true });
  // },

  // onPostActionsClose() {
  //   this.setData({ postActionsVisible: false });
  // },

  // 查看模式：跳转编辑
  onEditPost() {
    this.setData({ postActionsVisible: false });
    const id = (this.data.post as any).id;
    wx.navigateTo({ url: `/pages/post/post?id=${id}&mode=edit` });
  },

  // onDeletePost() {
  //   this.setData({ postActionsVisible: false });
  //   wx.showModal({
  //     title: "确认删除",
  //     content: "删除后无法恢复，确定要删除吗？",
  //     confirmColor: "#f62459",
  //     success: async (res) => {
  //       if (!res.confirm) return;
  //       try {
  //         const id = (this.data.post as any).id;
  //         await request(`/submissions/${id}`, { method: "DELETE" });
  //         wx.showToast({ title: "已删除", icon: "success" });
  //         setTimeout(() => wx.navigateBack(), 1500);
  //       } catch (err: any) {
  //         wx.showToast({ title: err.error || "删除失败", icon: "none" });
  //       }
  //     },
  //   });
  // },
  onViewNavbarBack() {
    wx.navigateBack();
  },
});

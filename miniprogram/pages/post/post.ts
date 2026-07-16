import request from "../../utils/http";
import ENV from "../../config/setting";
import { formatDate } from "../../utils/date";
import { guardProtectedPage } from "../../utils/auth";

const MAX_AUDIO_DURATION = 60;
const MAX_VIDEO_BURATION = 30;
const MIN_IMAGE = 1;
const MAX_IMAGE = 8;
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
    recording: false,
    recordActionsAnimating: false,
    recordTime: 0,
    recordTimer: null as any,
    recordActionsAnimationTimer: null as any,
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
  recordTouchActive: false,
  recordTouchSession: 0,

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
      },
      async () => {
        try {
          tag && (await this.loadTrack(tag));
          id && (await this.loadPost(id));
          const { mode } = this.data;
          if (mode === "view") {
            const view = await request(`/works/${id}/view`, { method: "POST" });
            this.setData({ view: view?.viewCount });
          }
        } catch (err: any) {
          console.error("onLoad async error:", err);
        }
      },
    );

    this.recorderManager = wx.getRecorderManager();
    this.handleRecordStop = this.handleRecordStop.bind(this);
    this.recorderManager.onStop(this.handleRecordStop);
  },
  onUnload() {
    this.recordTouchActive = false;
    this.recordTouchSession += 1;
    if (this.data.touchStartTimer) {
      clearTimeout(this.data.touchStartTimer);
    }
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }
    if (this.data.recordActionsAnimationTimer) {
      clearTimeout(this.data.recordActionsAnimationTimer);
    }
    if (this.recorderManager) {
      this.setData({ recordMode: "discard" });
      this.recorderManager.stop();
      this.recorderManager.offStop(this.handleRecordStop);
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

  async loadPost(id: string) {
    wx.showLoading({ title: "加载中..." });
    try {
      const res = await request(`/submissions/${id}`);
      console.log("select:", this.data.selectedActivity);
      let selectedActivity = this.data.selectedActivity;

      if (!this.data.selectedActivity?.id && res.activity && res.activity.id) {
        selectedActivity = await request(`/activities/${res.activity.id}`);
      }
      wx.hideLoading();
      console.log("res:", res);
      console.log(
        "audio:",
        res.media.find((m) => m.type === "audio")?.url || "",
      );
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
        audioUrl: res.media.find((m) => m.type === "audio")?.url || "",
        audioDuration:
          res.media.find((m) => m.type === "audio")?.durationSec || 0,
        selectedActivity,
        selectedType: res.submissionType,
      });
      this.checkCanPublish();
    } catch (err: any) {
      wx.hideLoading();
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
    timestamp: string,
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
        ? `视频：1个，且不能超过${MAX_VIDEO_BURATION}秒`
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
    const maxDuration = MAX_VIDEO_BURATION;

    wx.chooseMedia({
      count: maxCount,
      mediaType,
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
            (file) => file.type === "video" && file.durationSec > maxDuration,
          );

          if (overDurationVideo) {
            wx.showModal({
              title: "提示",
              content: "视频不能多于" + maxDuration + "秒",
              showCancel: false,
            });
            return;
          }

          const compressedFiles = await Promise.all(
            tempFiles.map((file) => this.compressMediaFile(file)),
          );

          wx.showLoading({ title: "上传中..." });

          const token = wx.getStorageSync("accessToken") || "";
          const timestamp = Date.now();
          const dateStr = formatDate(new Date(), "YYYYMMDD");
          const files = await Promise.all(
            compressedFiles.map((file, index) =>
              this.uploadMediaFile(
                file,
                token,
                dateStr,
                `${timestamp}_${index}`,
              ),
            ),
          );

          this.setData({
            imageList: [...this.data.imageList, ...files],
          });
          this.checkCanPublish();
        } catch (err: any) {
          console.error(err);
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

    this.setData({
      selectedTopics: [...this.data.selectedTopics, topic],
      selectedTopicMap: {
        ...this.data.selectedTopicMap,
        [topic]: true,
      },
      availableTopics,
      topicSearchKeyword: "",
      filteredTopicList: availableTopics,
    }, () => this.checkCanPublish());
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
      }, () => this.checkCanPublish());
    } else {
      selectedTopicMap[topic] = true;

      this.setData({
        selectedTopics: [...selectedTopics, topic],
        selectedTopicMap,
      }, () => this.checkCanPublish());
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
    const tags = [
      ...(selectedActivity?.tags || []),
      ...selectedTopics,
    ]
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
        i.durationSec > MAX_VIDEO_BURATION,
    );
    if (overDurationVideo) {
      violations.push(`视频不能超过${MAX_VIDEO_BURATION}秒`);
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
    const { canPublish, message, violations = [] } =
      this.getPublishValidation();
    console.log("message:", message);
    this.setData({ canPublish });

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
          wx.navigateBack();
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

    this.setData({ recordPopupVisible: true });
  },

  // 关闭录音弹窗
  onRecordPopupClose(e?: any) {
    if (e?.detail?.visible === false || !e?.detail) {
      this.recordTouchActive = false;
      this.recordTouchSession += 1;
      if (this.data.touchStartTimer) {
        clearTimeout(this.data.touchStartTimer);
      }
      if (this.data.recording) {
        this.setData({
          recordMode: "discard",
        });
        this.recorderManager.stop();
      }
      this.setData({
        recordPopupVisible: false,
        recordActionsAnimating: false,
        touchStartTimer: null,
        hoverTarget: "",
      });
    }
  },

  // 开始录音
  onStartRecord(e: any) {
    if (this.data.recording || !this.data.recordPopupVisible) return;

    const touch = e.touches[0];
    const touchSession = ++this.recordTouchSession;
    this.recordTouchActive = true;

    this.setData({
      touchStartTime: Date.now(),
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
    });

    if (this.data.touchStartTimer) {
      clearTimeout(this.data.touchStartTimer);
    }

    const timer = setTimeout(() => {
      this.setData({ touchStartTimer: null });
      this.checkAndStartRecord(touchSession);
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
        this.recordTouchActive = false;
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
    this.recordTouchActive = false;

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
        recordPopupVisible: false,
      });

      this.recorderManager.stop();
    }
  },

  // 检查并开始录音
  checkAndStartRecord(touchSession: number) {
    const canStart = () =>
      this.recordTouchActive &&
      this.recordTouchSession === touchSession &&
      this.data.recordPopupVisible &&
      !this.data.recording;

    if (!canStart()) return;

    wx.getSetting({
      success: (res) => {
        if (!canStart()) return;

        if (!res.authSetting["scope.record"]) {
          wx.authorize({
            scope: "scope.record",
            success: () => {
              if (canStart()) {
                this.doStartRecord();
              }
            },
            fail: () => {
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
          this.doStartRecord();
        }
      },
    });
  },

  // 真正开始录音
  doStartRecord() {
    this.setData({
      recording: true,
      recordActionsAnimating: true,
      recordTime: 0,
      recordMode: "normal",
    });

    if (this.data.recordActionsAnimationTimer) {
      clearTimeout(this.data.recordActionsAnimationTimer);
    }

    const animationTimer = setTimeout(() => {
      this.setData({
        recordActionsAnimating: false,
        recordActionsAnimationTimer: null,
      });
    }, 700);
    this.setData({ recordActionsAnimationTimer: animationTimer });

    (this as any)._recordStartTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - (this as any)._recordStartTime) / 1000,
      );
      this.setData({ recordTime: elapsed });
    }, 500);
    this.setData({ recordTimer: timer });

    this.recorderManager.start({
      duration: MAX_AUDIO_DURATION * 1000,
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

  uploadAudioFile(filePath: string) {
    return new Promise<string>((resolve, reject) => {
      const token = wx.getStorageSync("accessToken") || "";
      const dateStr = formatDate(new Date(), "YYYYMMDD");
      const timestamp = Date.now();

      wx.uploadFile({
        url: `${ENV.API_BASE_URL}/upload`,
        filePath,
        name: "file",
        formData: {
          fileName: `${dateStr}_corpus_collection_audio_${timestamp}.mp3`,
        },
        header: {
          Authorization: `Bearer ${token}`,
        },
        success: (uploadRes) => {
          let data: any = {};

          try {
            data = JSON.parse(uploadRes.data);
          } catch (err) {
            reject(new Error("返回数据解析失败"));
            return;
          }

          if (uploadRes.statusCode !== 200) {
            reject(new Error(data?.error || "上传失败"));
            return;
          }

          resolve(data.url);
        },
        fail: reject,
      });
    });
  },

  async handleRecordStop(res: any) {
    console.log("录音结束：", res);
    this.recordTouchActive = false;
    this.recordTouchSession += 1;
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
    }
    if (this.data.recordActionsAnimationTimer) {
      clearTimeout(this.data.recordActionsAnimationTimer);
    }
    const { tempFilePath, duration } = res;
    // RecorderManager 设置了 60 秒上限，但部分设备返回值会略大于 60000ms。
    // 对系统自动停止的录音按配置上限计算，避免被向上取整误判成 61 秒。
    const durationSec = Math.min(
      MAX_AUDIO_DURATION,
      Math.ceil(duration / 1000),
    );

    const { recordMode } = this.data;

    // 重置录音状态
    this.setData({
      recording: false,
      recordActionsAnimating: false,
      recordTime: 0,
      recordTimer: null,
      recordActionsAnimationTimer: null,
      touchStartTimer: null,
      hoverTarget: "",
      ...(recordMode === "normal" ? { recordPopupVisible: false } : {}),
    });

    // 丢弃模式
    if (recordMode === "discard") {
      console.log("录音已取消");
      return;
    }

    // 普通录音
    if (recordMode === "normal") {
      try {
        wx.showLoading({
          title: "上传中...",
        });

        const audioUrl = await this.uploadAudioFile(tempFilePath);

        this.setData({
          audioUrl,
          audioDuration: durationSec,
        });
        this.checkCanPublish();

        wx.showToast({
          title: `录音完成 ${durationSec}秒`,
          icon: "success",
        });
      } catch (err: any) {
        console.error(err);

        wx.showToast({
          title: err.error || err.message || "上传失败",
          icon: "none",
        });
      } finally {
        wx.hideLoading();
      }

      return;
    }

    // ASR 模式
    if (recordMode === "asr") {
      try {
        wx.showLoading({
          title: "上传中...",
        });

        const audioUrl = await this.uploadAudioFile(tempFilePath);

        wx.hideLoading();

        this.setData({
          pendingAudioUrl: audioUrl,
          pendingAudioDuration: durationSec,
          asrText: "（转换中...）",
          asrPopupVisible: true,
          recordPopupVisible: false,
        });

        const asrRes = await request("/transcriptions", {
          method: "POST",
          data: {
            audioUrl,
          },
        });
        console.log("asrRes:", asrRes);
        setTimeout(() => {
          this.setData({
            asrText: asrRes.text,
          });
        }, 800);
      } catch (err) {
        wx.hideLoading();

        console.error(err);

        wx.showToast({
          title: err.error || err.errMsg || "上传失败",
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

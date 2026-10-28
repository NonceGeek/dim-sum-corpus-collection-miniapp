import { resolveSubmissionCover } from "../../utils/submission-cover";
import { ChannelVideo, parseChannelVideo, openChannelVideo, normalizeChannelFeedId } from "../../utils/channel-video";
import request from "../../utils/http";
import ENV from "../../config/setting";
import { formatDate } from "../../utils/date";
import { guardProtectedPage, isLoggedIn, navigateToProtectedPage } from "../../utils/auth";
import uploadFileWithAuth from "../../utils/upload";

const MAX_AUDIO_DURATION = 60;
const MAX_VIDEO_DURATION = 30;
const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 400;
const MAX_IMAGE = 8;
const PRECHECK_LABEL_TEXT: Record<string, string> = {
  politics: "涉政",
  pornographic: "涉黄",
  sexualHint: "性暗示",
  sexual: "性感",
  profanity: "辱骂",
  terror: "暴恐",
  ad: "广告",
  contraband: "违禁",
  inappropriate: "不良",
  religion: "民族宗教",
};
const TEXT_PRECHECK_LABEL_TEXT: Record<string, string> = {
  violent_extremism: "极端主义或暴力血腥行为",
  violent_weapons: "武器弹药",
  pornographic_special_taste: "色情特殊癖好",
  sexual_terms_activity: "性行为描述",
  pornographic_adult_works: "色情作品",
  sexual_terms_suggestive: "性暗示",
  pornographic_adult_activity: "淫秽色情",
  sexual_terms_sex: "性教育",
  pornographic_adult_goods: "成人用品",
  pornographic_adult_trade: "色情交易",
  sexual_suggestive_rude: "低俗色情",
  sexual_suggestive_hint: "软色情",
  sexual_terms_offend: "性骚扰",
  sexual_terms_physical: "性生理科普",
  sexual_terms_kiss: "不当亲吻描述",
  sexual_terms_animal: "动物繁殖科普",
  pornographic_lgbtq_group: "LGBTQ+相关",
  contraband_drug: "毒品相关",
  contraband_gambling: "赌博相关",
  contraband_entity: "违禁工具",
  contraband_act_threat: "威胁行为",
  contraband_act_law: "违法犯罪行为",
  contraband_fraud: "传销或诈骗",
  customized_p: "自定义词库",
  customized: "自定义词库",
  special_language: "特殊语言",
  inappropriate_minor_sex: "未成年人色情",
  inappropriate_minor_behavior: "未成年人不当行为",
  inappropriate_minor_abuse: "虐待或剥削未成年人",
  inappropriate_suicide: "自残或自杀",
  inappropriate_minor_safty: "危害未成年人安全",
  inappropriate_minor_relationship: "未成年人不当交友",
  inappropriate_minor_phychology: "影响未成年人心理健康",
  inappropriate_discrimination: "偏见或歧视",
  inappropriate_superstition: "封建迷信",
  inappropriate_minor_addiction: "未成年人防沉迷规避",
  inappropriate_oral: "低俗口头语",
  inappropriate_profanity: "辱骂或冒犯",
  inappropriate_nonsense: "无意义灌水",
  inappropriate_minor_mention: "未成年人相关",
  inappropriate_ethics: "违背伦理道德",
  political_country_humans: "国家拟人化",
  political_past_coreleader: "历任国家核心领导人相关",
  political_sensitive_event: "其他政治敏感事件",
  political_rights_conflict: "维权冲突",
  political_foreign_leader: "外国领导人相关",
  political_cn_ideology: "意识形态违规",
  political_event_internationality: "现代政治事件或国际关系",
  political_cn_otherleader: "中国其他重要领导人相关",
  political_private_family: "核心领导人未公开家属相关",
  political_negative_group: "负面人物或组织",
  political_known_family: "核心领导人公开家属相关",
  political_limited_event: "重大政治敏感事件",
  political_unproper_coreleader: "核心领导人不当描述",
  political_current_coreleader: "现任国家核心领导人相关",
  political_cn_separatism: "中国领土分裂",
  political_cn_entity: "政治实体",
  political_a: "高优先级政治敏感",
  privacy_b: "商业敏感数据",
  privacy_p: "个人隐私信息",
  pt_by_spam: "垃圾广告",
  pt_to_sites: "站外引流",
  pt_to_phone: "电话号码",
  pt_to_contact: "广告联系方式",
  pt_by_tradeingame: "游戏交易广告",
  religion_b: "佛教相关",
  religion_c: "基督教相关",
  religion_t: "道教相关",
  religion_h: "印度教相关",
  religion_i: "伊斯兰教相关",
  violent_extremist: "极端组织",
  violent_incidents: "极端主义事件",
  sexual_suggestive: "低俗",
  pornographic_adult: "色情",
  sexual_terms: "性健康",
  contraband_act: "违禁行为",
  inappropriate_minor: "未成年人不当",
  political_entity: "政治实体",
  political_n: "敏感政治",
  political_other_negative: "其他非法组织",
  political_p: "政治敏感人物",
  political_main_negative: "重大非法组织",
  political_figure: "政治人物",
  pt_by_recruitment: "网络兼职或网赚广告",
};
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

// iOS 上 InnerAudioContext 默认 obeyMuteSwitch=true：手机静音键打开时录音回放完全没声音；
// 且录音结束后音频会话仍是录音模式，不显式设置会走听筒而不是扬声器。
const applyPlaybackAudioOption = () => {
  try {
    wx.setInnerAudioOption({
      obeyMuteSwitch: false,
      speakerOn: true,
      fail: () => {},
    });
  } catch (err) {
    console.warn("setInnerAudioOption 失败", err);
  }
};

const TYPES = ENV.TYPE;

const getMediaPolicy = (activity: any) => {
  const hasActivity = Boolean(activity?.id);
  const requiredTypes = activity?.mediaRequirements?.requiredTypes || [];
  const hasImage = requiredTypes.includes("image");
  const hasVideo = requiredTypes.includes("video");
  const hasAudio = requiredTypes.includes("audio");
  // 视频作品可以额外上传 1 张封面；封面不改变活动支持的正文媒体组合。
  const maxImageCount = !hasActivity || hasImage ? MAX_IMAGE : hasVideo ? 1 : 0;
  const maxVideoCount = !hasActivity || hasVideo ? 1 : 0;

  return {
    hasActivity,
    requiredTypes,
    supportsImageUpload: !hasActivity || hasImage,
    allowImageUpload: maxImageCount > 0,
    allowVideoUpload: maxVideoCount > 0,
    allowAudioUpload: !hasActivity || hasAudio,
    maxImageCount,
    maxVideoCount,
  };
};

const hasCompletedQuestionnaireProfile = () => {
  const status = getApp<any>().globalData?.questionnaireStatus;
  return status?.completed === true && status?.phoneVerified === true;
};

Page({
  data: {
    channelVideo: null as ChannelVideo | null,
    inheritedCoverUrl: "",
    resolvedCoverUrl: "",
    coverLabel: "未设置封面，列表将显示默认作品卡片",
    previewVisible: false,
    localVideo: null as any,
    imageCount: 0,
    supportsBodyImages: true,
    mediaUploading: false,
    channelEditorVisible: false,
    channelHelpExpanded: false,
    channelCopyError: "",
    channelCopyFallbackUrl: "",
    channelFinderDraft: "",
    channelFeedDraft: "",
    channelFeedAutosize: { minHeight: 72, maxHeight: 96 },
    channelError: "",
    channelOpening: false,
    submitting: false,
    mode: "",
    entryActivityId: "",
    questionnaireJourneyId: "",
    currentTheme: "light",
    post: {} as any,
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
    imageList: [] as { type: string; url: string; durationSec?: number; sortOrder?: number; metadata?: any }[],
    allowImageUpload: true,
    allowVideoUpload: true,
    allowAudioUpload: true,
    canChooseVisualMedia: true,
    showVideoCoverUpload: false,
    selectedTopics: [] as string[],
    selectedTopicMap: {} as Record<string, boolean>,
    canPublish: false,
    pickerVisible: false,
    pickerValue: [],
    selectionPopupProps: {
      zIndex: 11500,
      overlayProps: {
        zIndex: 11400,
      },
    },
    selectionPopupOverlayProps: {
      zIndex: 11400,
    },
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
    recordTime: 0,
    recordTimer: null as any,
    audioUrl: "",
    audioDuration: 0,
    audioPlaying: false,
    pendingRecordPlaying: false,
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
    joinConsentPopupVisible: false,
    joinConsentActivityId: "",
    // journey 绑定的活动（自由投稿为空串），服务端要求与投稿 activityId 一致。
    questionnaireJourneyActivityId: "",
    // 投稿被问卷门禁拒绝后重新走问卷：关闭弹窗时保留草稿，不退出页面。
    questionnaireRetrying: false,
  },
  audioStateHandler: null as any,
  audioErrorHandler: null as any,
  pendingRecordAudioContext: null as any,
  pendingRecordPlaybackPath: "",
  pendingRecordLongPressAt: 0,
  allowRecordPopupClose: false,
  recordCancelledOnHide: false,
  exitConfirmVisible: false,
  pageExitConfirmed: false,
  pendingPageExit: false,

  async onLoad(options) {
    const { tag, id, mode, questionnaireJourneyId, questionnaireActivityId } =
      options;
    console.log('onLoad options:', options);
    const pageMode = mode || "edit";
    this.syncTheme();
    wx.showShareMenu({ menus: ["shareAppMessage"] });

    const query = [
      tag ? `tag=${encodeURIComponent(tag)}` : "",
      id ? `id=${encodeURIComponent(id)}` : "",
      questionnaireJourneyId
        ? `questionnaireJourneyId=${encodeURIComponent(questionnaireJourneyId)}`
        : "",
      questionnaireActivityId
        ? `questionnaireActivityId=${encodeURIComponent(questionnaireActivityId)}`
        : "",
      `mode=${encodeURIComponent(pageMode)}`,
    ]
      .filter(Boolean)
      .join("&");
    const currentUrl = `/pages/post/post?${query}`;

    if (pageMode !== "view" && !guardProtectedPage(currentUrl)) {
      return;
    }

    const userInfo = wx.getStorageSync("userInfo");

    this.setData(
      {
        mode: pageMode,
        entryActivityId: tag || "",
        questionnaireJourneyId: questionnaireJourneyId || "",
        // 活动页带 tag 进入时 journey 就是为该活动创建的；查看页转编辑时单独传。
        questionnaireJourneyActivityId: questionnaireActivityId || tag || "",
        userId: userInfo?.id || "",
        exitGuardVisible: pageMode === "edit",
      },
      async () => {
        try {
          tag && (await this.loadTrack(tag));
          const postLoaded = id
            ? await this.loadPost(id, {
                retryOnFailure: pageMode === "view",
              })
            : false;
          const { mode } = this.data;
          if (mode === "view" && postLoaded && isLoggedIn()) {
            const view = await request(`/works/${id}/view`, { method: "POST" });
            this.setData({ view: view?.viewCount });
          }
          const globalQuestionnaireStatus =
            getApp<any>().globalData?.questionnaireStatus;
          const cachedQuestionnaireStatus =
            wx.getStorageSync("userInfo")?.questionnaireStatus;
          console.log("[questionnaire-debug][post:onLoad]", {
            mode,
            questionnaireJourneyId: this.data.questionnaireJourneyId,
            globalQuestionnaireStatus,
            cachedQuestionnaireStatus,
            hasCompletedQuestionnaireProfile:
              hasCompletedQuestionnaireProfile(),
          });
          if (
            mode === "edit" &&
            (!id || postLoaded) &&
            !this.data.questionnaireJourneyId
          ) {
            const activityId =
              (this.data.post as any)?.activity?.id ||
              this.data.selectedActivity?.id ||
              this.data.entryActivityId ||
              "";
            this.setData({
              joinConsentActivityId: activityId,
              joinConsentPopupVisible: true,
            });
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
    this.clearPendingRecordPlayback();
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
    if (this.data.recording && !this.data.recordStopping) {
      this.setData({ recordMode: "discard" });
      sharedRecorderManager.stop();
    }
  },
  onShareAppMessage() {
    const { post, resolvedCoverUrl } = this.data;
    return {
      title: post.title || "投稿页面",
      path: post?.id
        ? `/pages/post/post?id=${encodeURIComponent(post.id)}&mode=view`
        : "/pages/post/post",
      ...(resolvedCoverUrl ? { imageUrl: resolvedCoverUrl } : {}),
    };
  },

  async loadTrack(id: string) {
    wx.showLoading({ title: "加载活动中...", mask: true });
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
            ...this.getMediaPolicyState(track),
          },
          resolve,
        );
      });
      this.checkCanPublish();
      return true;
    } catch (err: any) {
      console.log("获取活动数据失败", err);
      this.showPostDialog({
        title: "获取活动数据失败",
        content: err.error + "，请稍后重试",
      });
      return false;
    } finally {
      wx.hideLoading();
    }
  },

  async loadPost(
    id: string,
    options: {
      retryOnFailure?: boolean;
      showLoading?: boolean;
    } = {},
  ): Promise<boolean> {
    const { retryOnFailure = false, showLoading = true } = options;
    if (showLoading) {
      wx.showLoading({ title: "加载中...", mask: true });
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
        channelVideo: res.channelVideo || null,
        inheritedCoverUrl: res.coverUrl || "",


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
        ...this.getMediaPolicyState(selectedActivity),
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
        this.showPostDialog({
          title: "获取投稿数据失败",
          content: `${err?.error || err?.message || "请求失败"}，请稍后再试`,
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
    this.stopPendingRecordPlayback();
    this.stopAudioPlayback();
    if (!this.data.recording) return;

    const alreadyStopping = this.data.recordStopping;
    this.recordCancelledOnHide = true;
    wx.disableAlertBeforeUnload();
    this.setData({ recordMode: "discard", recordStopping: true });
    if (!alreadyStopping) {
      sharedRecorderManager.stop();
    }
  },

  syncTheme() {
    const app = getApp<any>();
    const currentTheme = app.getTheme() || "light";
    this.setData({ currentTheme });
  },

  getMediaPolicyState(activity: any) {
    const mediaPolicy = getMediaPolicy(activity);
    return {
      allowImageUpload: mediaPolicy.allowImageUpload,
      allowVideoUpload: mediaPolicy.allowVideoUpload,
      allowAudioUpload: mediaPolicy.allowAudioUpload,
    };
  },

  getPendingRecordingResetState() {
    return {
      recordReady: false,
      recordTime: 0,
      pendingRecordPlaying: false,
      pendingRecordPath: "",
      pendingRecordDuration: 0,
    };
  },

  showPostDialog(options: {
    title: string;
    content: string;
    showCancel?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    onComplete?: () => void;
  }) {
    const dialog = this.selectComponent("#common-dialog") as any;
    dialog?.open(options);
  },

  // 显示类型选择器
  onShowTypePicker() {
    this.setData({ pickerVisible: true });
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
    }).catch((error) => {
      console.error("媒体上传请求失败：", error);
      throw error;
    });
    console.log("媒体上传返回：", res);

    const statusCode = String(res.statusCode).trim();
    if (statusCode === "413") {
      throw Object.assign(new Error("文件过大，无法上传"), {
        statusCode: res.statusCode,
      });
    }

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

  onRemoveInheritedCover() {
    this.setData({ inheritedCoverUrl: "" }, () => this.checkCanPublish());
  },
  onPreviewSubmission() {
    if (this.data.mediaUploading || this.data.submitting) return;
    if (this.data.recording || this.data.recordStarting || this.data.recordStopping || this.data.recordProcessing) {
      wx.showToast({ title: "请先完成录音处理", icon: "none" }); return;
    }
    this.stopAudioPlayback();
    this.checkCanPublish();
    this.setData({ previewVisible: true });
  },
  onClosePreview() { this.stopAudioPlayback(); this.setData({ previewVisible: false }); },
  onPreviewVisibleChange(e: any) { if (!e.detail.visible) this.onClosePreview(); },
  onChooseLocalVideo() { this.onChooseImage(true); },
  onRemoveLocalVideo() {
    this.showPostDialog({ title: "移除本地视频？", content: "其他已填写内容会保留。", showCancel: true,
      onConfirm: () => this.setData({ imageList: this.data.imageList.filter(item => item.type !== "video") }, () => this.checkCanPublish()) });
  },
  onChooseCover() {
    if (this.data.mediaUploading) return;
    wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"],
      success: async (result) => {
        this.setData({ mediaUploading: true });
        wx.showLoading({ title: "上传封面中", mask: true });
        try {
          const file = await this.compressMediaFile({ type: "image", url: result.tempFiles[0].tempFilePath });
          const uploaded = await this.uploadMediaFile(file, formatDate(new Date(), "YYYYMMDD"), `${Date.now()}_cover`);
          this.setData({ inheritedCoverUrl: uploaded.url }, () => this.checkCanPublish());
        } catch (error: any) {
          this.showPostDialog({ title: "封面上传失败", content: error?.message || "请稍后重试，原封面已保留" });
        } finally { this.setData({ mediaUploading: false }); wx.hideLoading(); }
      }
    });
  },
  onEditChannel() {
    if (this.data.mediaUploading) return;
    this.setData({ channelEditorVisible: true, channelHelpExpanded: false,
      channelFinderDraft: this.data.channelVideo?.finderUserName || "",
      channelFeedDraft: this.data.channelVideo?.feedId || "", channelError: "" });
  },
  onToggleChannelHelp() {
    this.setData({ channelHelpExpanded: !this.data.channelHelpExpanded });
  },
  onCopyChannelHelpLink(e: any) {
    const link = e.currentTarget?.dataset?.link || e.detail?.currentTarget?.dataset?.link;
    const urls: Record<string, string> = {
      assistant: "https://channels.weixin.qq.com/",
      guide: "https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/channels-activity.html",
    };
    const url = urls[link];
    if (!url) return;
    this.setData({ channelCopyError: "", channelCopyFallbackUrl: "" });
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "链接已复制", icon: "success" }),
      fail: (error) => {
        const detail = error?.errMsg || "微信未返回具体错误";
        console.warn("[channel-help clipboard]", detail);
        const message = detail.includes("api scope is not declared in the privacy agreement")
          ? "小程序暂未完成复制功能的隐私声明，自动复制暂不可用。请长按下方链接手动复制。"
          : "暂时无法自动复制，请长按下方链接手动复制，或稍后重试。";
        this.setData({ channelCopyError: message, channelCopyFallbackUrl: url });
      },
    });
  },
  onChannelFinderInput(e: any) { this.setData({ channelFinderDraft: e.detail.value, channelError: "" }); },
  onChannelFeedInput(e: any) { this.setData({ channelFeedDraft: normalizeChannelFeedId(e.detail.value), channelError: "" }); },
  onClearChannelFeed() { this.setData({ channelFeedDraft: "", channelError: "" }); },
  onCloseChannelEditor() { this.setData({ channelEditorVisible: false }); },
  onChannelPopupChange(e: any) { if (!e.detail.visible) this.onCloseChannelEditor(); },
  getChannelDraft() {
    const value = parseChannelVideo(this.data.channelFinderDraft, this.data.channelFeedDraft);
    if (!value) this.setData({ channelError: "请完整复制两个 ID（各最多 1024 字符）。作品 ID 可保留开头的 export/，不要填写普通分享链接或其他路径。" });
    if (value) this.setData({ channelFinderDraft: value.finderUserName, channelFeedDraft: value.feedId });
    return value;
  },
  onSaveChannel() {
    const value = this.getChannelDraft();
    if (!value) return;
    this.setData({ channelVideo: value, channelEditorVisible: false }, () => this.checkCanPublish());
  },
  onRemoveChannel() {
    this.showPostDialog({ title: "移除视频号作品？", content: "已填写的文字、图片、录音和本地视频会保留。",
      showCancel: true, confirmText: "移除", onConfirm: () => this.setData({ channelVideo: null }, () => this.checkCanPublish()) });
  },
  async onOpenChannel(e: any) {
    if (this.data.channelOpening) return;
    if (this.data.recording || this.data.recordStarting || this.data.recordStopping || this.data.recordProcessing) {
      wx.showToast({ title: "请先完成录音处理", icon: "none" }); return;
    }
    const value = e.currentTarget.dataset.draft ? this.getChannelDraft() : this.data.channelVideo;
    if (!value) return;
    this.stopAudioPlayback();
    this.setData({ channelOpening: true });
    try { await openChannelVideo(value); }
    catch (error: any) {
      const message = error?.message || "暂时无法打开作品，请稍后重试";
      if (e.currentTarget.dataset.draft) this.setData({ channelError: message });
      this.showPostDialog({ title: "无法打开视频号", content: message });
    }
    finally { this.setData({ channelOpening: false }); }
  },

  // 选择图片
  async onChooseImage(chooseVideo: unknown = false) {
    if (this.data.mediaUploading) return;
    const mediaPolicy = getMediaPolicy(this.data.selectedActivity);
    const { maxImageCount, maxVideoCount } = mediaPolicy;
    const currentImageCount = this.data.imageList.filter(
      (file) => file.type === "image",
    ).length;
    const currentVideoCount = this.data.imageList.filter(
      (file) => file.type === "video",
    ).length;
    const ruleDescription = [
      mediaPolicy.allowImageUpload
        ? mediaPolicy.maxImageCount === 1
          ? "封面：1张"
          : "图片：最多8张"
        : "图片：不支持上传",
      mediaPolicy.allowVideoUpload
        ? "视频：最多1个，且不能超过30秒"
        : "视频：不支持上传",
      "图片、录音、视频至少选择一种",
    ].join("\n");
    const canChooseImageNow =
      mediaPolicy.supportsImageUpload || currentVideoCount > 0;
    const remainingImageCount = canChooseImageNow
      ? Math.max(maxImageCount - currentImageCount, 0)
      : 0;
    const remainingVideoCount = Math.max(maxVideoCount - currentVideoCount, 0);
    const maxCount = chooseVideo === true ? remainingVideoCount : remainingImageCount;

    if (maxCount === 0) {
      if (mediaPolicy.hasActivity) {
        this.showPostDialog({
          title: "已达到该活动媒体上限",
          content: ruleDescription,
        });
      } else {
        wx.showToast({ title: "已达到媒体数量上限", icon: "none" });
      }
      return;
    }

    const mediaType = [
      ...(remainingImageCount > 0 && chooseVideo !== true ? ["image" as const] : []),
      ...(remainingVideoCount > 0 && chooseVideo === true ? ["video" as const] : []),
    ];
    wx.chooseMedia({
      count: maxCount,
      mediaType,
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      // wx.chooseMedia 只允许相机拍摄时长为 3～30 秒；相册视频同样校验30秒业务上限。
      maxDuration: MAX_VIDEO_DURATION,
      success: async (res) => {
        this.setData({ mediaUploading: true });
        try {
          wx.showLoading({ title: "压缩中...", mask: true });

          const selectedFiles = res.tempFiles.map((file: any) => ({
            url: file.tempFilePath,
            type: file.fileType === "video" ? "video" : "image",
            ...(file.fileType === "video"
              ? {
                  durationSec: file.duration,
                  thumbTempFilePath: file.thumbTempFilePath || "",
                }
              : {}),
          }));
          const selectedImageCount = selectedFiles.filter(
            (file) => file.type === "image",
          ).length;
          const selectedVideoCount = selectedFiles.filter(
            (file) => file.type === "video",
          ).length;
          const selectedVideo = selectedFiles.find(
            (file) => file.type === "video",
          );
          const tempFiles = selectedFiles;
          const uploadImageCount = selectedImageCount;

          if (
            currentImageCount + uploadImageCount > maxImageCount ||
            currentVideoCount + selectedVideoCount > maxVideoCount
          ) {
            this.showPostDialog({
              title: "提示",
              content: ruleDescription,
            });
            return;
          }

          const overDurationVideo = tempFiles.find(
            (file) =>
              file.type === "video" && file.durationSec > MAX_VIDEO_DURATION,
          );

          if (overDurationVideo) {
            this.showPostDialog({
              title: "提示",
              content: `视频不能超过${MAX_VIDEO_DURATION}秒`,
            });
            return;
          }

          const uploadCandidates = tempFiles.map((file: any) => {
            const uploadFile = { ...file };
            delete uploadFile.thumbTempFilePath;
            return uploadFile;
          });
          const compressedFiles = await Promise.all(
            uploadCandidates.map((file) => this.compressMediaFile(file)),
          );

          wx.showLoading({ title: "上传中...", mask: true });

          const timestamp = Date.now();
          const dateStr = formatDate(new Date(), "YYYYMMDD");
          const files = await Promise.all(
            compressedFiles.map((file, index) =>
              this.uploadMediaFile(file, dateStr, `${timestamp}_${index}`),
            ),
          );

          // 缩略图只保存为视频元数据，不作为正文图片上传。
          if (selectedVideo?.thumbTempFilePath) {
            try {
              const thumbnail = await this.uploadMediaFile(
                { type: "image", url: selectedVideo.thumbTempFilePath }, dateStr, `${timestamp}_thumbnail`);
              const video = files.find(file => file.type === "video");
              if (video) video.metadata = { ...video.metadata, thumbnailUrl: thumbnail.url };
            } catch {
              wx.showToast({ title: "缩略图获取失败，可另选封面", icon: "none" });
            }
          }
          this.setData({
            imageList: [...this.data.imageList, ...files],
          });
          this.checkCanPublish();
        } catch (err: any) {
          console.error(err);
          if (err?.code === "AUTH_REQUIRED") {
            return;
          }
          this.showPostDialog({
            title: "上传失败",
            content:
              (err?.message || err?.errMsg || err?.error || "操作失败") +
              "，请稍后重试",
          });
        } finally {
          this.setData({ mediaUploading: false });
          wx.hideLoading();
        }
      },
      fail: (err) => {
        if (err.errMsg?.includes("cancel")) return;
        console.error("选择图片或视频失败：", err);
        this.showPostDialog({
          title: "无法选择图片或视频",
          content: err.errMsg || "请检查相册和相机权限后重试",
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
    const selectedActivity = { id: "", title: "不参与任何活动" };
    this.setData({
      selectedActivity,
      ...this.getMediaPolicyState(selectedActivity),
      activityPopupVisible: false,
      typeOptions: TYPES,
    });
    this.syncQuestionnaireJourneyWithActivity();
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
      this.syncQuestionnaireJourneyWithActivity();
      this.checkCanPublish(hasUploadedMedia);
    }
  },

  // journey 只对创建时的活动有效（服务端校验同一活动/同为自由投稿）。
  // 换活动后作废旧 journey：拿到过 journey 说明登记已完成，
  // 提交时省略 questionnaireJourneyId，由服务端为新活动补建 reused journey。
  syncQuestionnaireJourneyWithActivity() {
    if (!this.data.questionnaireJourneyId) return;
    const currentActivityId = String(this.data.selectedActivity?.id || "");
    if (currentActivityId === this.data.questionnaireJourneyActivityId) return;
    this.setData({
      questionnaireJourneyId: "",
      questionnaireJourneyActivityId: "",
    });
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
    const mediaPolicy = getMediaPolicy(selectedActivity);
    const violations: string[] = [];
    const tags = [...(selectedActivity?.tags || []), ...selectedTopics]
      .map((tag) => this.normalizeTopic(tag))
      .filter(Boolean);

    const imageCount = imageList.filter((i) => i.type === "image").length;
    const videoCount = imageList.filter((i) => i.type === "video").length;
    const channel = this.data.channelVideo;
    const effectiveVideoCount = videoCount;
    const hasAnyMedia = imageCount > 0 || effectiveVideoCount > 0 || Boolean(audioUrl);
    if (channel && !parseChannelVideo(channel.finderUserName, channel.feedId)) violations.push("请修改视频号作品 ID");

    if (title.length > MAX_TITLE_LENGTH) {
      violations.push(`标题不能超过${MAX_TITLE_LENGTH}字符`);
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      violations.push(`内容简介不能超过${MAX_CONTENT_LENGTH}字符`);
    }

    if (mediaPolicy.hasActivity && mediaPolicy.requiredTypes.length === 0) {
      violations.push("该活动未配置投稿媒体类型");
    }

    if (!mediaPolicy.allowImageUpload && imageCount > 0) {
      violations.push("该活动不支持上传图片");
    } else if (
      !mediaPolicy.supportsImageUpload &&
      effectiveVideoCount === 0 &&
      imageCount > 0
    ) {
      violations.push("视频封面需与视频一起上传");
    } else if (imageCount > mediaPolicy.maxImageCount) {
      violations.push(
        `图片最多上传${mediaPolicy.maxImageCount}张，当前有${imageCount}张`,
      );
    }

    if (!mediaPolicy.allowVideoUpload && videoCount > 0) {
      violations.push("该活动不支持上传视频");
    } else if (
      mediaPolicy.requiredTypes.length === 1 &&
      mediaPolicy.requiredTypes[0] === "video" &&
      effectiveVideoCount === 0
    ) {
      violations.push("请上传本地视频，视频号关联不替代活动要求");
    } else if (videoCount > 1) {
      violations.push(`视频只能上传1个，当前有${videoCount}个`);
    }

    if (!mediaPolicy.allowAudioUpload && audioUrl) {
      violations.push("该活动不支持上传录音");
    }

    if (!hasAnyMedia) {
      violations.push("请添加活动支持的图片、录音或本地视频");
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

    const message = !selectedType
      ? "请选择类型"
      : !title.trim()
        ? "请填写标题"
        : !content.trim()
          ? "请填写内容简介"
          : title.length > MAX_TITLE_LENGTH
            ? `标题不能超过${MAX_TITLE_LENGTH}字符`
            : content.length > MAX_CONTENT_LENGTH
              ? `内容简介不能超过${MAX_CONTENT_LENGTH}字符`
              : tags.length === 0
                ? "请添加标签"
                : violations[0] || "";

    return {
      canPublish:
        Boolean(selectedType) &&
        Boolean(title.trim()) &&
        Boolean(content.trim()) &&
        title.length <= MAX_TITLE_LENGTH &&
        content.length <= MAX_CONTENT_LENGTH &&
        tags.length > 0 &&
        violations.length === 0,
      message,
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
    const mediaPolicy = getMediaPolicy(this.data.selectedActivity);
    const imageCount = this.data.imageList.filter(
      (item) => item.type === "image",
    ).length;
    const videoCount = this.data.imageList.filter(
      (item) => item.type === "video",
    ).length;
    const canChooseVisualMedia =
      ((mediaPolicy.supportsImageUpload || videoCount > 0) &&
        imageCount < mediaPolicy.maxImageCount) ||
      (videoCount < mediaPolicy.maxVideoCount);
    const showVideoCoverUpload = videoCount === 1 && imageCount === 0;
    const cover = resolveSubmissionCover(this.data.inheritedCoverUrl, this.data.imageList);
    this.setData({ canPublish, canChooseVisualMedia, showVideoCoverUpload,
      resolvedCoverUrl: cover.url, coverLabel: cover.label, imageCount,
      localVideo: this.data.imageList.find(item => item.type === "video") || null,
      supportsBodyImages: mediaPolicy.supportsImageUpload,
    });
    this.syncUnsavedExitGuard();

    if (!showMediaRuleError) {
      return;
    }

    if (violations.length > 0) {
      this.showPostDialog({
        title: "当前媒体不符合活动规则",
        content:
          violations.map((item) => `• ${item}`).join("\n") +
          "\n\n请调整后再发布。",
      });
    }
  },
  // 取消发布
  onCancel() {
    this.onExitGuardBeforeLeave();
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
      this.data.channelVideo ||
      this.data.inheritedCoverUrl ||
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

    if (this.exitConfirmVisible) {
      this.setData({ exitGuardVisible: false });
      return;
    }

    const isRecording = this.data.recording || this.data.recordStopping;
    if (!isRecording && !this.hasUnsavedPostContent()) {
      this.leavePostPageAfterPublish();
      return;
    }

    this.setData({ exitGuardVisible: false });
    this.exitConfirmVisible = true;
    this.showPostDialog({
      title: isRecording ? "录音正在进行" : "提示",
      content: isRecording
        ? "退出将取消本次录音，是否确认退出？"
        : "确定要放弃编辑吗？",
      showCancel: true,
      confirmText: "确认退出",
      cancelText: "继续编辑",
      onConfirm: () => {
        if (isRecording) {
          const alreadyStopping = this.data.recordStopping;
          this.setData({ recordMode: "discard", recordStopping: true });
          if (!alreadyStopping) {
            sharedRecorderManager.stop();
          }
        }
        this.leavePostPageAfterPublish();
      },
      onCancel: () => {
        this.setData({ exitGuardVisible: true });
      },
      onComplete: () => {
        this.exitConfirmVisible = false;
      },
    });
  },

  leavePostPageAfterPublish() {
    if (this.pageExitConfirmed) return;
    this.pageExitConfirmed = true;
    this.pendingPageExit = true;
    wx.disableAlertBeforeUnload();
    if (this.data.exitGuardVisible) {
      this.setData({ exitGuardVisible: false }, () => {
        // 某些设备取消边缘手势时不会稳定触发 afterleave，主动完成真实页面退出。
        wx.nextTick(() => this.finishPostPageExit());
      });
      return;
    }
    this.finishPostPageExit();
  },

  onExitGuardAfterLeave() {
    if (this.pendingPageExit) {
      this.finishPostPageExit();
    }
  },

  finishPostPageExit() {
    if (!this.pendingPageExit) return;
    this.pendingPageExit = false;

    const activityId = this.data.entryActivityId;
    const url = activityId
      ? `/pages/tracks/tracks?id=${encodeURIComponent(activityId)}`
      : "/pages/index/index";

    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        fail: () =>
          wx.redirectTo({
            url,
            fail: () => wx.reLaunch({ url }),
          }),
      });
      return;
    }

    wx.redirectTo({
      url,
      fail: () => wx.reLaunch({ url }),
    });
  },

  // 导航栏返回
  onNavbarBack() {
    this.onCancel();
  },

  // 发布内容
  async onPublish() {
    if (this.data.submitting || this.data.mediaUploading) return;
    const validation = this.getPublishValidation();
    console.log("validation:", validation);
    if (!validation.canPublish) {
      if (validation.message) {
        this.showPostDialog({
          title: "提示",
          content: validation.message,
        });
      }
      return;
    }

    this.syncQuestionnaireJourneyWithActivity();
    this.setData({ submitting: true });
    wx.showLoading({ title: "正在提交中...", mask: true });
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
    const questionnaireJourneyId = this.data.questionnaireJourneyId;

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
        ? {
            activityId: selectedActivity.id,
          }
        : {}),
      ...(questionnaireJourneyId
        ? { questionnaireJourneyId }
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
      channelVideo: this.data.channelVideo,
      coverUrl: resolveSubmissionCover(this.data.inheritedCoverUrl, imageList).url || null,
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

    let submitted = false;
    try {
      const precheck = await request("/submissions/precheck", {
        method: "POST",
        data: {
          title: publishData.title,
          intro: publishData.intro,
          images: [...new Set([...imagePrecheck, ...(publishData.coverUrl ? [publishData.coverUrl] : [])])],
          channelVideo: this.data.channelVideo,
        },
      });
      console.log("precheck:", precheck);

      if (!precheck || precheck.error || !["pass", "reject"].includes(precheck.verdict)) {
        wx.hideLoading();
        this.showPostDialog({
          title: "预检暂未完成",
          content: "内容检查服务暂时不可用，请稍后重试。这不代表投稿内容违规，填写的内容已保留。",
        });
        return;
      }

      if (precheck.verdict === "reject") {
        wx.hideLoading();
        const imageIssues = Array.isArray(precheck.details?.images)
          ? precheck.details.images
              .filter((item: any) => item?.verdict === "reject")
              .map((item: any) => {
                const imageNumber = Number.isInteger(item?.index)
                  ? item.index + 1
                  : "未知";
                const labels = Array.isArray(item?.labels)
                  ? item.labels
                      .map(
                        (label: string) => PRECHECK_LABEL_TEXT[label] || label,
                      )
                      .filter(Boolean)
                      .join("、")
                  : "";
                return `第${imageNumber}张图片疑似含有${labels || "违规"}内容`;
              })
          : [];
        const textLabels = Array.isArray(precheck.details?.text?.labels)
          ? precheck.details.text.labels
              .map(
                (label: string) =>
                  TEXT_PRECHECK_LABEL_TEXT[label] ||
                  PRECHECK_LABEL_TEXT[label] ||
                  label,
              )
              .filter(Boolean)
              .join("、")
          : "";
        const textIssue =
          precheck.details?.text?.verdict === "reject"
            ? `文字内容疑似含有${textLabels || "违规"}内容`
            : "";
        const detailIssues = [textIssue, ...imageIssues].filter(Boolean);
        this.showPostDialog({
          title: "提示",
          content:
            (detailIssues.length > 0
              ? `${detailIssues.join("；")}，请修改后重试`
              : precheck.error) || "内容审核未通过",
        });
        return;
      }

      if (publishData.channelVideo && (precheck.requiresManualReview !== true || precheck.channelVideoChecked !== false)) {
        wx.hideLoading();
        this.showPostDialog({ title: "暂时无法提交视频号作品", content: "服务端尚未支持视频号人工审核，请稍后重试。已填写内容会保留。" });
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

      if (
        submission.error === "QUESTIONNAIRE_REQUIRED" ||
        submission.error === "JOURNEY_EXPIRED"
      ) {
        this.restartQuestionnaireGate();
      } else if (submission.error) {
        this.showPostDialog({
          title: "错误提示",
          content: submission.message || submission.error,
        });
      } else {
        submitted = true;
        wx.showToast({
          title: this.data.channelVideo ? "已提交，等待人工审核" : existedPostEdit ? "修改成功" : "发布成功",
          icon: "success",
          duration: 1500,
        });
        setTimeout(() => {
          this.leavePostPageAfterPublish();
        }, 1500);
      }
    } catch (err: any) {
      wx.hideLoading();
      console.error("发布失败：", err);
      this.showPostDialog({
        title: "发布失败",
        content: err?.error || err?.message || "请稍后重试",
      });
    } finally {
      if (!submitted) this.setData({ submitting: false });
    }
  },

  // 打开录音弹窗
  onOpenRecordPopup() {
    this.stopAudioPlayback();
    this.allowRecordPopupClose = false;
    this.setData({ recordPopupVisible: true });
  },

  closeRecordPopup() {
    this.stopPendingRecordPlayback();
    this.allowRecordPopupClose = true;
    this.setData({ recordPopupVisible: false }, () => {
      setTimeout(() => {
        this.allowRecordPopupClose = false;
      }, 100);
    });
  },

  onRecordPopupCloseTap() {
    this.onRecordPopupClose();
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
        this.showPostDialog({
          title: "录音正在进行",
          content: "退出将取消本次录音，是否确认退出？",
          showCancel: true,
          confirmText: "取消录音",
          cancelText: "继续录音",
          onConfirm: () => {
            wx.disableAlertBeforeUnload();
            this.setData({
              recordMode: "discard",
              recording: false,
              recordStopping: true,
            });
            this.closeRecordPopup();
            if (!alreadyStopping) {
              sharedRecorderManager.stop();
            }
          },
          onCancel: () => {
            this.setData({ recordPopupVisible: true });
          },
        });
        this.setData({ recordPopupVisible: true });
        return;
      }

      this.setData(
        {
          ...this.getPendingRecordingResetState(),
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
      sharedRecorderManager.stop();
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

              this.showPostDialog({
                title: "需要录音权限",
                content: "开启录音权限后才能使用语音功能",
                showCancel: true,
                confirmText: "去开启",
                cancelText: "取消",
                onConfirm: () => {
                  wx.openSetting({
                    success: (settingRes) => {
                      // 用户重新开启
                      if (
                        settingRes.authSetting["scope.record"] && canStart()
                      ) {
                        this.doStartRecord();
                      }
                    },
                  });
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
    this.clearPendingRecordPlayback();
    this.stopAudioPlayback();
    activeRecorderStopHandler = this.handleRecordStop;
    this.setData({
      ...this.getPendingRecordingResetState(),
      recordStarting: false,
      recording: true,
      recordStopping: false,
      recordMode: "normal",
    });

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

    sharedRecorderManager.start({
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
    this.clearPendingRecordPlayback();
    this.setData(
      {
        ...this.getPendingRecordingResetState(),
      },
      () => this.syncUnsavedExitGuard(),
    );
  },

  // “使用原音”先询问是否需要转文字。
  onUseRecordedAudio() {
    if (!this.data.pendingRecordPath || this.data.recordProcessing) return;
    this.showPostDialog({
      title: "是否需要语音转文字？",
      content: "选择“是”可查看并编辑转换结果，选择“否”将仅保留录音。",
      showCancel: true,
      confirmText: "是",
      cancelText: "否",
      onConfirm: () => this.onTranscribeRecordedAudio(),
      onCancel: () => this.saveRecordedAudioOnly(),
    });
  },

  // 仅使用原音：此时才上传录音文件。
  async saveRecordedAudioOnly() {
    const { pendingRecordPath, pendingRecordDuration } = this.data;
    if (!pendingRecordPath || this.data.recordProcessing) return;

    this.clearPendingRecordPlayback();
    this.setData({ recordProcessing: true });
    wx.showLoading({ title: "上传中...", mask: true });
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

    this.clearPendingRecordPlayback();
    this.setData({ recordProcessing: true });
    wx.showLoading({ title: "上传中...", mask: true });
    try {
      const audioUrl = await this.uploadAudioFile(pendingRecordPath);
      this.setData({
        pendingAudioUrl: audioUrl,
        pendingAudioDuration: pendingRecordDuration,
        asrText: "",
        asrPopupVisible: true,
        recordReady: false,
        recordTime: 0,
        pendingRecordPath: "",
        pendingRecordDuration: 0,
      });
      this.closeRecordPopup();

      wx.hideLoading();
      wx.showLoading({ title: "转换中", mask: true });
      const asrRes = await request("/transcriptions", {
        method: "POST",
        data: { audioUrl },
      });
      console.log("asrRes:", asrRes);
      this.setData({ asrText: asrRes.text });
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

    applyPlaybackAudioOption();

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

  async onPendingRecordBubbleTap() {
    if (Date.now() - this.pendingRecordLongPressAt < 800) return;

    const { pendingRecordPath, pendingRecordPlaying, recordProcessing } =
      this.data;
    if (recordProcessing) return;
    if (!pendingRecordPath) {
      wx.showToast({ title: "暂无可播放的录音", icon: "none" });
      return;
    }

    if (pendingRecordPlaying) {
      this.pendingRecordAudioContext?.pause();
      return;
    }

    if (this.pendingRecordAudioContext && this.pendingRecordPlaybackPath) {
      applyPlaybackAudioOption();
      this.pendingRecordAudioContext.play();
      return;
    }

    this.setData({ recordProcessing: true });
    wx.showLoading({ title: "准备试听...", mask: true });
    try {
      const playbackPath = `${wx.env.USER_DATA_PATH}/pending-record-${Date.now()}.mp3`;
      await new Promise<void>((resolve, reject) => {
        wx.getFileSystemManager().copyFile({
          srcPath: pendingRecordPath,
          destPath: playbackPath,
          success: () => resolve(),
          fail: reject,
        });
      });

      if (this.data.pendingRecordPath !== pendingRecordPath) {
        wx.getFileSystemManager().unlink({ filePath: playbackPath });
        return;
      }

      applyPlaybackAudioOption();

      const audioContext = wx.createInnerAudioContext();
      audioContext.volume = 1;
      audioContext.onPlay(() => {
        this.setData({ pendingRecordPlaying: true });
      });
      audioContext.onPause(() => {
        this.setData({ pendingRecordPlaying: false });
      });
      audioContext.onStop(() => {
        this.setData({ pendingRecordPlaying: false });
      });
      audioContext.onEnded(() => {
        this.setData({ pendingRecordPlaying: false });
      });
      audioContext.onError((err: any) => {
        this.setData({ pendingRecordPlaying: false });
        wx.showToast({
          title: err?.errMsg || "录音播放失败",
          icon: "none",
        });
      });
      audioContext.autoplay = true;
      this.pendingRecordAudioContext = audioContext;
      this.pendingRecordPlaybackPath = playbackPath;
      audioContext.src = playbackPath;
    } catch (err: any) {
      wx.showToast({
        title: err?.errMsg || "准备录音试听失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
      this.setData({ recordProcessing: false });
    }
  },

  onRerecordPendingAudio() {
    if (
      !this.data.recordReady ||
      !this.data.pendingRecordPath ||
      this.data.recordProcessing
    ) {
      return;
    }

    this.pendingRecordLongPressAt = Date.now();
    this.clearPendingRecordPlayback();
    this.setData(
      {
        ...this.getPendingRecordingResetState(),
      },
      () => {
        this.syncUnsavedExitGuard();
        this.checkAndStartRecord();
      },
    );
  },

  stopPendingRecordPlayback() {
    if (this.data.pendingRecordPlaying) {
      this.pendingRecordAudioContext?.stop();
      this.setData({ pendingRecordPlaying: false });
    }
  },

  clearPendingRecordPlayback() {
    this.stopPendingRecordPlayback();
    this.pendingRecordAudioContext?.destroy();
    this.pendingRecordAudioContext = null;

    const playbackPath = this.pendingRecordPlaybackPath;
    this.pendingRecordPlaybackPath = "";
    if (playbackPath) {
      wx.getFileSystemManager().unlink({
        filePath: playbackPath,
        fail: () => {},
      });
    }
  },

  // 转文字弹窗：编辑文字内容
  onAsrTextInput(e: any) {
    this.setData({ asrText: e.detail.value });
  },

  commitPendingAudio(content?: string) {
    this.stopAudioPlayback();
    this.setData(
      {
        audioUrl: this.data.pendingAudioUrl,
        audioDuration: this.data.pendingAudioDuration,
        ...(content === undefined ? {} : { content }),
        asrPopupVisible: false,
        asrText: "",
        pendingAudioUrl: "",
        pendingAudioDuration: 0,
      },
      () => this.checkCanPublish(),
    );
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
    this.commitPendingAudio();
  },

  // 转文字弹窗：确认，同时保存录音并把文字追加到内容简介。
  onAsrConfirm() {
    const text = this.data.asrText.trim();
    if (!text) {
      wx.showToast({ title: "文字内容为空", icon: "none" });
      return;
    }
    const content = this.data.content ? this.data.content + "\n" + text : text;
    this.commitPendingAudio(content);
  },

  // 删除录音
  onDeleteAudio() {
    this.showPostDialog({
      title: "确认删除",
      content: "确定要删除录音吗？",
      showCancel: true,
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: () => {
        this.stopAudioPlayback();
        this.setData(
          {
            audioUrl: "",
            audioDuration: 0,
          },
          () => this.checkCanPublish(),
        );
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
    // 录音结束后音频会话仍停留在录音模式，先切回外放再进入试听流程。
    applyPlaybackAudioOption();
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
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
    });

    if (recordMode === "discard") {
      console.log("录音已取消");
      this.setData(
        {
          ...this.getPendingRecordingResetState(),
          recordMode: "normal",
        },
        () => this.syncUnsavedExitGuard(),
      );
      return;
    }

    this.setData(
      {
        recordReady: true,
        recordTime: durationSec,
        pendingRecordPath: tempFilePath,
        pendingRecordDuration: durationSec,
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


  // 查看模式：跳转编辑
  onEditPost() {
    if (hasCompletedQuestionnaireProfile()) {
      this.navigateToEditPost();
      return;
    }

    const activityId =
      (this.data.post as any)?.activity?.id ||
      this.data.selectedActivity?.id ||
      "";
    this.setData({
      joinConsentActivityId: activityId,
      joinConsentPopupVisible: true,
    });
  },

  // 投稿返回 QUESTIONNAIRE_REQUIRED / JOURNEY_EXPIRED 时按文档重新从 entry 开始：
  // 保留草稿，清掉失效 journey，以服务端判断为准重新走问卷门禁。
  restartQuestionnaireGate() {
    // 本地 questionnaireStatus 可能与服务端不一致，清掉后弹窗必走 /questionnaire/entry；
    // 服务端判定为 reused 时弹窗会写回完成状态。
    getApp<any>().globalData.questionnaireStatus = {};
    (this.selectComponent("#joinConsentPopup") as any)?.resetEntry?.();
    this.setData({
      questionnaireJourneyId: "",
      questionnaireJourneyActivityId: "",
      questionnaireRetrying: true,
      joinConsentActivityId: String(this.data.selectedActivity?.id || ""),
      joinConsentPopupVisible: true,
    });
  },

  onJoinConsentClose() {
    if (
      this.data.mode === "edit" &&
      !this.data.questionnaireJourneyId &&
      !this.data.questionnaireRetrying
    ) {
      this.leavePostPageAfterPublish();
      return;
    }
    this.setData({
      joinConsentPopupVisible: false,
      questionnaireRetrying: false,
    });
  },

  onJoinConsentComplete(e: WechatMiniprogram.CustomEvent) {
    if (this.data.mode === "edit") {
      const questionnaireJourneyId = e.detail.questionnaireJourneyId || "";
      if (this.data.questionnaireRetrying) {
        wx.showToast({ title: "参赛资格已确认，请重新提交", icon: "none" });
      }
      this.setData({
        joinConsentPopupVisible: false,
        questionnaireRetrying: false,
        questionnaireJourneyId,
        questionnaireJourneyActivityId: questionnaireJourneyId
          ? String(e.detail.activityId || this.data.joinConsentActivityId || "")
          : "",
      });
      return;
    }

    this.setData({ joinConsentPopupVisible: false });
    this.navigateToEditPost(
      e.detail.questionnaireJourneyId,
      e.detail.activityId || this.data.joinConsentActivityId,
    );
  },

  onViewActivityTap() {
    const activityId = (this.data.post as any)?.activity?.id;
    if (!activityId) return;
    wx.navigateTo({
      url: `/pages/tracks/tracks?id=${encodeURIComponent(String(activityId))}`,
    });
  },

  onViewHomeTap() {
    wx.reLaunch({ url: "/pages/index/index" });
  },

  onViewJoinTap() {
    const activityId = (this.data.post as any)?.activity?.id;
    navigateToProtectedPage(
      `/pages/post/post?mode=edit${activityId ? `&tag=${encodeURIComponent(String(activityId))}` : ""}`,
    );
  },

  navigateToEditPost(questionnaireJourneyId = "", questionnaireActivityId = "") {
    const id = (this.data.post as any).id;
    wx.navigateTo({
      url:
        `/pages/post/post?id=${id}&mode=edit` +
        (questionnaireJourneyId
          ? `&questionnaireJourneyId=${encodeURIComponent(questionnaireJourneyId)}`
          : "") +
        (questionnaireJourneyId && questionnaireActivityId
          ? `&questionnaireActivityId=${encodeURIComponent(questionnaireActivityId)}`
          : ""),
    });
  },

  onViewNavbarBack() {
    wx.navigateBack();
  },
});

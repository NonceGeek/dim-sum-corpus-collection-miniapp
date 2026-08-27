import ENV from "../../config/setting";
import request from "../../utils/http";
import { createClientEventId } from "../../utils/uuid";
import { showCommonDialog } from "../../utils/common-dialog";
const COUNTDOWN_SECONDS = 60;
const AUTO_ENTER_SECONDS = 5;
const PHONE_PATTERN = /^1\d{10}$/;

type Step = "confirm" | "form" | "success";
type FlowType = "full_questionnaire" | "phone_only";
type QuestionnaireOption = { code: string; label: string };
type QuestionnaireQuestion = {
  key: string;
  title: string;
  description?: string;
  options?: QuestionnaireOption[];
};

const hasCompletedQuestionnaireProfile = () => {
  const status = getApp<any>().globalData?.questionnaireStatus;
  return status?.completed === true && status?.phoneVerified === true;
};

const saveCompletedQuestionnaireProfile = async (completedAt?: string) => {
  const app = getApp<any>();
  const questionnaireStatus = {
    completed: true,
    phoneVerified: true,
    ...(completedAt ? { completedAt } : {}),
  };
  const userInfo = {
    ...(app.globalData.userInfo || {}),
    questionnaireStatus,
  };

  app.globalData.questionnaireStatus = questionnaireStatus;
  app.globalData.userInfo = userInfo;
  try {
    await app.setStorage("userInfo", userInfo);
  } catch (err) {
    console.warn("问卷完成状态持久化失败", err);
  }
};

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    activityId: {
      type: String,
      value: "",
    },
    currentTheme: {
      type: String,
      value: "light",
    },
    formHeight: {
      type: String,
      value: "85vh",
    },
  },

  observers: {
    "visible, activityId"(visible: boolean, activityId: string) {
      if (visible) {
        (this as any)._closeEmitted = false;
        this.startEntry(activityId || "");
      } else if (!visible) {
        this.setData({ popupVisible: false });
        this.stopCountdown();
        this.stopAutoEnterCountdown();
      }
    },
  },

  data: {
    popupVisible: false,
    flowType: "full_questionnaire" as FlowType,
    step: "confirm" as Step,
    journeyId: "",
    schemaVersion: 0,
    needsPhone: false,
    ageQuestion: {} as QuestionnaireQuestion,
    regionQuestion: {} as QuestionnaireQuestion,
    interestQuestion: {} as QuestionnaireQuestion,
    ageOptions: [] as Array<{ label: string; value: string }>,
    regionOptions: [] as Array<{ label: string; value: string }>,
    interestOptions: [] as Array<{ label: string; value: string }>,
    selectedAge: "",
    selectedRegion: "",
    selectedInterests: [] as string[],
    selectedInterestMap: {} as Record<string, boolean>,
    phone: "",
    verificationCode: "",
    countdown: 0,
    autoEnterCountdown: 0,
  },

  lifetimes: {
    detached() {
      this.stopCountdown();
      this.stopAutoEnterCountdown();
    },
  },

  methods: {
    async startEntry(activityId: string) {
      const globalQuestionnaireStatus =
        getApp<any>().globalData?.questionnaireStatus;
      const cachedQuestionnaireStatus =
        wx.getStorageSync("userInfo")?.questionnaireStatus;
      console.log("[questionnaire-debug][popup:startEntry]", {
        activityId,
        journeyId: this.data.journeyId,
        popupVisible: this.data.popupVisible,
        globalQuestionnaireStatus,
        cachedQuestionnaireStatus,
        hasCompletedQuestionnaireProfile: hasCompletedQuestionnaireProfile(),
      });

      if ((this as any)._entryLoading) return;

      if (
        (this as any)._activeActivityId === activityId &&
        this.data.journeyId
      ) {
        if ((this as any)._enteredJourneyId === this.data.journeyId) {
          this.triggerEvent("complete", {
            activityId,
            questionnaireJourneyId: this.data.journeyId,
          });
          return;
        }
        if (!this.data.popupVisible) {
          this.setData({ popupVisible: true });
        }
        return;
      }

      if (
        this.data.popupVisible &&
        (this as any)._activeActivityId === activityId
      ) {
        return;
      }

      if (hasCompletedQuestionnaireProfile()) {
        this.triggerEvent("complete", {
          activityId,
        });
        return;
      }

      (this as any)._entryLoading = true;
      wx.showLoading({
        title: "加载中...",
        mask: true,
      });
      try {
        const isSameActivity = (this as any)._entryActivityId === activityId;
        const clientEventId =
          (isSameActivity && (this as any)._entryClientEventId) ||
          (await createClientEventId());
        (this as any)._entryActivityId = activityId;
        (this as any)._entryClientEventId = clientEventId;

        const result = await request("/questionnaire/entry", {
          method: "POST",
          data: {
            ...(activityId ? { activityId } : {}),
            clientEventId,
          },
        });
        if (result?.error) {
          throw result;
        }

        const flowType = result?.flowType as FlowType | "reused" | undefined;
        const registrationType = result?.registrationType as
          | "first_time"
          | "reused"
          | undefined;
        const isReused =
          flowType === "reused" || registrationType === "reused";
        if (!result?.journeyId || (!flowType && !isReused)) {
          throw new Error("参赛旅程数据不完整");
        }

        (this as any)._entryClientEventId = "";
        (this as any)._activeActivityId = activityId;
        this.setData({
          journeyId: result.journeyId,
          flowType:
            flowType === "phone_only" ? "phone_only" : "full_questionnaire",
        });

        if (isReused) {
          await saveCompletedQuestionnaireProfile(result.completedAt);
          await this.enterSubmission();
          return;
        }
        if (flowType !== "full_questionnaire" && flowType !== "phone_only") {
          throw new Error("未知的参赛资料流程");
        }

        this.applyEntryData(result, flowType);
      } catch (err: any) {
        console.error("获取参赛资料流程失败", err);
        wx.showToast({
          title: err.message || err.error || "获取参赛信息失败",
          icon: "none",
        });
        this.triggerEvent("error", {
          error: err.error || "QUESTIONNAIRE_ENTRY_FAILED",
        });
        this.close("error");
      } finally {
        wx.hideLoading();
        (this as any)._entryLoading = false;
      }
    },

    applyEntryData(entryData: any, flowType: FlowType) {
      const questions = (entryData?.questionnaire?.questions ||
        []) as QuestionnaireQuestion[];
      const ageQuestion = questions.find((item) => item.key === "ageRange");
      const regionQuestion = questions.find(
        (item) => item.key === "cultureRegion",
      );
      const interestQuestion = questions.find(
        (item) => item.key === "interestTypes",
      );

      this.setData(
        {
          popupVisible: true,
          step: flowType === "phone_only" ? "form" : "confirm",
          journeyId: entryData.journeyId,
          schemaVersion: entryData?.questionnaire?.schemaVersion || 0,
          needsPhone: entryData?.contact?.status === "missing",
          ageQuestion: ageQuestion || {},
          regionQuestion: regionQuestion || {},
          interestQuestion: interestQuestion || {},
          ageOptions: (ageQuestion?.options || []).map((item) => ({
            label: item.label,
            value: item.code,
          })),
          regionOptions: (regionQuestion?.options || []).map((item) => ({
            label: item.label,
            value: item.code,
          })),
          interestOptions: (interestQuestion?.options || []).map((item) => ({
            label: item.label,
            value: item.code,
          })),
          selectedAge: "",
          selectedRegion: "",
          selectedInterests: [],
          selectedInterestMap: {},
          phone: "",
          verificationCode: "",
        },
        () => {
          if ((this as any)._openedJourneyId === entryData.journeyId) return;
          (this as any)._openedJourneyId = entryData.journeyId;
          this.reportQuestionnaireEvent("open_questionnaire");
        },
      );
    },

    stopCountdown() {
      const timer = (this as any)._countdownTimer;
      if (timer) {
        clearInterval(timer);
        (this as any)._countdownTimer = null;
      }
    },

    stopAutoEnterCountdown() {
      const timer = (this as any)._autoEnterTimer;
      if (timer) {
        clearInterval(timer);
        (this as any)._autoEnterTimer = null;
      }
    },

    close(reason: "overlay" | "dismiss" | "cancel" | "submit" | "error") {
      if ((this as any)._closeEmitted) return;
      (this as any)._closeEmitted = true;
      this.stopCountdown();
      this.stopAutoEnterCountdown();
      this.setData({ popupVisible: false });
      this.triggerEvent("close", { reason });
    },

    onOverlayVisibleChange(e: WechatMiniprogram.CustomEvent) {
      if (!e.detail.visible) {
        this.close("overlay");
      }
    },

    onDismiss() {
      this.reportQuestionnaireEvent("cancel_questionnaire");
      this.close("dismiss");
    },

    onDecline() {
      this.reportQuestionnaireEvent("cancel_questionnaire");
      this.close("cancel");
    },

    onViewPrivacyPolicy() {
      wx.navigateTo({
        url: `/pages/webview/webview?url=${encodeURIComponent(ENV.privacyUrl)}`,
      });
    },

    onContinueToForm() {
      this.reportQuestionnaireEvent("continue_questionnaire");
      this.setData({ step: "form" });
    },

    onBackToConfirm() {
      this.setData({ step: "confirm" });
    },

    onSelectAge(e: WechatMiniprogram.CustomEvent) {
      this.setData({ selectedAge: e.currentTarget.dataset.value });
    },

    onSelectRegion(e: WechatMiniprogram.CustomEvent) {
      this.setData({ selectedRegion: e.currentTarget.dataset.value });
    },

    onSelectInterest(e: WechatMiniprogram.CustomEvent) {
      const value = e.currentTarget.dataset.value as string;
      const isSelected = this.data.selectedInterests.includes(value);
      const selectedInterests = isSelected
        ? this.data.selectedInterests.filter((item) => item !== value)
        : [...this.data.selectedInterests, value];

      this.setData({
        selectedInterests,
        selectedInterestMap: {
          ...this.data.selectedInterestMap,
          [value]: !isSelected,
        },
      });
    },

    onPhoneInput(e: WechatMiniprogram.CustomEvent) {
      this.setData({ phone: e.detail.value.replace(/\D/g, "").slice(0, 11) });
    },

    onVerificationCodeInput(e: WechatMiniprogram.CustomEvent) {
      this.setData({
        verificationCode: e.detail.value.replace(/\D/g, "").slice(0, 6),
      });
    },

    async reportQuestionnaireEvent(
      eventName:
        | "open_questionnaire"
        | "continue_questionnaire"
        | "cancel_questionnaire",
      retryCount = 0,
    ) {
      if (!this.data.journeyId) return;

      if ((this as any)._questionnaireEventJourneyId !== this.data.journeyId) {
        (this as any)._questionnaireEventJourneyId = this.data.journeyId;
        (this as any)._questionnaireEventIds = {};
      }
      const eventIds = (this as any)._questionnaireEventIds || {};
      (this as any)._questionnaireEventIds = eventIds;
      const clientEventId =
        eventIds[eventName] || (await createClientEventId());
      eventIds[eventName] = clientEventId;

      try {
        const result = await request("/questionnaire/events", {
          method: "POST",
          data: {
            journeyId: this.data.journeyId,
            clientEventId,
            eventName,
          },
        });
        if (result?.error) {
          throw result;
        }
        delete eventIds[eventName];
      } catch (err) {
        if (retryCount < 1) {
          this.reportQuestionnaireEvent(eventName, retryCount + 1);
          return;
        }
        console.warn(`问卷事件上报失败: ${eventName}`, err);
      }
    },

    async onGetVerificationCode() {
      if (this.data.countdown > 0) return;

      if (!PHONE_PATTERN.test(this.data.phone)) {
        wx.showToast({ title: "请输入正确的手机号", icon: "none" });
        return;
      }

      try {
        const result = await request("/questionnaire/phone/send-code", {
          method: "POST",
          data: {
            journeyId: this.data.journeyId,
            phoneNumber: this.data.phone,
          },
        });
        if (result?.error) {
          throw result;
        }
        wx.showToast({ title: "验证码已发送", icon: "none" });
        this.setData({
          countdown: result?.retryAfterSeconds || COUNTDOWN_SECONDS,
        });
      } catch (err: any) {
        wx.showToast({
          title: err.message || err.error || "验证码发送失败",
          icon: "none",
        });
        return;
      }
      (this as any)._countdownTimer = setInterval(() => {
        const next = this.data.countdown - 1;
        if (next <= 0) {
          this.stopCountdown();
          this.setData({ countdown: 0 });
          return;
        }
        this.setData({ countdown: next });
      }, 1000);
    },

    onSubmit() {
      this.submitQuestionnaire(false);
    },

    async submitQuestionnaire(confirmMerge: boolean) {
      const {
        selectedAge,
        selectedRegion,
        selectedInterests,
        phone,
        verificationCode,
      } = this.data;

      if (this.data.flowType === "full_questionnaire" && !selectedAge) {
        wx.showToast({ title: "请选择你的年龄区间", icon: "none" });
        return;
      }
      if (this.data.flowType === "full_questionnaire" && !selectedRegion) {
        wx.showToast({ title: "请选择你熟悉的地区", icon: "none" });
        return;
      }
      if (this.data.needsPhone && !PHONE_PATTERN.test(phone)) {
        wx.showToast({ title: "请输入正确的手机号", icon: "none" });
        return;
      }

      if (this.data.needsPhone && verificationCode.length !== 6) {
        wx.showToast({ title: "请输入6位验证码", icon: "none" });
        return;
      }

      const data: any = {
        journeyId: this.data.journeyId,
        ...(this.data.flowType === "full_questionnaire"
          ? {
              schemaVersion: this.data.schemaVersion,
              answers: {
                ageRange: selectedAge,
                cultureRegion: selectedRegion,
                interestTypes: selectedInterests,
              },
            }
          : {}),
        ...(this.data.needsPhone
          ? {
              phoneBinding: {
                phoneNumber: phone,
                verificationCode,
                confirmMerge,
              },
            }
          : {}),
      };

      try {
        const result = await request("/questionnaire/submit", {
          method: "POST",
          data,
        });

        if (result?.error === "MERGE_REQUIRED") {
          showCommonDialog(this, {
            title: "确认合并账号",
            content: result.message || "该手机号已关联其他账号，是否继续合并？",
            showCancel: true,
            confirmText: "确认合并",
            cancelText: "取消",
            onConfirm: () => this.submitQuestionnaire(true),
          });
          return;
        }

        if (result?.error) {
          throw result;
        }
        if (!result?.completed) {
          throw new Error("参赛资料提交未完成");
        }
        await saveCompletedQuestionnaireProfile(result.completedAt);
      } catch (err: any) {
        wx.showToast({
          title: err.message || err.error || "参赛资料提交失败",
          icon: "none",
        });
        return;
      }

      this.setData({
        step: "success",
        autoEnterCountdown: AUTO_ENTER_SECONDS,
      });
      this.stopAutoEnterCountdown();
      (this as any)._autoEnterTimer = setInterval(() => {
        const next = this.data.autoEnterCountdown - 1;
        if (next <= 0) {
          this.stopAutoEnterCountdown();
          this.setData({ autoEnterCountdown: 0 });
          this.onEnterPost();
          return;
        }
        this.setData({ autoEnterCountdown: next });
      }, 1000);
    },

    async enterSubmission() {
      const journeyId = this.data.journeyId;
      if (!journeyId) return;
      if ((this as any)._enterLoading) return;

      if ((this as any)._enteredJourneyId === journeyId) {
        this.triggerEvent("complete", {
          activityId: this.data.activityId,
          questionnaireJourneyId: journeyId,
        });
        return;
      }

      (this as any)._enterLoading = true;
      try {
        const isSameJourney = (this as any)._enterJourneyId === journeyId;
        const clientEventId =
          (isSameJourney && (this as any)._enterClientEventId) ||
          (await createClientEventId());
        (this as any)._enterJourneyId = journeyId;
        (this as any)._enterClientEventId = clientEventId;

        const result = await request("/questionnaire/enter-submission", {
          method: "POST",
          data: { journeyId, clientEventId },
        });
        if (result?.error) {
          throw result;
        }
        if (!result?.allowed) {
          throw new Error("当前参赛旅程暂不允许进入投稿页");
        }

        (this as any)._enterClientEventId = "";
        (this as any)._enteredJourneyId = journeyId;
        this.triggerEvent("complete", {
          activityId: result.activityId || this.data.activityId,
          questionnaireJourneyId: result.questionnaireJourneyId || journeyId,
        });
        this.close("submit");
      } finally {
        (this as any)._enterLoading = false;
      }
    },

    async onEnterPost() {
      this.stopAutoEnterCountdown();
      try {
        await this.enterSubmission();
      } catch (err: any) {
        wx.showToast({
          title: err.message || err.error || "暂时无法进入投稿页",
          icon: "none",
        });
      }
    },
  },
});

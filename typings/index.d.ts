/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo;
    questionnaireStatus?: {
      completed?: boolean;
      phoneVerified?: boolean;
      completedAt?: string;
    };
  };
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback;
}

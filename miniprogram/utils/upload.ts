import {
  clearAuthState,
  createAuthRequiredError,
  refreshAccessToken,
} from "./http";
import { promptCurrentPageLogin } from "./auth";

interface AuthUploadOptions {
  url: string;
  filePath: string;
  name: string;
  formData?: Record<string, string>;
  header?: Record<string, string>;
}

function getAccessToken(): string {
  const app = getApp<{ globalData?: { accessToken?: string } }>();
  return (
    wx.getStorageSync("accessToken") || app?.globalData?.accessToken || ""
  );
}

function uploadOnce(
  options: AuthUploadOptions,
  token: string,
): Promise<WechatMiniprogram.UploadFileSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      ...options,
      header: {
        ...(options.header || {}),
        Authorization: `Bearer ${token}`,
      },
      success: resolve,
      fail: reject,
    });
  });
}

/**
 * 带鉴权的文件上传。
 * access token 失效时刷新 token，并使用新 token 自动重传一次。
 */
export default async function uploadFileWithAuth(
  options: AuthUploadOptions,
  retryCount = 0,
): Promise<WechatMiniprogram.UploadFileSuccessCallbackResult> {
  const token = getAccessToken();

  if (!token) {
    promptCurrentPageLogin();
    throw createAuthRequiredError();
  }

  const response = await uploadOnce(options, token);
  if (response.statusCode !== 401) {
    return response;
  }

  if (retryCount >= 1 || !(await refreshAccessToken())) {
    clearAuthState();
    promptCurrentPageLogin();
    throw createAuthRequiredError();
  }

  return uploadFileWithAuth(options, retryCount + 1);
}

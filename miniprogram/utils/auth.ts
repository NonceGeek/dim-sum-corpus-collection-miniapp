interface LoginPromptOptions {
  content?: string;
  replaceCurrentPage?: boolean;
}

const DEFAULT_LOGIN_PROMPT = "登录后才能使用该功能，当前仍可继续浏览公开内容。";
let isLoginPromptVisible = false;

export function isLoggedIn(): boolean {
  const app = getApp<{ globalData?: { accessToken?: string } }>();
  return Boolean(
    wx.getStorageSync("accessToken") || app?.globalData?.accessToken,
  );
}

function getLoginUrl(redirectUrl: string): string {
  return `/pages/login/login?redirect=${encodeURIComponent(redirectUrl)}`;
}

function getCurrentPageUrl(): string {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1] as unknown as
    | { route?: string; options?: Record<string, string> }
    | undefined;

  if (!currentPage?.route) {
    return "/pages/index/index";
  }

  const query = Object.entries(currentPage.options || {})
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  return `/${currentPage.route}${query ? `?${query}` : ""}`;
}

function returnToPublicPage() {
  if (getCurrentPages().length > 1) {
    wx.navigateBack();
    return;
  }

  wx.reLaunch({ url: "/pages/index/index" });
}

export function promptLogin(
  redirectUrl: string,
  options: LoginPromptOptions = {},
) {
  if (isLoginPromptVisible) {
    return;
  }
  isLoginPromptVisible = true;

  wx.showModal({
    title: "需要登录",
    content: options.content || DEFAULT_LOGIN_PROMPT,
    confirmText: "去登录",
    cancelText: "暂不登录",
    success: (res) => {
      if (res.confirm) {
        const loginUrl = getLoginUrl(redirectUrl);
        if (options.replaceCurrentPage) {
          wx.redirectTo({ url: loginUrl });
        } else {
          wx.navigateTo({ url: loginUrl });
        }
        return;
      }

      if (options.replaceCurrentPage) {
        returnToPublicPage();
      }
    },
    complete: () => {
      isLoginPromptVisible = false;
    },
  });
}

export function promptCurrentPageLogin() {
  promptLogin(getCurrentPageUrl(), {
    content: "登录状态已失效，请重新登录后继续使用该功能。",
    replaceCurrentPage: true,
  });
}

export function navigateToProtectedPage(
  url: string,
  content = DEFAULT_LOGIN_PROMPT,
) {
  if (isLoggedIn()) {
    wx.navigateTo({ url });
    return;
  }

  promptLogin(url, { content });
}

export function guardProtectedPage(
  url: string,
  content = DEFAULT_LOGIN_PROMPT,
): boolean {
  if (isLoggedIn()) {
    return true;
  }

  promptLogin(url, {
    content,
    replaceCurrentPage: true,
  });
  return false;
}

interface LoginPromptOptions {
  replaceCurrentPage?: boolean;
  returnToPrevious?: boolean;
  onConfirm?: () => void;
}

let isNavigatingToLogin = false;

export function isLoggedIn(): boolean {
  const app = getApp<{ globalData?: { accessToken?: string } }>();
  return Boolean(
    wx.getStorageSync("accessToken") || app?.globalData?.accessToken,
  );
}

function getLoginUrl(
  redirectUrl: string,
  returnToPrevious = false,
): string {
  return (
    `/pages/login/login?redirect=${encodeURIComponent(redirectUrl)}` +
    (returnToPrevious ? "&returnToPrevious=1" : "")
  );
}

function getCurrentPage(): { route?: string; options?: Record<string, string> } | undefined {
  const pages = getCurrentPages();
  return pages[pages.length - 1] as unknown as
    | { route?: string; options?: Record<string, string> }
    | undefined;
}

function getCurrentPageUrl(): string {
  const currentPage = getCurrentPage();

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

function isOnLoginPage(): boolean {
  return getCurrentPage()?.route === "pages/login/login";
}

export function releaseLoginNavigationLock() {
  isNavigatingToLogin = false;
}

export function promptLogin(
  redirectUrl: string,
  options: LoginPromptOptions = {},
) {
  if (isNavigatingToLogin || isOnLoginPage()) {
    return;
  }
  isNavigatingToLogin = true;

  try {
    options.onConfirm?.();
    const loginUrl = getLoginUrl(
      redirectUrl,
      options.returnToPrevious === true,
    );
    if (options.replaceCurrentPage) {
      wx.redirectTo({ url: loginUrl, fail: releaseLoginNavigationLock });
    } else {
      wx.navigateTo({ url: loginUrl, fail: releaseLoginNavigationLock });
    }
  } catch (err) {
    releaseLoginNavigationLock();
    throw err;
  }
}

export function promptCurrentPageLogin() {
  promptLogin(getCurrentPageUrl(), {
    replaceCurrentPage: true,
  });
}

export function navigateToProtectedPage(url: string) {
  if (isLoggedIn()) {
    wx.navigateTo({ url });
    return;
  }

  promptLogin(url);
}

export function guardProtectedPage(url: string): boolean {
  if (isLoggedIn()) {
    return true;
  }

  promptLogin(url, {
    replaceCurrentPage: true,
  });
  return false;
}

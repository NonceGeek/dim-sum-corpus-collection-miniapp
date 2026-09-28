export interface ChannelVideo { finderUserName: string; feedId: string }
export function normalizeChannelFeedId(value: string): string {
  return value.trim();
}
export function parseChannelVideo(finderUserName: string, feedId: string): ChannelVideo | null {
  const values = [finderUserName.trim(), normalizeChannelFeedId(feedId)];
  if (!/^[A-Za-z0-9_-]{1,1024}$/.test(values[0])) return null;
  if (values[1].length > 1024 || !/^(?:export\/)?[A-Za-z0-9_-]+$/.test(values[1])) return null;
  return { finderUserName: values[0], feedId: values[1] };
}
export function openChannelVideo(value: ChannelVideo): Promise<void> {
  return new Promise((resolve, reject) => {
    const isDevtools = wx.getSystemInfoSync?.()?.platform === "devtools";
    if (!wx.canIUse("openChannelsActivity")) {
      reject(new Error(isDevtools
        ? "当前开发者工具未提供打开视频号作品的能力，请使用手机微信扫码预览后检查。此结果不代表两个 ID 无效。"
        : "当前微信版本不支持，请升级微信后重试"));
      return;
    }
    // The repository bundles older WeChat typings; keep the missing API declaration local.
    const channelsWx = wx as typeof wx & { openChannelsActivity(options: ChannelVideo & {
      success: () => void; fail: (error?: { errMsg?: string; errCode?: number }) => void;
    }): void };
    channelsWx.openChannelsActivity({ ...value, success: () => resolve(), fail: (error) => {
      const detail = error?.errMsg || "微信未返回具体错误";
      const code = error?.errCode === undefined ? "" : `（错误码 ${error.errCode}）`;
      const hint = isDevtools
        ? "当前在开发者工具中，模拟器结果不能确认作品是否有效。请使用手机微信扫码预览，再检查同一作品。"
        : "请核对两个 ID 是否属于同一账号及作品，并确认作品可见性后重试。";
      reject(new Error(`${hint}\n\n微信返回：${detail}${code}`));
    } });
  });
}

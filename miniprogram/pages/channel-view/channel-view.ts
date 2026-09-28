import request from "../../utils/http";
import { openChannelVideo, parseChannelVideo, ChannelVideo } from "../../utils/channel-video";

Page({
  data: {
    currentTheme: "light",
    loading: true,
    opening: false,
    error: "",
    channelVideo: null as ChannelVideo | null,
  },
  scene: "",
  onLoad(options: Record<string, string>) {
    try { this.scene = decodeURIComponent(options.scene || ""); } catch { this.scene = ""; }
    this.loadVideo();
  },
  onShow() {
    const app = getApp();
    this.setData({ currentTheme: app.globalData?.theme || "light" });
  },
  onThemeChange({ theme }: { theme: string }) { this.setData({ currentTheme: theme }); },
  async loadVideo() {
    this.setData({ loading: true, error: "", channelVideo: null });
    try {
      if (!/^[1-9a-z][0-9a-z]{0,12}\.[A-Za-z0-9_-]{16}$/.test(this.scene)) throw new Error("二维码无效，请在后台重新生成后扫码");
      const result = await request(`/channel-video/resolve?scene=${encodeURIComponent(this.scene)}`, { auth: false });
      if (result?.error) throw new Error(result.error);
      const raw = result?.channelVideo;
      const video = raw && typeof raw.finderUserName === "string" && typeof raw.feedId === "string"
        ? parseChannelVideo(raw.finderUserName, raw.feedId) : null;
      if (!video) throw new Error("无法获取作品信息，请重新扫码");
      this.setData({ channelVideo: video });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "网络异常，请稍后重试" });
    } finally { this.setData({ loading: false }); }
  },
  async openVideo() {
    if (!this.data.channelVideo || this.data.opening) return;
    this.setData({ opening: true, error: "" });
    try { await openChannelVideo(this.data.channelVideo); }
    catch (error) { this.setData({ error: error instanceof Error ? error.message : "暂时无法打开作品，请重试" }); }
    finally { this.setData({ opening: false }); }
  },
});

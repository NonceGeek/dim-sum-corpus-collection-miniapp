export function resolveSubmissionCover(explicit: string, media: any[]) {
  if (explicit) return { url: explicit, label: "已设置封面" };
  const image = media.find(item => item.type === "image");
  if (image) return { url: image.url, label: "使用第一张图片" };
  const video = media.find(item => item.type === "video");
  const thumbnail = video?.metadata?.thumbnailUrl;
  return thumbnail
    ? { url: thumbnail, label: "使用视频缩略图" }
    : { url: "", label: "未设置封面，列表将显示默认作品卡片" };
}
export function submissionKind(item: any): string {
  if (item?.channelVideo) return "视频号作品";
  if (item?.media?.some((m: any) => m.type === "video")) return "视频作品";
  if (item?.media?.some((m: any) => m.type === "audio") || item?.audioUrls?.length) return "音频作品";
  if (item?.media?.some((m: any) => m.type === "image") || item?.imageUrls?.length) return "图片作品";
  return "作品";
}

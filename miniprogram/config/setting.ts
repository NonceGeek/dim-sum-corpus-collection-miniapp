const TYPE = [
  { label: "用语", value: "用语" },
  { label: "诗歌", value: "诗歌" },
  { label: "故事", value: "故事" },
  { label: "标语", value: "标语" },
  { label: "地名解说", value: "地名解说" },
  { label: "歇后语", value: "歇后语" },
  { label: "自然对话", value: "自然对话" },
];

const TYPE_JSON = TYPE.reduce<Record<string, string>>((result, item) => {
  result[item.value] = item.label;
  return result;
}, {});

export default {
  API_BASE_URL: "https://search.aidimsum.com/api/miniprogram",
  API_PRIMARY_URL:
    "https://search.aidimsum.com/api/miniprogram/corpus_collection",
  IS_REVIEW: false,
  title: "Yue Lore",
  subtitle: "文化征集",
  termsUrl: "https://search.aidimsum.com/terms", // 用户协议URL
  privacyUrl: "https://search.aidimsum.com/privacy", // 隐私政策URL
  // 版本号，格式为 YYYYMMDD
  // 每次发布新版本时，请更新此版本号，以便小程序能够正确识别新版本并进行更新
  VERSION: "20260826",
  TYPE,
  TYPE_JSON,
};

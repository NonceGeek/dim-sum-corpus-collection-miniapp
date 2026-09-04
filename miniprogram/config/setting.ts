const TYPE = [
  { label: "一句粤语/俗语", value: "一句粤语/俗语" },
  { label: "诗歌/歌词", value: "诗歌/歌词" },
  { label: "人物或地方故事", value: "人物或地方故事" },
  { label: "宣传口号/创意标语", value: "宣传口号/创意标语" },
  { label: "地名来历与介绍", value: "地名来历与介绍" },
  { label: "歇后语", value: "歇后语" },
  { label: "自然对话", value: "自然对话" },
  { label: "其他", value: "其他" },
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
  VERSION: "20260904",
  TYPE,
  TYPE_JSON,
};

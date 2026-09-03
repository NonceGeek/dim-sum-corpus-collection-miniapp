import { navigateToProtectedPage } from "../../utils/auth";

const TAB_ROUTES: Record<string, string> = {
  home: "/pages/index/index",
  featured: "/pages/featured/featured",
  profile: "/pages/profile/profile",
};

Component({
  properties: {
    value: {
      type: String,
      value: "home",
    },
  },

  methods: {
    onChange(e: WechatMiniprogram.CustomEvent) {
      const value = e.detail.value as string;

      if (value === this.data.value) return;

      this.triggerEvent("change", { value });

      if (value === "upload") {
        navigateToProtectedPage("/pages/post/post?mode=edit");
        return;
      }

      const url = TAB_ROUTES[value];
      if (!url) return;

      wx.redirectTo({ url });
    },
  },
});

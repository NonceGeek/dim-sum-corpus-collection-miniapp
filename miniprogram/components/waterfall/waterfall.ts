Component({
  properties: {
    items: {
      type: Array,
      value: [],
    },
    showStatus: {
      type: Boolean,
      value: false,
    },
    showPlayBadge: {
      type: Boolean,
      value: false,
    },
    showFeatured: { type: Boolean, value: false },
  },

  methods: {
    onItemTap(e: any) {
      const { id, index } = e.currentTarget.dataset;
      this.triggerEvent("itemtap", { id, index, item: this.data.items[index] });
    },
  },
});

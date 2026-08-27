export interface CommonDialogOptions {
  title: string;
  content: string;
  showCancel?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
}

export function showCommonDialog(
  host: any,
  options: CommonDialogOptions,
) {
  const dialog = host.selectComponent?.("#common-dialog") as
    | { open: (options: CommonDialogOptions) => void }
    | undefined;
  if (!dialog) {
    console.error("当前页面或组件未挂载 #common-dialog");
    wx.showToast({
      title: options.content || options.title,
      icon: "none",
    });
    return;
  }
  dialog.open(options);
}

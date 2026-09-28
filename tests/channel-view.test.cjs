const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const video = { finderUserName: 'sphExample', feedId: 'export/longFeedId' };
function setup(request, open = async () => {}) {
  let page;
  const code = ts.transpileModule(fs.readFileSync('miniprogram/pages/channel-view/channel-view.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports: {}, Error, Page: value => page = value, getApp: () => ({ globalData: { theme: 'dark' } }), require: name => name.includes('/http') ? { __esModule: true, default: request } : { parseChannelVideo: (finderUserName, feedId) => ({ finderUserName, feedId }), openChannelVideo: open } });
  page.setData = data => Object.assign(page.data, data);
  page.scene = '1.abcdefghijklmnop';
  return page;
}
test('anonymous scan resolves IDs without automatic navigation and preserves export prefix', async () => {
  let opens = 0;
  const page = setup(async (url, options) => {
    assert.equal(options.auth, false);
    assert.match(url, /^\/channel-video\/resolve\?scene=/);
    return { channelVideo: video };
  }, async value => { opens++; assert.equal(value.feedId, video.feedId); });
  await page.loadVideo();
  assert.equal(opens, 0);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.channelVideo.feedId, video.feedId);
  page.onShow(); assert.equal(page.data.currentTheme, 'dark');
  await page.openVideo(); assert.equal(opens, 1);
});
test('invalid or removed code shows recoverable error and clears stale work', async () => {
  let calls = 0;
  const page = setup(async () => { calls++; return { error: '二维码已失效' }; });
  page.scene = 'bad'; await page.loadVideo(); assert.equal(calls, 0);
  assert.match(page.data.error, /二维码无效/);
  page.scene = '1.abcdefghijklmnop'; page.data.channelVideo = video;
  await page.loadVideo(); assert.equal(page.data.channelVideo, null);
  assert.equal(page.data.error, '二维码已失效'); assert.equal(page.data.loading, false);
});
test('failed opening remains visible and retry uses the same work', async () => {
  let opens = 0;
  const page = setup(async () => ({ channelVideo: video }), async () => { if (++opens === 1) throw new Error('作品不可见'); });
  await page.loadVideo(); await page.openVideo();
  assert.equal(page.data.error, '作品不可见'); assert.equal(page.data.opening, false);
  await page.openVideo(); assert.equal(opens, 2); assert.equal(page.data.error, '');
});

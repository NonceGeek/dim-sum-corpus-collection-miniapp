const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function evaluate(file, extras = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, console: { log() {}, warn() {}, error() {} }, ...extras });
  return module.exports;
}
const ref = { finderUserName: 'finder_abc', feedId: '18446744073709551615' };
const noop = () => {};
function setup(request = async () => ({ verdict: 'pass', requiresManualReview: true, channelVideoChecked: false })) {
  let definition;
  const wx = new Proxy({
    getRecorderManager: () => new Proxy({}, { get: () => noop }),
    getBackgroundAudioManager: () => new Proxy({}, { get: () => noop }),
    canIUse: () => true,
    openChannelsActivity: ({ success }) => success(),
  }, { get: (target, key) => target[key] || noop });
  const util = evaluate('miniprogram/utils/channel-video.ts', { wx });
  evaluate('miniprogram/pages/post/post.ts', {
    wx, Page: value => definition = value, setTimeout: noop,
    require: name => name.includes('submission-cover') ? evaluate('miniprogram/utils/submission-cover.ts') : name.includes('/date') ? { formatDate: () => '20260926' } : name.includes('channel-video') ? util : name.includes('/http') ? { default: request, __esModule: true } : { default: {}, __esModule: true },
  });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = (data, callback) => { Object.assign(page.data, data); callback?.(); };
  page.showPostDialog = options => page.dialog = options;
  page.stopAudioPlayback = noop;
  Object.assign(page.data, { title: '标题', content: '说明', selectedType: '故事', selectedTopics: ['粤语'] });
  return { page, wx, util };
}
test('IDs trim whitespace, preserve large feed IDs, reject URLs and invalid or missing values', () => {
  const { util } = setup();
  const parsed = util.parseChannelVideo(' finder_abc ', ` ${ref.feedId} `);
  assert.equal(parsed.feedId, ref.feedId);
  assert.equal(parsed.finderUserName, ref.finderUserName);
  for (const invalid of ['', 'https://example.com', '有中文', 'a b', 'a'.repeat(1025)]) assert.equal(util.parseChannelVideo(invalid, '123'), null);
});
for (const [name, activity, expected] of [
  ['free submission', {}, false],
  ['video activity', { id: '1', mediaRequirements: { requiredTypes: ['video'] } }, false],
  ['audio-only activity', { id: '1', mediaRequirements: { requiredTypes: ['audio'] } }, false],
  ['unconfigured activity', { id: '1', mediaRequirements: {} }, false],
]) test(`channel-only without a cover: ${name}`, () => {
  const { page } = setup(); Object.assign(page.data, { channelVideo: ref, selectedActivity: activity });
  assert.equal(page.getPublishValidation().canPublish, expected);
  assert.equal(page.data.channelVideo, ref);
});
test('local video and channel association can publish together', () => {
  const { page } = setup(); Object.assign(page.data, { channelVideo: ref, imageList: [{ type: 'video', url: 'file' }] });
  assert.equal(page.getPublishValidation().canPublish, true);
});
test('saving association preserves video, images, audio and cover', () => {
  const { page } = setup(); Object.assign(page.data, { channelFinderDraft: ref.finderUserName, channelFeedDraft: ref.feedId, imageList: [{ type: 'video', url: 'v' }, { type: 'image', url: 'i' }], audioUrl: 'a', inheritedCoverUrl: 'cover' });
  page.onSaveChannel(); assert.equal(page.data.channelVideo.feedId, ref.feedId);
  assert.equal(page.data.imageList.length, 2); assert.equal(page.data.audioUrl, 'a'); assert.equal(page.data.inheritedCoverUrl, 'cover');
});
test('choosing a local video keeps existing association', () => {
  const { page, wx } = setup(); page.data.channelVideo = ref;
  let options; wx.chooseMedia = value => options = value;
  page.onChooseLocalVideo();
  assert.equal(page.data.channelVideo, ref); assert.equal(options.mediaType.join(','), 'video');
});
test('removal requires confirmation; removing last content prevents submission', () => {
  const { page } = setup(); page.data.channelVideo = ref; page.onRemoveChannel();
  assert.equal(page.data.channelVideo, ref); page.dialog.onConfirm();
  assert.equal(page.data.channelVideo, null); assert.equal(page.getPublishValidation().canPublish, false);
});
test('opening draft preserves form state and does not mark ownership verified', async () => {
  const { page, wx } = setup(); Object.assign(page.data, { channelFinderDraft: ref.finderUserName, channelFeedDraft: ref.feedId });
  let opened; wx.openChannelsActivity = options => { opened = options; options.success(); };
  await page.onOpenChannel({ currentTarget: { dataset: { draft: true } } });
  assert.equal(opened.feedId, ref.feedId); assert.equal(page.data.title, '标题'); assert.equal(page.data.channelVideo, null);
  assert.equal(page.data.channelOpening, false);
});
test('unsupported API and failed jump show helpful errors; recording blocks jump', async () => {
  const { page, wx } = setup(); page.data.channelVideo = ref;
  const event = { currentTarget: { dataset: {} } };
  wx.canIUse = () => false; await page.onOpenChannel(event); assert.match(page.dialog.content, /升级微信/);
  wx.canIUse = () => true; wx.openChannelsActivity = options => options.fail();
  await page.onOpenChannel(event); assert.match(page.dialog.content, /ID/);
  wx.openChannelsActivity = () => assert.fail('must not open while recording');
  page.data.recording = true; await page.onOpenChannel(event);
});
test('create sends reference in both precheck and submission, with no fake video file', async () => {
  const calls = []; const { page } = setup(async (url, options) => { calls.push({ url, options }); return url.endsWith('precheck') ? { verdict: 'pass', requiresManualReview: true, channelVideoChecked: false } : { id: 'new', channelVideo: ref }; });
  page.data.channelVideo = ref; page.data.imageList = [{type:'image',url:'body'}]; await page.onPublish();
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.options.data.channelVideo.feedId, ref.feedId);
  assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[1].options.data.media.length, 1); assert.equal(calls[1].options.data.media[0].type, 'image'); assert.equal(page.data.submitting, true);
});
test('edit removal sends null and retains remaining content', async () => {
  const calls = []; const { page } = setup(async (url, options) => { calls.push({ url, options }); return { verdict: 'pass', id: 'old', requiresManualReview: true, channelVideoChecked: false }; });
  Object.assign(page.data, { post: { id: 'old' }, imageList: [{ type: 'image', url: 'cover' }] }); await page.onPublish();
  assert.equal(calls[1].options.method, 'PATCH'); assert.equal(calls[1].options.data.channelVideo, null); assert.equal(calls[1].options.data.media.length, 1);
});
test('failed precheck prevents submission and clears loading lock', async () => {
  let count = 0; const { page } = setup(async () => { count++; return { error: '网络错误' }; });
  page.data.channelVideo = ref; page.data.imageList = [{type:'image',url:'body'}]; await page.onPublish(); assert.equal(count, 1); assert.equal(page.data.submitting, false);
});
test('precheck errors and missing verdict never label text as prohibited', async () => {
  for (const result of [null, {}, { error: 'Agent service authentication failed' }, { verdict: 'unknown' }]) {
    let count = 0;
    const { page } = setup(async () => { count++; return result; });
    page.data.imageList = [{ type: 'image', url: 'body' }];
    await page.onPublish();
    assert.equal(count, 1);
    assert.equal(page.dialog.title, '预检暂未完成');
    assert.equal(page.data.submitting, false);
    assert.equal(page.data.content, '说明');
  }
});
test('image-only rejection does not invent a text violation', async () => {
  const { page } = setup(async () => ({ verdict: 'reject', details: { images: [{ index: 0, verdict: 'reject' }] } }));
  page.data.imageList = [{ type: 'image', url: 'body' }];
  await page.onPublish();
  assert.match(page.dialog.content, /第1张图片/);
  assert.doesNotMatch(page.dialog.content, /文字内容/);
});
test('explicit text rejection still blocks submission', async () => {
  let count = 0;
  const { page } = setup(async () => { count++; return { verdict: 'reject', details: { text: { verdict: 'reject' } } }; });
  page.data.imageList = [{ type: 'image', url: 'body' }];
  await page.onPublish();
  assert.equal(count, 1);
  assert.match(page.dialog.content, /文字内容疑似/);
});
test('repeated submit is ignored while precheck is pending', async () => {
  let finish; let count = 0;
  const { page } = setup(() => { count++; return new Promise(resolve => finish = resolve); });
  page.data.channelVideo = ref; page.data.imageList = [{type:'image',url:'body'}]; const pending = page.onPublish(); await page.onPublish(); assert.equal(count, 1);
  finish({ error: '停止测试' }); await pending;
});
test('waterfall keeps channels plus audio out of audio-only layout', () => {
  let component; evaluate('miniprogram/components/waterfall/waterfall.ts', { Component: value => component = value, require: () => evaluate('miniprogram/utils/submission-cover.ts') });
  const item = { channelVideo: ref, media: [{ type: 'audio' }], audioUrls: ['a'], coverUrl: '' };
  assert.equal(component.methods.isAudioOnlyMedia(item), false);
  assert.equal(component.methods.isAudioOnlyMedia({ ...item, channelVideo: null }), true);
});

test('edit preserves independent cover and includes it in image precheck', async () => {
  const calls = []; const { page } = setup(async (url, options) => { calls.push({ url, options }); return { verdict: 'pass', id: 'old', requiresManualReview: true, channelVideoChecked: false }; });
  Object.assign(page.data, { post: { id: 'old' }, channelVideo: ref, imageList: [{type:'image',url:'body'}], inheritedCoverUrl: 'https://example.com/cover.jpg' });
  await page.onPublish();
  assert.ok(calls[0].options.data.images.includes(page.data.inheritedCoverUrl));
  assert.equal(calls[1].options.data.coverUrl, page.data.inheritedCoverUrl);
});

test('old backend cannot silently accept a channel reference it does not support', async () => {
  let count = 0; const { page } = setup(async () => { count++; return { verdict: 'pass' }; });
  page.data.channelVideo = ref; page.data.imageList = [{type:'image',url:'body'}]; await page.onPublish();
  assert.equal(count, 1); assert.equal(page.data.channelVideo, ref); assert.equal(page.data.submitting, false);
  assert.match(page.dialog.content, /服务端/);
});
test('failed local upload keeps channel association and current form', async () => {
  const { page, wx } = setup(); page.data.channelVideo = ref;
  page.compressMediaFile = async () => { throw new Error('上传测试失败'); };
  let options; wx.chooseMedia = value => options = value;
  await page.onChooseImage(true);
  await options.success({ tempFiles: [{ tempFilePath: 'video.mp4', fileType: 'video', duration: 10 }] });
  assert.equal(page.data.channelVideo, ref); assert.equal(page.data.title, '标题');
});
test('detail loading restores saved reference and independent cover', async () => {
  const { page } = setup(async () => ({ id: 'saved', title: 'saved title', intro: 'intro', media: [], tags: ['粤语'], channelVideo: ref, coverUrl: 'cover.jpg' }));
  await page.loadPost('saved');
  assert.equal(page.data.channelVideo.feedId, ref.feedId); assert.equal(page.data.inheritedCoverUrl, 'cover.jpg');
});

test('explicit cover wins over first image and restoring default selects first image', () => {
  const { page } = setup(); Object.assign(page.data, { inheritedCoverUrl: 'custom', imageList: [{type:'image',url:'first'}] });
  page.checkCanPublish(); assert.equal(page.data.resolvedCoverUrl, 'custom');
  page.onRemoveInheritedCover(); assert.equal(page.data.resolvedCoverUrl, 'first');
});
test('default cover follows image removal then video thumbnail', () => {
  const { page } = setup(); page.data.imageList = [{type:'image',url:'first'},{type:'image',url:'second'},{type:'video',url:'v',metadata:{thumbnailUrl:'thumb'}}];
  page.checkCanPublish(); assert.equal(page.data.resolvedCoverUrl,'first');
  page.data.imageList.shift(); page.checkCanPublish(); assert.equal(page.data.resolvedCoverUrl,'second');
  page.data.imageList.shift(); page.checkCanPublish(); assert.equal(page.data.resolvedCoverUrl,'thumb');
});
test('cover alone never satisfies submission content requirement', () => {
  const { page } = setup(); page.data.inheritedCoverUrl='cover'; assert.equal(page.getPublishValidation().canPublish,false);
});
test('image picker only offers images, local picker only videos', async () => {
  const { page, wx } = setup(); let choice; wx.chooseMedia = options => choice=options;
  await page.onChooseImage(); assert.equal(choice.mediaType.join(','),'image');
  await page.onChooseImage(true); assert.equal(choice.mediaType.join(','),'video');
});
for (const kind of ['audio', 'image', 'video']) test(`association is available for ${kind} activities`, () => {
  const { page } = setup(); Object.assign(page.data, { selectedActivity: {id:'activity',mediaRequirements:{requiredTypes:[kind]}}, channelVideo: ref,
    audioUrl:kind==='audio'?'audio':'', imageList:kind==='audio'?[]:[{type:kind,url:'body'}] });
  page.onEditChannel(); assert.equal(page.data.channelEditorVisible,true);
  assert.equal(page.getPublishValidation().canPublish,true);
});
test('preview uses current draft without submitting or overwriting edit identity', () => {
  const { page } = setup(() => assert.fail('preview must not request'));
  Object.assign(page.data,{post:{id:'existing'},channelVideo:ref,imageList:[{type:'video',url:'local'}],inheritedCoverUrl:'cover'});
  page.onPreviewSubmission(); assert.equal(page.data.previewVisible,true); assert.equal(page.data.resolvedCoverUrl,'cover');
  page.onClosePreview(); assert.equal(page.data.previewVisible,false); assert.equal(page.data.post.id,'existing'); assert.equal(page.data.channelVideo,ref); assert.equal(page.data.imageList.length,1);
});
test('incomplete draft can preview, but recording and uploading block preview', () => {
  const { page } = setup(); page.data.title=''; page.onPreviewSubmission(); assert.equal(page.data.previewVisible,true);
  page.onClosePreview(); page.data.recording=true; page.onPreviewSubmission(); assert.equal(page.data.previewVisible,false);
  page.data.recording=false; page.data.mediaUploading=true; page.onPreviewSubmission(); assert.equal(page.data.previewVisible,false);
});
test('video thumbnail uploads separately and never becomes a body image', async () => {
  const { page, wx } = setup(); let choice; wx.chooseMedia=options=>choice=options;
  page.compressMediaFile=async file=>file; page.uploadMediaFile=async file=>({...file,url:'uploaded/'+file.url});
  await page.onChooseImage(true); await choice.success({tempFiles:[{fileType:'video',tempFilePath:'video',thumbTempFilePath:'thumb',duration:10}]});
  assert.equal(page.data.imageList.length,1); assert.equal(page.data.imageList[0].type,'video');
  assert.equal(page.data.resolvedCoverUrl,'uploaded/thumb'); assert.equal(page.data.mediaUploading,false);
});
test('audio with independent cover uses image card rather than audio-only layout', () => {
  let component; evaluate('miniprogram/components/waterfall/waterfall.ts', {Component:value=>component=value,require:()=>evaluate('miniprogram/utils/submission-cover.ts')});
  assert.equal(component.methods.isAudioOnlyMedia({media:[{type:'audio'}],coverUrl:'cover'}),false);
});

test('developer tools errors retain WeChat diagnostic and recommend phone preview', async () => {
  const { wx, util } = setup(); wx.getSystemInfoSync = () => ({platform:'devtools'});
  wx.openChannelsActivity = options => options.fail({errMsg:'openChannelsActivity:fail not supported',errCode:123});
  await assert.rejects(util.openChannelVideo(ref), error => /扫码预览/.test(error.message) && /not supported/.test(error.message) && /123/.test(error.message));
  wx.canIUse = () => false;
  await assert.rejects(util.openChannelVideo(ref), /不代表两个 ID 无效/);
});
test('failed draft jump keeps IDs and shows inline diagnostic as well as dialog', async () => {
  const { page, wx } = setup(); Object.assign(page.data,{channelFinderDraft:ref.finderUserName,channelFeedDraft:ref.feedId});
  wx.openChannelsActivity = options => options.fail({errMsg:'openChannelsActivity:fail invalid feedId'});
  await page.onOpenChannel({currentTarget:{dataset:{draft:true}}});
  assert.match(page.data.channelError,/invalid feedId/); assert.equal(page.dialog.content,page.data.channelError);
  assert.equal(page.data.channelFinderDraft,ref.finderUserName); assert.equal(page.data.channelFeedDraft,ref.feedId);
  assert.equal(page.data.channelOpening,false);
});

test('export prefix is preserved in the work ID, while URLs and arbitrary paths are rejected', () => {
  const { util } = setup();
  const id = 'UzFfAgtgekIEAQAAAAAASPYFWC0gZQAAAAstQy6ubaLX4KHWvLEZgBPEm6I0eRMRIKWLzNPgMJpyElocHON4K1eMQqcia73t';
  assert.equal(util.parseChannelVideo('sphp2j5T7jgNKyO', ` export/${id} `).feedId,`export/${id}`);
  assert.equal(util.parseChannelVideo('finder',id).feedId,id);
  for (const value of ['export/', 'export/export/abc', 'other/abc', 'https://example.com/export/abc', 'abc/export/def']) assert.equal(util.parseChannelVideo('finder',value),null);
  assert.equal(util.parseChannelVideo('export/finder','abc'),null);
});
test('pasting, opening and saving use the same normalized feed ID', async () => {
  const { page, wx } = setup(); let opened;
  page.onChannelFeedInput({detail:{value:` export/${ref.feedId} `}});
  assert.equal(page.data.channelFeedDraft,`export/${ref.feedId}`);
  Object.assign(page.data,{channelFinderDraft:ref.finderUserName,channelFeedDraft:`export/${ref.feedId}`});
  wx.openChannelsActivity=options=>{opened=options;options.success();};
  await page.onOpenChannel({currentTarget:{dataset:{draft:true}}});
  assert.equal(opened.feedId,`export/${ref.feedId}`); assert.equal(page.data.channelFeedDraft,`export/${ref.feedId}`);
  page.onSaveChannel(); assert.equal(page.data.channelVideo.feedId,`export/${ref.feedId}`);
});

for (const [link, url] of [
  ['assistant','https://channels.weixin.qq.com/'],
  ['guide','https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/channels-activity.html'],
]) test(`clipboard failure preserves the exact ${link} link and explains missing declaration`, () => {
  const {page,wx}=setup(); let copied;
  wx.setClipboardData=options=>{copied=options.data;options.fail({errMsg:'setClipboardData:fail api scope is not declared in the privacy agreement'});};
  page.onCopyChannelHelpLink({currentTarget:{dataset:{link}}});
  assert.equal(copied,url); assert.equal(page.data.channelCopyFallbackUrl,url); assert.match(page.data.channelCopyError,/隐私声明/);
  assert.equal(page.data.title,'标题');
  wx.setClipboardData=options=>options.success();
  page.onCopyChannelHelpLink({currentTarget:{dataset:{link}}});
  assert.equal(page.data.channelCopyError,''); assert.equal(page.data.channelCopyFallbackUrl,'');
});

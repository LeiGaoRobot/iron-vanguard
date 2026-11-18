// WeChat build settings. Fill these in from the mini-game admin console (mp.weixin.qq.com).
// GAME_NAME must match the registered name exactly: review rejects any other title, subtitle or English name.
export const GAME_NAME = '钢翼先锋';
// 流量主 → 广告管理 → 激励视频 → 广告单元 ID (looks like 'adunit-xxxxxxxxxxxxxxxx').
// Empty: no ad SDK is touched and the rewards are granted for free (dev / before 流量主 is opened).
export const AD_UNIT_REWARDED = '';
// share card image (optional, 5:4, inside the package or an https URL); empty = WeChat screenshots the game
export const SHARE_IMAGE = '';
// 适龄提示: the age shown on the boot screen and the title badge. It must match the age filled in at
// 提审 (基本信息 → 适龄提示); 12+ fits a sci-fi shooter with no blood and no human enemies.
export const AGE = 12;
export const AGE_TEXT = [
  `本游戏适合 ${AGE} 周岁以上用户，建议未成年人在家长监护下使用。`,
  '游戏为架空科幻背景的三维机甲射击，敌方全部为无人兵器，无真人形象、无血腥画面，含武器开火与爆炸效果。',
  '游戏内资金只能通过游戏获得，没有充值与付费道具；可选择观看激励视频获得复活、报酬翻倍或补给。',
  '游戏没有聊天与陌生人社交功能，可把任务分享给微信好友。',
  '请合理安排游戏时间，注意休息。',
];
// 健康游戏忠告 (the standard text from the 2004 GAPP notice), shown on the boot screen
export const HEALTH = ['抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。', '适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。'];
// game club (游戏圈) button on the title screen; set false to hide it
export const GAME_CLUB = true;

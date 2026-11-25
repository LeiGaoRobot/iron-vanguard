# Android APK (TapTap 国际版)

把已发布的单文件网页版(`docs/index.html`)装进一个全屏 WebView 外壳,打成已签名的 APK。不用 Gradle、不用 Android Studio。

```
python android/build_apk.py                  # 打包 docs/index.html → android/out/IronVanguard-<版本>.apk
python android/build_apk.py --src dist/index.html
python android/build_apk.py --code 2 --name 1.0.1
```

每次上传新版本前先改 `version.json` 里的 `versionCode`(必须递增)和 `versionName`。

## 依赖

- JDK 17+(本机是 Microsoft OpenJDK 21)
- Android SDK:`D:/AI/tools/android-sdk`,里面有 build-tools 36.1.0、platforms/android-36、platform-tools(adb)。如果 SDK 在别的位置,用 `ANDROID_HOME` 指过去
- Pillow(从 `wechat/icon/icon_512.png` 生成启动图标)

## 外壳做了什么(`src/.../MainActivity.java`)

- 页面从 APK 的 `assets/www/` 加载,地址是虚拟的 `https://appassets.androidplatform.net/index.html`,所以 ES 模块、localStorage 存档和 WebGL2 都和普通 https 网站一样
- **完全离线**:manifest 里没有 INTERNET 权限,其他请求一律返回 404;Google Fonts 换成了打进包里的 Rajdhani(`fonts/`,OFL 授权)
- 横屏全屏沉浸模式,屏幕常亮;切到后台时 WebView 暂停,游戏自己会进入暂停
- 返回键:战斗中暂停,暂停时继续,机库 / 勋章 / 结算页返回上一级,标题页连按两次退出
- WebView 渲染进程被系统杀掉时重建 Activity,不会直接闪退
- `IVShell` JS 桥:`webViewVersion()` 返回系统 WebView 包名和版本,`openWebViewUpdate()` 在应用商店打开它(先 `market://`,不行再网页版 Play)
- debug 构建才能用 `chrome://inspect` 远程调试(release 构建关闭)

## 打包时对页面做的适配(`build_apk.py` 的 `MOBILE_CSS` / `MOBILE_JS`)

菜单按 1280×720 桌面设计,手机横屏只有约 360–430 CSS px 高:

- 标题 / 暂停 / 结算:整张卡片按屏幕缩放到正好放下
- 机库 / 勋章:本来就是要滚动的长列表,只缩到 0.6–1 倍,然后滚动
- 触屏设备隐藏标题页的键盘鼠标说明(战斗里有触屏按钮)
- **启动检查(`CHECK_JS`)**:游戏需要 import maps(Chrome 89)、DecompressionStream(80,单文件版的 GLB 是 gzip 内嵌的)和 WebGL2。页面一开始用纯 ES5 检查 UA 里的 Chrome 版本 ≥ `MIN_CHROME`(89)、DecompressionStream 和 WebGL2,缺任何一项就盖一层全屏中英文提示(显示当前 WebView 版本、"去应用商店更新"按钮、"仍然尝试"关掉提示),而不是黑屏。测试时在地址后加 `?ivcheck=v`(版本过旧)或 `?ivcheck=gl`(无 WebGL2)强制显示

这些改动只在 APK 里生效,不改 `site/`。

## 商店素材(`store/`)

- **截图**:`store/screenshots/` 里 8 张 1920×1080 横屏 JPG(标题 / 机库 / 暴雨 / 熔岩 / 巨龟 / 奇点 / 角斗场 / 雪原)。重拍:先 `python android/build_apk.py`(截图用的是 `build/assets/www` 里打包后的页面),再
  ```
  node android/store/capture.mjs            # 全部
  node android/store/capture.mjs forge beh  # 只拍这几张(按名字)
  ```
  脚本起一个本地 http.server(8240)和无头 Chrome(CDP 9333),按 960×540、DPR 2、安卓 UA、触屏模拟打开页面,所以画质档位、触屏按钮和 APK 里一样。每张战斗图让自动驾驶先打 24–34 秒,然后逐帧推到"镜头前 60 m 内至少两台敌机、镜头没贴墙、没有横幅和提示"再截;游戏在截图间隙仍按真实时间运行,横幅可能刚好弹出,所以截完会检查,不干净就再推几帧重拍。存档里资金固定为 18450 C,并拥有全部部件 / 框架 / 迷彩,方便换展示用的机体。改 `SHOTS` 表可以换任务和配装
- **隐私政策**:`docs/privacy.html`,中英双语,随 GitHub Pages 发布在 https://leigaorobot.github.io/iron-vanguard/privacy.html (推送后生效)。内容按现状写:不申请权限、没有网络权限、不收集任何信息,进度只存在本机 localStorage,卸载或清除数据即删除;网页版会请求 Google Fonts。以后加联网、广告或统计,要先改这一页

## 签名密钥 —— 一定要备份

第一次构建时会在 `android/keystore/` 生成 `release.jks` 和 `keystore.properties`(密码在后者里),这个目录已加入 .gitignore。**TapTap 只接受用同一把密钥签名的更新**,丢了就只能换包名重新上架。请把整个 `keystore/` 目录备份到别的盘或密码管理器。

## 在手机上安装测试

手机打开"开发者选项 → USB 调试",连上电脑后:

```
D:\AI\tools\android-sdk\platform-tools\adb.exe install -r android\out\IronVanguard-1.0.0.apk
D:\AI\tools\android-sdk\platform-tools\adb.exe logcat -s IronVanguard
```

也可以直接把 APK 发到手机上点开安装(需要允许"安装未知来源应用")。

## 已知限制

- 菜单是缩放后的桌面布局,文字偏小,没有微信版那样专门的手机界面
- 最低要求 Android System WebView 89 + WebGL2:Android 8 出厂自带的 WebView 更老,但 WebView 可以通过应用商店单独更新,没更新过的设备会看到启动检查的提示;没有 Google Play 的设备上"去应用商店更新"可能打不开,只会弹 Toast
- 目前只在桌面 Chromium 里模拟手机横屏(740×360)验证过页面(启动检查用 `?ivcheck=` + 模拟的 `IVShell` 验过两种提示和两个按钮),外壳代码(资源拦截、返回键、JS 桥)还没有在真机或模拟器上跑过

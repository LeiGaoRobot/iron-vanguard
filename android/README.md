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
- debug 构建才能用 `chrome://inspect` 远程调试(release 构建关闭)

## 打包时对页面做的适配(`build_apk.py` 的 `MOBILE_CSS` / `MOBILE_JS`)

菜单按 1280×720 桌面设计,手机横屏只有约 360–430 CSS px 高:

- 标题 / 暂停 / 结算:整张卡片按屏幕缩放到正好放下
- 机库 / 勋章:本来就是要滚动的长列表,只缩到 0.6–1 倍,然后滚动
- 触屏设备隐藏标题页的键盘鼠标说明(战斗里有触屏按钮)

这些改动只在 APK 里生效,不改 `site/`。

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
- three r184 只支持 WebGL2:Android 8+ 配近几年的 Android System WebView 基本都有,但很老的 GPU 驱动可能会黑屏
- 目前只在桌面 Chromium 里模拟手机横屏(740×360)验证过页面,外壳代码(资源拦截、返回键)还没有在真机或模拟器上跑过

# 英寸照妖镜

拍检查表（IN-PROCESS INSPECTION REPORT 这类），尺寸（DIMENSION）、公差（LSL / USL）、控制范围（LCL / UCL）的数换算了，红字写在原图上原数旁边。

- 搬自：QIANSHOULAB/gongshi `inch/index.html` 0.5.5（字在 `strings.js` 的 zh.inch）。施工单 122。
- 认字换成苹果本机的 Vision（`VNRecognizeTextRequest`，accurate），网页版的 PaddleOCR 不搬，不用下模型，照片不出手机。
- 扶正：四个方向各用 fast 认一遍，认出字最多、最有把握的方向是正的（网页版是 PaddleOCR 的 0/180 小模型投票）；再按字行转平。透视交给出图那步的四角矫正，跟网页版一样。
- 两种模式：英寸 → 毫米（× 25.4，留 3 位）、毫米 → 英寸（÷ 25.4，留 4 位），记住上次选的。
- 认表头、按距离配对（空着的余量列不抢隔壁的数），自动对账（尺寸 + 下差 = LCL、尺寸 + 上差 = UCL，有余量时 ± 余量），对不上的标黄、给倒推的值、点「用这个」填上；红字各自从原数换算；点红字改数；认不出表头时纯数字全换（含 3/8、1-1/4），螺纹规格不动，角度不换。这些都是网页版的逻辑原样搬（`YingCun.swift`），对象键的先后、稳定排序都照着来。
- Vision 一次全认，网页版只认要的那几列：`YingCun.prune` 把表头下面不在 尺寸/下差/上差/余量/LCL/UCL/标号 列里的字抹掉，实测值、结果栏不掺进来。
- 图宽：app 只竖屏，结果图能两指放大，「横过来看」转 90° 铺满屏。存图走分享面板（能存相册）。
- 长相：网页版那面照妖镜（八卦镜框、外圈法阵、藤蔓、镜光）是网页自己画出来、用 Playwright 截的透明图层（`zhaoyao-*.webp`），镜面在 SwiftUI 里画；外圈平时每秒 5°，照妖时 70°，一按先甩到 260°。镜子挂在一块墨色镜龛里，镜龛外面是铁屑江湖的宣纸页。
- 单测：`Tests/YingCunTests.swift`
  - 8 张假检查表（`Tests/Fixtures/`，PIL 画的：歪 7°、倒拍、横拍、透视 + 模糊 + 阴影、透视 + 歪 + 阴影、毫米表、没表头），网页版在 Playwright 里读过，拿它当标准答案；
  - 同一批字框进 Swift 版，两种模式每一格的换算、黄格、对上账、倒推一字不差；
  - 认数、换算 40 个边角例子跟网页版一字不差；
  - Vision 整条链读这 8 张，每一格跟网页版比。
- 文件：`YingCun.swift` 算法，`YingCunVision.swift` 认字扶正，`YingCunRender.swift` 出图，`YingCunStrings.swift` 字，`YingCunView.swift` 界面。
- 版本：0.2.0（铁屑江湖 0.2.0 起）。

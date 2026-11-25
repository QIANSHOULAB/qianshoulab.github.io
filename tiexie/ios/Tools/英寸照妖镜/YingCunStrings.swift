// 英寸照妖镜的字（照 gongshi strings.js 的 zh.inch，App 里只要中文；认字换成本机，装脑子那几句不要了）
enum YingCunStrings {
    static let name = "英寸照妖镜"
    static let sub = "八分之三算断魂，二五点四乘进坟。\n烂图一拍全干碎，只认毫米弃碑文。"
    static let tile = "拍检查表，英寸换毫米，红字写在原图上"
    static let in2mm = "英寸 → 毫米"
    static let mm2in = "毫米 → 英寸"
    static let faceIdle = "拍照"
    static let faceBusy = "照妖中"
    static let hintTitle = "对着检查表拍"
    static let hintText = "尺寸、公差、控制范围当场现原形。"
    static let album = "相册"
    static let stepOrient = "照片扶正中…"
    static let stepRead = "认字中…"
    static let stepCheck = "对账中…"
    static let stepDraw = "落红字…"
    static let fail = "照妖失败，再拍一张试试。"
    static let badImage = "照妖失败：这张图手机打不开。再拍一张试试。"
    static let none = "一个数字都没照出来。凑近点、拍正点，再来一张。"
    static func redIs(_ unit: String) -> String { "红字是\(unit)" }
    static func flags(_ n: Int) -> String { n == 1 ? "1 个黄格没对上账，点它改" : "\(n) 个黄格没对上账，点它改" }
    static func checked(_ n: Int) -> String { n == 1 ? "1 行全对上账" : "\(n) 行全对上账" }
    static let tapToFix = "认错了就点红字改"
    static let loose = "没找到 DIMENSION / LSL / USL，照片里的数字全换了"
    static let looseFlags = "黄的没把握，点它改"
    static let mm = "毫米"
    static let inches = "英寸"
    static func unitWrong(_ unit: String) -> String { "表上是\(unit)，选反了？" }
    static let unitFix = "换过来"
    static let turn = "图宽，点「横过来看」字大一倍多；也能两指放大。"
    static let sideways = "横过来看"
    static let save = "保存图片"
    static let again = "再拍一张"
    static let edTitle = "这个数认对了吗？"
    static func edRow(_ no: String) -> String { "标号 \(no)" }
    static func edReadAs(_ t: String) -> String { "认成 \(t)" }
    static let edLoose = "照片里的数"
    static let names = ["DIM": "尺寸 DIMENSION", "LSL": "下差 LSL", "USL": "上差 USL", "LCL": "控制下限 LCL", "UCL": "控制上限 UCL", "STOCK": "加工余量 STOCK"]
    static let signLabel = "正负号"
    static let numLabel = "原数"
    static let numHint = "只认数字，比如 1.0860、-0.0050、3/8"
    static let sugCalc = "按尺寸和公差算该是 "
    static let sugBack = "按 LCL/UCL 倒推是 "
    static let sugUse = "用这个"
    static let cancel = "取消"
    static let ok = "改好了"
    static let imgRed = "红字"
    static let imgBrand = "英寸照妖镜"
    static let fileName = "英寸照妖镜"
    static let close = "收起"
    // 166：管控线 / 全要、存原图
    static let pickLimits = "管控线"
    static let pickAll = "全要"
    static let limitsOnly = "只换了管控线"
    static let limitsNone = "这张没找到 CONTROL LIMIT（LCL / UCL），本镜一个数都没碰。真要全换，点「全要」"
    static func skipped(_ n: Int) -> String { "\(n) 个数挤得没地方写，没硬塞；凑近拍一段更清楚" }
    static let saveOriginal = "存原图"
    static let savedOriginal = "原图进相册了，没盖红字的那张"
    static let saveDenied = "没存上：设置 → 铁屑江湖 → 照片，给个「添加照片」"
    static let saveFailed = "没存上，再点一次试试"
}

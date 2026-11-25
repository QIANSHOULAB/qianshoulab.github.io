// 铁件点钞机的字（照 gongshi draft-count strings.js 的 zh.count；谷歌钥匙那几句不要了，换成大管家的）
enum DianChaoStrings {
    static let name = "铁件点钞机"
    static let tile = "拍一盘工件，大管家数，圆点能手改"
    static let lab = "千手院出品"
    static let sub = "肉眼凡胎当枪使，满盘铁件数到死。\n残盒半露入法眼，天眼一开万数知。"
    static let hint = "整盘入镜，从正上方拍"
    static let stIdle = "待机"
    static let stBusy = "点钞中"
    static let stDone = "完成"
    static let stJam = "卡钞了"
    static let working = ["一格一格过目", "歪着的也逮住", "半截盒子装没看见", "叠着的再瞄一眼"]
    static let unit = "件"
    static func trayN(_ i: Int) -> String { "第 \(i) 盒" }
    static func trayPcs(_ n: Int) -> String { "\(n) 件" }
    static let cut = "没拍全 · 不算"
    static let cutMain = "这盒没拍全，边上自己瞄一眼"
    static let include = "也算上"
    static let exclude = "不算"
    static let fixHint = "点圆点删掉，点漏掉的件补上。"
    /// 150：复查改了数（件数一样、只是换了点时，后头说清补了几个、去了几个）
    static func fixed(_ before: Int, _ after: Int, add: Int, del: Int) -> String {
        "复查改了：\(before) → \(after)" + (before == after ? "（补 \(add) 个、去 \(del) 个）" : "")
    }
    static func auditAdd(_ n: Int) -> String { "复查揪出 \(n) 个漏网的（绿圈）" }
    static func auditDel(_ n: Int) -> String { "删了 \(n) 个点错的" }
    static func edited(_ d: String) -> String { "手改 \(d)" }
    static let certified = "天眼开光"
    static let save = "存图"
    static let recount = "重数"
    static let albumShort = "相册"
    static let cap = "拍"
    static let none = "一个都没看见。凑近点，从正上方拍。"
    static let foot = "只数一盒；第二盒完整拍进来才一起数。照片只寄给自己的大管家，手机上不留。"
    static let imgBrand = "铁件点钞机"
    static let fileName = "铁件点钞机"
    // 大管家那头（122）
    static let notPaired = "还没跟大管家配对：设置 › 粘贴配对码"
    static func away(_ hhmm: String) -> String { "大管家不在（上次在线 \(hhmm)），这盘先自己数。" }
    static let awayNever = "大管家不在，这盘先自己数。"
    static let noReply = "大管家没回，再拍一次？"
    static let sendFail = "没寄出去，看看网，再拍一次？"
    static let jamDefault = "大管家没数成，再拍一张试试"
    static let byButler = "大管家数的"
    static let settings = "设置"
    static let settingsGo = "去设置里配对"
}

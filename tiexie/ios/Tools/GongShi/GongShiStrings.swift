// 工时榨汁机的字（照 gongshi strings.js 的 zh.co，App 里只要中文）
enum GongShiStrings {
    static let name = "工时榨汁机"
    static let sub = "智商欠费算盘精，鸡毛蒜皮当圣经。\n抹去凡间烟火气，灵长动物化肉身。"
    static let tile = "开始、结束一填，茶歇饭点自动扣光"
    static let start = "开始"
    static let end = "结束"
    static let now = "现在"
    static let nextDay = "次日结束"
    static let band = "实际换型时间"
    static let chip = "示例"
    static let unit = "分钟"
    static let badStart = "开始时间看不懂，直接打数字，比如 830 或 1321。"
    static let badEnd = "结束时间看不懂，直接打数字，比如 830 或 1321。"
    static let needBoth = "填开始和结束时间。"
    static let needStart = "还差开始时间。"
    static let needEnd = "还差结束时间，收工时按「现在」。"
    static let endBeforeStart = "结束比开始还早。第二天才收工的话："
    static let fix = "改成次日"
    static func summary(net: String, gross: Int, cut: Int) -> String { "\(net) · 毛时长 \(gross) 分，扣 \(cut) 分" }
    static let breaks = "休息表"
    static let deducted = "本单扣（分）"
    static let overnight = "下班 → 次日上班"
    static let noBreaks = "没有休息"
    static let edit = "改休息表"
    static let clockIn = "上班"
    static let clockOut = "下班"
    static let add = "＋ 加一段"
    static let reset = "恢复默认"
    static let done = "完成"
    static let noteOk = "改了马上算数，只存在这台手机上。"
    static func noteBad(_ why: String) -> String { "\(why)。直接打数字，比如 1000 就是 10:00。" }
    static let badOn = "上班时间看不懂"
    static let badOff = "下班时间看不懂"
    static let offBeforeOn = "下班要比上班晚"
    static let badRowStart = "有一段的开始时间看不懂"
    static let badRowEnd = "有一段的结束时间看不懂"
    static let rowBackwards = "有一段结束比开始早"
    static func tooMany(_ n: Int) -> String { "最多 \(n) 段" }
    static let breakName = "休息"
    static let nameMax = 6
    static func foot(on: String, off: String) -> String { "上班 \(on) · 下班 \(off) · 只扣和起止时间重叠的部分" }
    static let footCustom = "休息表是这台手机自己改的"
}

import Foundation

// 正文自动排版：跟网站 index.html 的 typeset() 一模一样（单测拿网站拆出来的结构对）。
// - 大写字母加数字、#、%、( 开头的行算代码；行尾中文括号里的字挪到下一行当注释
// - 【…】、《…》和「第X式…」（不带冒号，40 字以内）是小标题
// - 冒号前 24 个字以内加粗
// - 空一行是分段

struct CodeLine: Equatable, Codable {
    var code: String
    var note: String
}

enum Block: Equatable {
    case heading(String)
    case para(lead: String?, text: String)
    case code([CodeLine])
    case gap
}

enum Typeset {
    private static let cjk = "\\x{3400}-\\x{9fff}\\x{f900}-\\x{faff}"
    private static let noteRE = try! NSRegularExpression(pattern: "^(.*?)\\s*[（(]([^）)]*[\(cjk)][^）)]*)[）)]\\s*$")
    private static let cjkRE = try! NSRegularExpression(pattern: "[\(cjk)]")
    private static let codeRE = try! NSRegularExpression(pattern: "^(?:[A-Z]-?[\\d.#]|#\\d|%|\\(|IF\\s*\\[|WHILE\\s*\\[|GOTO|END\\d|DO\\d)")
    private static let headBracket = try! NSRegularExpression(pattern: "^【.+】$")
    private static let headBook = try! NSRegularExpression(pattern: "^《.+》$")
    private static let headStyle = try! NSRegularExpression(pattern: "^第[一二三四五六七八九十百零〇\\d]+[式章节回篇部卷]")
    private static let leadRE = try! NSRegularExpression(pattern: "^([^：]{1,24})：\\s*(.+)$")

    private static func match(_ re: NSRegularExpression, _ s: String) -> NSTextCheckingResult? {
        re.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length))
    }

    private static func group(_ m: NSTextCheckingResult, _ i: Int, _ s: String) -> String {
        let r = m.range(at: i)
        guard r.location != NSNotFound else { return "" }
        return (s as NSString).substring(with: r)
    }

    static func splitNote(_ s: String) -> CodeLine {
        if let m = match(noteRE, s) { return CodeLine(code: group(m, 1, s), note: group(m, 2, s)) }
        return CodeLine(code: s, note: "")
    }

    static func isCode(_ code: String) -> Bool {
        !code.isEmpty && match(cjkRE, code) == nil && match(codeRE, code) != nil
    }

    static func isHeading(_ s: String) -> Bool {
        if match(headBracket, s) != nil || match(headBook, s) != nil { return true }
        return match(headStyle, s) != nil && !s.contains("：") && (s as NSString).length <= 40
    }

    /// JavaScript 的 String.prototype.trim 去掉的那些空白
    private static let jsSpace: CharacterSet = {
        var c = CharacterSet.whitespacesAndNewlines
        c.insert(charactersIn: "\u{FEFF}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}")
        return c
    }()

    static func blocks(_ text: String) -> [Block] {
        let lines = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
        var out: [Block] = []
        var box: [CodeLine]? = nil
        var gap = false
        var any = false

        func flush() {
            guard let b = box else { return }
            out.append(.code(b))
            box = nil
            gap = false
        }

        for raw in lines {
            let line = raw.trimmingCharacters(in: jsSpace)
            if line.isEmpty {
                flush()
                if !gap && any { out.append(.gap); gap = true }
                continue
            }
            let parts = splitNote(line)
            if isCode(parts.code) {
                if box == nil { box = [] }
                box!.append(parts)
                any = true
                continue
            }
            flush()
            if isHeading(line) {
                out.append(.heading(line))
            } else if let m = match(leadRE, line) {
                out.append(.para(lead: group(m, 1, line) + "：", text: group(m, 2, line)))
            } else {
                out.append(.para(lead: nil, text: line))
            }
            any = true
            gap = false
        }
        flush()
        if gap, out.last == .gap { out.removeLast() }
        return out
    }
}

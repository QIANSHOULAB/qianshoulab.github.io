import Foundation

// 数字格式：跟网页的 JavaScript 一模一样（工具箱里的工具拿网页版对数，差一位都不行）。

enum JSNumber {
    /// JavaScript 的 Number.prototype.toFixed：按这个 double 的精确十进制值四舍五入，正好一半时取大的那个（离零远的）。
    /// 跟 C 的 %.Nf 不一样（那个一半时取偶数），所以自己算。
    static func toFixed(_ x: Double, _ digits: Int) -> String {
        guard x.isFinite else { return x.isNaN ? "NaN" : (x > 0 ? "Infinity" : "-Infinity") }
        if abs(x) >= 1e21 { return String(x) }
        let neg = x < 0
        // 精确十进制展开（苹果的 printf 给的是精确值），多要几位够判断一半
        let exact = String(format: "%.80f", abs(x))
        let parts = exact.split(separator: ".", omittingEmptySubsequences: false)
        let intPart = Array(parts[0])
        let frac = parts.count > 1 ? Array(parts[1]) : []
        var keep = intPart + frac.prefix(digits)
        while keep.count < intPart.count + digits { keep.append("0") }
        let rest = frac.count > digits ? Array(frac[digits...]) : []
        let roundUp = (rest.first.map { $0 >= "5" } ?? false)
        var digitsArr = keep.map { Int(String($0))! }
        if roundUp {
            var i = digitsArr.count - 1
            var carry = 1
            while i >= 0 && carry > 0 {
                let v = digitsArr[i] + carry
                digitsArr[i] = v % 10
                carry = v / 10
                i -= 1
            }
            if carry > 0 { digitsArr.insert(carry, at: 0) }
        }
        let all = digitsArr.map(String.init).joined()
        let cut = all.count - digits
        var s = String(all.prefix(cut))
        // 去掉整数部分多余的前导 0
        while s.count > 1 && s.hasPrefix("0") { s.removeFirst() }
        if digits > 0 { s += "." + all.suffix(digits) }
        let isZero = digitsArr.allSatisfy { $0 == 0 }
        return (neg && !isZero) ? "-" + s : (neg && isZero ? "-" + s : s)
    }

    /// JavaScript 把数字变成字的样子（String(1) = "1"，String(0.5) = "0.5"）：整数不带小数点
    static func plain(_ x: Double) -> String {
        if x == x.rounded() && abs(x) < 1e15 { return String(Int64(x)) }
        var s = String(x)
        if s.hasSuffix(".0") { s.removeLast(2) }
        return s
    }
}

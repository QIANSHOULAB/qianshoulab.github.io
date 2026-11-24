// 工具箱注册表：一个工具一行。
// 加工具：Tools/<工具>/ 放界面、算法、字、单测、README，再在这里加一行。
// 删工具：删它的文件夹 + 删这里那一行，照样编译、照样过测试（CI 的「拆一个工具试试」每次都验）。
enum ToolRegistry {
    static let all: [ToolEntry] = [
        JiaoDuTool.entry,   // 角度算距离 Tools/JiaoDu
        GongShiTool.entry,  // 工时榨汁机 Tools/GongShi
        YingCunTool.entry,  // 英寸照妖镜 Tools/英寸照妖镜
    ]
}

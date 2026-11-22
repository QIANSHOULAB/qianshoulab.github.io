# 铁屑江湖 · tiexie/

Song 的 CNC 秘籍手机网站：https://qianshoulab.github.io/tiexie/

- 2026-11-22 Grok 会员到期，songcm.grok.me 要登录才进得去，整站搬到这里。长相照 Grok 那版的样式表原样搬（宣纸、双线版框、目录 + 封面、毛笔字、背景招式小人），只读，没有掌门后台。
- 内容找回来的：《VM10探零宝典》（Grok 源码备份里的底稿和封面图）、《VM12探零宝典》（聊天里的定稿，二戒按最后那版）。Grok 后台里后来加的东西（布阵图照片之类）锁在 Grok 里，没搬过来。
- Grok 时代的源码备份：私有库 QIANSHOULAB/tiexie-jianghu。

## 加秘籍

秘籍全在 `index.html` 底部 `<script type="application/json" id="tx-data">` 那段 JSON：

- `books`：一本一条。`id` 用英文小写（就是网址 # 后面那段），`category` 填 `baodian` 宝典 / `daofa` 刀法 / `buzhen` 布阵图 / `bingqi` 兵器谱，`body` 是正文，`img` 是封面图路径（空着就用代码画一本蓝皮线装书）。
- 正文自动排版：大写字母加数字、`#`、`%`、`(` 开头的行算代码，行尾中文括号里的字挪到下一行当注释；`【…】` 和「第X式…」（不带冒号）是小标题；冒号前 24 个字以内加粗；空一行是分段。
- 布阵图：先在 `sets` 加一个大标题（比如 `{"id": "svm10", "title": "VM-10", "img": ""}`），图纸那本 `category` 填 `buzhen`、`setId` 填大标题的 id，详细图片按顺序写进 `plates`。图片放 `img/`，封面长边 1000 像素左右，详细图长边 1600 左右，JPEG。
- 改完推到 main 就上线（GitHub Pages 有约 10 分钟缓存）。

/* 界面上所有给人看的字都在这（托盘菜单、通知也从这读）。加英文：照抄一份 en，改 LANG。 */
window.STR = {
  zh: {
    app: "扫地僧",
    tagline: "文件乱扔，你去玩，贫僧扫",
    nav_rename: "改名", nav_sort: "分文件夹", nav_dl: "下载", nav_watch: "盯着", nav_hist: "记录",
    side_today: "今天 {n}",
    foot_mail_pre: "找方丈：", foot_home: "千手院",
    update: "有新版 {v}",

    /* 第一次开头那句话 */
    intro_t: "「下载」交给贫僧了",
    intro_s: "新下的文件按类型自动分好，开机就在岗。",
    intro_pile: "旧的 {n} 个也分了",
    intro_on: "盯着",
    intro_ok: "知道了",

    /* 选文件夹 */
    pick_title: "把文件夹拖进来",
    pick_sub_rename: "一千个文件改名，眨眼的事。",
    pick_sub_sort: "图片归图片，文档归文档。",
    pick_btn: "选文件夹", demo: "用示例试试", recent: "最近",
    pick_paste: "或者粘贴路径，回车",
    change: "换一个", open_folder: "打开",
    nofolder: "这个文件夹找不到。", nofolder_fix: "看看路径对不对，或者直接把文件夹拖进来。",
    drop_here: "松手",
    loading: "正在看 {n} 个文件…", loading0: "正在看…",

    /* 改名 */
    r_title: "改名", r_add: "加一条", r_last: "照上回的改法", r_clear: "清空", r_recent: "最近用过",
    q_number: "序号", q_replace: "替换文字", q_date: "日期", q_taken: "拍摄时间", q_case: "大小写", q_trim: "去多余空格",
    q_insert: "加前后缀", q_remove: "删几个字", q_ext: "扩展名", q_music: "歌手 - 歌名", q_attr: "宽 × 高",
    rule_number: "序号", rule_replace: "替换", rule_date: "日期", rule_case: "大小写", rule_trim: "去多余空格",
    rule_insert: "加文字", rule_remove: "删字", rule_ext: "扩展名", rule_tpl: "模板",
    f_find: "找", f_to: "换成", f_regex: "正则", f_matchcase: "分大小写", f_start: "从", f_step: "每次加", f_digits: "位数",
    f_where: "放在", at_start: "前面", at_end: "后面", at_name: "整个名字", f_sep: "连接符",
    f_source: "哪个时间", s_modified: "修改时间", s_created: "创建时间", s_taken: "拍摄时间", s_today: "今天",
    f_fmt: "格式", f_text: "文字", f_first: "删开头", f_last: "删结尾", f_chars: "个字",
    c_lower: "全小写", c_upper: "全大写", c_title: "单词首字母大写", c_sentence: "句首大写",
    e_lower: "小写", e_upper: "大写", e_set: "改成",
    rule_on: "开着", rule_off: "关了", rule_up: "上移", rule_del: "删掉",
    rules_empty: "点上面加一条，右边马上看到新名字。",
    opt_title: "范围", opt_sub: "含子文件夹", opt_ext: "只改这些类型", opt_ext_ph: "jpg, png", opt_kw: "名字里有", opt_kw_ph: "关键词",
    opt_sort: "编号顺序", sort_name: "名字", sort_mtime: "修改时间", sort_taken: "拍摄时间",
    col_old: "现在", col_new: "改成",
    stat: "{total} 个文件，{changed} 个要改", stat_bump: "，{n} 个撞名", stat_err: "，{n} 个改不了", stat_notaken: "，{n} 个没拍摄时间",
    n_bumped: "撞名，加了 (2)", n_fixed: "有 Windows 不认的字，换成了全角", n_notaken: "没拍摄时间，用了修改时间", n_notaken_skip: "没拍摄时间，不动",
    f_fallback: "没拍摄时间的用修改时间顶上",
    n_empty: "名字会变空，跳过", n_nometa: "有的信息读不到，留空了", n_badregex: "正则写错了",
    more_rows: "还有 {n} 个没列出来，改名时一起改",
    run_rename: "改名 {n} 个", nothing: "没有要改的",
    done_rename: "改好了 {n} 个", done_failed: "{n} 个没动成", undo: "撤销", undo_n: "撤销这 {n} 个", undone: "撤销了，{n} 个回到原样",
    undo_skip: "，{n} 个已被挪走或占着，没动",
    again: "再来一次",

    /* 分文件夹 */
    s_title: "分文件夹", s_how: "怎么分", s_scheme: "分法",
    scheme_custom: "自己定", scheme_custom_d: "名字、内容、扩展名、日期、大小随便组合",
    sd_type: "图片、文档、表格各进各的", sd_month: "按修改月份，2026/2026-10", sd_taken: "照片按拍摄月份，别的不动",
    act_move: "挪过去", act_copy: "复制一份", act_unzip: "压缩包顺手解开（zip、tar）",
    s_watch: "以后新来的也这么分", s_watch_on: "盯着呢，新来的自动分",
    by_type: "按类型", by_content: "内容里有", by_date: "按日期", by_kw: "名字里有", by_ext: "扩展名是", by_size: "大于",
    to_folder: "放进", rest: "其余的", rest_stay: "留在原地", rest_to: "放进",
    add_rule: "加一条", mb: "MB",
    groups: "分成 {n} 堆", stay_n: "{n} 个不动", inplace: "原地改名", unz_grp: "解压出来", unz_n: "{n} 个压缩包要解",
    stat_move: "{total} 个文件，{changed} 个要挪", stat_copy: "{total} 个文件，{changed} 个要复制",
    run_sort: "分好 {n} 个", run_copy: "复制 {n} 个",
    done_sort: "分好了 {n} 个", done_copy: "复制好了 {n} 个", done_unz: "解了 {n} 个包",
    w_unz: "解压 ", w_copy: "复制 ",

    /* 出错：一句人话 + 怎么办 */
    fail_head: "{n} 个没动成",
    err_busy: "被别的程序占着", fix_busy: "关掉开着它的程序（比如 Excel、看图），再点一次。",
    err_gone: "文件不见了", fix_gone: "可能刚被挪走了，换个文件夹再看看。",
    err_exists: "名字被占了", fix_exists: "再点一次，贫僧换个名字。",
    err_toolong: "路径太长", fix_toolong: "挪到浅一点的文件夹里再试。",
    err_diskfull: "硬盘满了", fix_diskfull: "腾点地方再点一次。",
    err_oserror: "系统不让动", fix_oserror: "看看是不是只读，或者要管理员权限。",
    err_password: "压缩包有密码", fix_password: "这个得你自己解。",
    err_badarchive: "压缩包坏了", fix_badarchive: "重新下一份再试。",
    err_toobig: "压缩包太大", fix_toobig: "解出来超过 20 GB 或 10 万个文件，贫僧不替你冒险。",
    err_notarchive: "不是压缩包", fix_notarchive: "扩展名骗人，别管它。",
    err_changed: "复制品被改过，没动", err_nothing: "没有能撤销的", err_already: "这批早撤销过了",
    retry: "再试一次",

    /* 盯着 */
    w_title: "盯着", w_scheme: "分法", w_today: "今天分了 {n} 个", w_today0: "盯着呢", w_off: "歇着", w_gone: "文件夹不见了",
    downloads_name: "下载",
    w_add: "再盯一个文件夹", w_add_ph: "粘贴文件夹路径，回车", w_remove: "不盯了",
    w_auto: "开机就在岗", w_auto_s: "关了窗口也在右下角托盘里盯着",
    w_notify: "分完冒个泡", w_notify_s: "窗口收起来的时候",
    w_log: "刚才分的", w_log_empty: "还没新文件进来。下个东西试试。",
    w_undone: "撤销了", w_busy: "被占着，等它松手再分",
    w_inplace: "原地改名",
    w_toast: "{name} → {to}", w_toast_n: "{name} 等 {n} 个 → {to}",

    /* 下载 */
    d_title: "下载", d_ph: "把网址贴这儿。一行一个也行，混在一堆字里也行，贫僧自己抠。",
    d_found: "认出 {n} 个网址", d_found0: "还没认出网址",
    d_folder: "存到", d_naming: "文件名",
    nm_keep: "原名", nm_number: "加序号", nm_custom: "统一叫", nm_custom_ph: "合同",
    d_go: "下载 {n} 个", d_go0: "下载", d_retry: "重试失败的", d_cancel: "停", d_clear: "清掉",
    d_stat: "{done}/{total} 好了", d_failed_n: "，{n} 个失败",
    st_wait: "排队", st_run: "下载中", st_retry: "断了，在接（第 {n} 次）", st_done: "好了", st_failed: "失败", st_cancel: "停了",
    nourl: "没认出网址", d_fix: "网址不对或者网站拒了，点「重试失败的」再来一次。",

    /* 记录 */
    h_title: "记录", h_sub: "每一批都能整批撤销。", h_empty: "还没干过活。",
    k_rename: "改名", k_organize: "分文件夹", k_watch: "自动分",
    h_line: "{n} 个文件", h_undone: "撤销了",

    /* 托盘、通知（Python 读） */
    tray_open: "打开扫地僧", tray_watch_dl: "盯着「下载」", tray_quit: "退出",
    tray_tip_on: "扫地僧 · 盯着「下载」", tray_tip_off: "扫地僧 · 歇着",
    tray_first: "还在右下角盯着「下载」。要退出，右键这把小扫帚。",
    n_title: "扫地僧 · 「{folder}」", n_one: "{name} → {to}", n_many: "{name} 等 {n} 个 → {to}",
  },
};
window.LANG = "zh";
window.t = (k, v) => {
  let s = (STR[LANG] && STR[LANG][k]) ?? STR.zh[k] ?? k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.split("{" + a + "}").join(b);
  return s;
};

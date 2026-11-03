/* 界面上所有给人看的字都在这。加英文：照抄一份 en，改 LANG。 */
window.STR = {
  zh: {
    app: "扫地僧",
    tagline: "文件乱扔，你去玩，贫僧扫",
    nav_rename: "改名", nav_sort: "分文件夹", nav_watch: "盯着", nav_dl: "下载", nav_hist: "记录",
    foot_lab: "千手院 · 扫地僧", foot_mail_pre: "找方丈：", foot_home: "千手院总舵",
    update: "有新版 {v}",

    pick_title: "把文件夹拖进来", pick_sub: "或者点下面，挑一个乱的", pick_btn: "选文件夹",
    pick_paste: "也可以把路径粘贴到这里，回车", recent: "最近", change: "换一个", open_folder: "打开文件夹",
    nofolder: "这个文件夹找不到", drop_here: "松手",

    /* 改名 */
    r_title: "批量改名", r_quick: "一点就加",
    q_number: "加序号", q_replace: "替换文字", q_date: "加日期", q_taken: "按拍摄时间", q_case: "大小写", q_trim: "去多余空格",
    q_insert: "加前后缀", q_remove: "删前后几个字", q_ext: "扩展名", q_music: "音乐标签", q_attr: "文件属性",
    rule_number: "序号", rule_replace: "替换", rule_date: "日期", rule_case: "大小写", rule_trim: "去多余空格",
    rule_insert: "加文字", rule_remove: "删字", rule_ext: "扩展名", rule_tpl: "模板",
    f_find: "找", f_to: "换成", f_regex: "正则", f_matchcase: "分大小写", f_start: "从", f_step: "每次加", f_digits: "位数",
    f_where: "放在", at_start: "前面", at_end: "后面", at_name: "替换整个名字", f_sep: "连接符",
    f_source: "用哪个时间", s_modified: "修改时间", s_created: "创建时间", s_taken: "拍摄时间", s_today: "今天",
    f_fmt: "格式", f_text: "文字", f_first: "删开头", f_last: "删结尾", f_chars: "个字",
    c_lower: "全小写", c_upper: "全大写", c_title: "单词首字母大写", c_sentence: "句首大写",
    e_lower: "改小写", e_upper: "改大写", e_set: "改成",
    rules_empty: "点上面加一条规则，右边马上能看到新名字。",
    opt_scope: "范围", opt_sub: "含子文件夹", opt_ext: "只改这些类型", opt_ext_ph: "如 jpg,png", opt_kw: "名字里有", opt_kw_ph: "关键词",
    opt_sort: "编号顺序", sort_name: "按名字", sort_mtime: "按修改时间", sort_taken: "按拍摄时间",
    preset_save: "存成常用", preset_name_ph: "起个名字", presets: "常用",
    col_old: "现在", col_new: "改成",
    stat: "{total} 个文件 · {changed} 个要改", stat_bump: " · {n} 个撞名，自动加了 (2)", stat_err: " · {n} 个改不了",
    n_bumped: "撞名，自动避让", n_fixed: "有 Windows 不认的字符，换成了全角", n_notaken: "没拍摄时间，用了修改时间", n_notaken_skip: "没拍摄时间，不动",
    f_fallback: "没拍摄时间的用修改时间顶上", stat_notaken: " · {n} 个没拍摄时间，不动",
    n_empty: "名字会变成空的，跳过", n_nometa: "有的信息读不到，留空了", n_badregex: "正则写错了",
    more_rows: "还有 {n} 个没列出来，改名时一起改",
    run_rename: "改名 {n} 个", nothing: "没有要改的",
    done_rename: "改好了 {n} 个", done_failed: "{n} 个没动成", undo: "撤销", undone: "已撤销，{n} 个回到原样",
    undo_skip: "，{n} 个已被挪走或占用，没动",

    /* 分文件夹 */
    s_title: "分文件夹", s_sub: "只动这个文件夹第一层的文件，子文件夹里的不碰",
    scheme_custom: "自己定", scheme_save: "存方案", scheme_del: "删掉方案", scheme_name_ph: "方案名字",
    by_type: "按类型", by_content: "内容里有", by_date: "按日期", by_kw: "名字里有", by_ext: "扩展名是", by_size: "大于",
    to_folder: "放进", rest: "其余的", rest_stay: "留在原地", rest_to: "放进",
    add_rule: "加一条", mb: "MB", only_photo: "只管照片",
    groups: "分成 {n} 堆", stay_n: "{n} 个不动",
    run_sort: "分好 {n} 个文件", run_copy: "复制 {n} 个文件", done_copy: "复制好了 {n} 个",
    act_lbl: "怎么分", act_move: "挪过去", act_copy: "复制一份", act_unzip: "压缩包顺手解压（zip、tar）",
    unz_grp: "解压出来", unz_n: "{n} 个压缩包要解", done_unz: "解了 {n} 个包", w_unz: "解压 ", w_copy: "复制 ", done_sort: "分好了 {n} 个", watch_this: "以后自动分",

    /* 盯着 */
    w_title: "盯着文件夹", w_sub: "新文件一进来，按方案自动分好。开着扫地僧就一直盯。",
    w_add: "盯一个文件夹", w_scheme: "用哪个方案", w_start: "开始盯", w_stop: "不盯了",
    w_running: "盯着呢", w_stopped: "停了", w_count: "已处理 {n} 个", w_empty: "还没盯任何文件夹。下载文件夹是重灾区，建议从它开始。",
    w_log_empty: "还没新文件进来", w_existing: "现在已经在里面的也分一下",
    w_dl_suggest: "盯「下载」文件夹",

    /* 下载 */
    d_title: "批量下载", d_ph: "把网址贴这儿。一行一个也行，混在一堆字里也行，贫僧自己抠。",
    d_found: "认出 {n} 个网址", d_folder: "存到", d_naming: "文件名",
    nm_keep: "用原名", nm_number: "前面加序号", nm_custom: "统一叫",
    nm_custom_ph: "如 合同",
    d_go: "下载 {n} 个", d_go0: "下载", d_retry: "重试失败的", d_cancel: "停", d_clear: "清空列表",
    d_stat: "{done}/{total} 完成", d_failed_n: " · {n} 个失败",
    st_wait: "排队", st_run: "下载中", st_retry: "断了，重连中（第 {n} 次）", st_done: "好了", st_failed: "失败", st_cancel: "停了",
    nourl: "没认出网址",

    /* 记录 */
    h_title: "做过的事", h_sub: "每一批都能整批撤销。", h_empty: "还没干过活。",
    k_rename: "改名", k_organize: "分文件夹", k_watch: "自动分",
    h_line: "{n} 个文件", h_undone: "已撤销",

    /* 错误代号 */
    err_busy: "被别的程序占着", err_password: "压缩包有密码", err_badarchive: "压缩包坏了", err_toobig: "压缩包太大",
    err_changed: "复制品被改过，没动", err_diskfull: "硬盘满了", err_notarchive: "不是压缩包", err_gone: "文件不见了", err_exists: "名字被占了", err_toolong: "路径太长", err_oserror: "系统不让动",
    err_nothing: "没有能撤销的", err_already: "这批早撤销过了",
  },
};
window.LANG = "zh";
window.t = (k, v) => {
  let s = (STR[LANG] && STR[LANG][k]) ?? STR.zh[k] ?? k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.split("{" + a + "}").join(b);
  return s;
};

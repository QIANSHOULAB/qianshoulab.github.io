/* 戒尺僧 0.4.0：给人看的字全在这一个文件里，英文一套、中文一套。
   用的地方：程序界面（app.js）、Python 那边（托盘、冒泡、分出来的文件夹名、示例文件，saodi/text.py 读这个文件）、介绍页 saodi/index.html（i_ 开头那些）。
   默认英文，第二语言中文（Song 11-03 22:19）：程序左下角 EN / 中文 切换，选了记进设置文件（config.json 的 lang），下次打开照旧；
   0.3.x 用过的老用户没选过就接着中文（只有中文那会儿装的，换了语言「下载」里会多出一套英文文件夹）。不跟系统语言自动切。
   英文是照英文用户的习惯重写的，不是翻译（_ops/文案规范.md）。用户的文件名一个字不翻。
   写法：{n} 填数；{n?file|files} 按 n 是不是 1 挑单复数（Python 那边同一套规则）。值只能是一行普通字符串（Python 要读）。
   加一条字，两套都加；bench/strings-0.4.py 会对一遍键、导出 bench/strings-0.4/zh.txt、en.txt。 */
window.STR = {
  en: {
    html_lang: "en",
    app: "Jiechi",
    win_title: "Jiechi · File Sweeper",
    tagline: "File Sweeper",
    nav_rename: "Rename", nav_sort: "Organize", nav_dl: "Download", nav_watch: "Watch", nav_hist: "History",
    side_today: "{n} today",
    foot_mail_pre: "Write to the abbot: ", foot_home: "QIANSHOU LAB",
    lang_label: "Language",
    upd_t: "v{v} is out",
    upd_go: "Get it",

    /* 第一次开头那句话 */
    intro_t: "Downloads: handled.",
    intro_s: "New files get sorted by type as they land. Starts with Windows.",
    intro_pile: "Sort old ones ({n})",
    intro_on: "Watching",
    intro_ok: "Got it",

    /* 选文件夹 */
    pick_title: "Drop a folder here",
    pick_sub_rename: "A thousand files renamed in a blink.",
    pick_sub_sort: "Photos with photos. Docs with docs.",
    pick_btn: "Choose Folder", demo: "Try a sample", recent: "Recent",
    pick_paste: "Or paste a path and press Enter",
    change: "Change", open_folder: "Open",
    nofolder: "Can’t find that folder.", nofolder_fix: "Check the path, or just drag the folder in.",
    drop_here: "Let go",
    loading0: "Looking…",

    /* 改名 */
    r_title: "Rename", r_add: "Add a rule", r_last: "Same as last time", r_clear: "Clear", r_recent: "Recent rules",
    q_number: "Number", q_replace: "Replace", q_date: "Date", q_taken: "Date taken", q_case: "Case", q_trim: "Trim spaces",
    q_insert: "Add text", q_remove: "Cut chars", q_ext: "Extension", q_music: "Artist - Title", q_attr: "Width × Height",
    rule_number: "Number", rule_replace: "Replace", rule_date: "Date", rule_case: "Case", rule_trim: "Trim spaces",
    rule_insert: "Add text", rule_remove: "Cut chars", rule_ext: "Extension", rule_tpl: "Template",
    f_find: "Find", f_to: "With", f_regex: "Regex", f_matchcase: "Match case", f_start: "Start", f_step: "Step", f_digits: "Digits",
    f_where: "Put", at_start: "Before", at_end: "After", at_name: "Instead", f_sep: "Separator",
    f_source: "Use", s_modified: "Modified", s_created: "Created", s_taken: "Date taken", s_today: "Today",
    f_fmt: "Format", f_text: "Text", f_first: "From start", f_last: "From end", f_chars: "chars",
    c_lower: "lowercase", c_upper: "UPPERCASE", c_title: "Title Case", c_sentence: "Sentence case",
    e_lower: "lower", e_upper: "UPPER", e_set: "Change to",
    rule_on: "On", rule_off: "Off", rule_up: "Move up", rule_del: "Remove",
    rules_empty: "Add a rule below. New names show up on the right as you type.",
    opt_title: "Scope", opt_sub: "Include subfolders", opt_ext: "Only these types", opt_ext_ph: "jpg, png", opt_kw: "Name contains", opt_kw_ph: "keyword",
    opt_sort: "Order", sort_name: "Name", sort_mtime: "Modified", sort_taken: "Date taken",
    col_old: "Now", col_new: "Becomes",
    stat: "{total} {total?file|files}, {changed} to rename", stat_bump: ", {n} name {n?clash|clashes}", stat_err: ", {n} can’t be renamed", stat_notaken: ", {n} with no date taken",
    n_bumped: "Taken, added (2)", n_fixed: "Fixed bad characters", n_notaken: "Used modified date", n_notaken_skip: "No date taken",
    f_fallback: "No date taken? Use modified date",
    n_empty: "Blank name, skipped", n_nometa: "Info missing", n_badregex: "Bad regex",
    more_rows: "{n} more not shown. They get renamed too.",
    run_rename: "Rename {n}", nothing: "Nothing to change",
    done_rename: "{n} {n?file|files} renamed", done_failed: "{n} failed", undo: "Undo", undo_n: "Undo {n}", undone: "Undone. {n} {n?file is|files are} back.",
    undo_skip: " Skipped {n}: moved or in use.",
    tpl_music: "{artist} - {title}", tpl_attr: "{name}_{width}x{height}",
    tpl_vars: "name,folder,size,modified,taken,camera,width,height,artist,title,album,track,year,n",
    demo_find: "IMG_", demo_to: "Summer-",

    /* 分文件夹 */
    s_title: "Organize", s_how: "How", s_scheme: "Sort by",
    scheme_custom: "Custom", scheme_custom_d: "Name, content, extension, date, size",
    sd_type: "Each file type to its own folder", sd_month: "By month modified, 2026/2026-10", sd_taken: "Photos by month taken, nothing else",
    act_move: "Move", act_copy: "Copy", act_unzip: "Unpack archives too (zip, tar)",
    s_watch: "Sort new arrivals too", s_watch_on: "Watching. New files sort themselves.",
    by_type: "By type", by_content: "Content has", by_date: "By date", by_kw: "Name has", by_ext: "Extension is", by_size: "Bigger than",
    to_folder: "Into", rest: "The rest", rest_stay: "Stay put", rest_to: "Into",
    add_rule: "Add a rule", mb: "MB",
    ph_kw: "invoice, receipt", ph_content: "contract, invoice", ph_ext: "pdf, docx", ph_folder: "Folder name",
    groups: "{n} {n?folder|folders}", stay_n: "{n} staying put", inplace: "Renamed in place", unz_grp: "Unpacked", unz_n: "{n} {n?archive|archives} to unpack",
    stat_move: "{total} {total?file|files}, {changed} to move", stat_copy: "{total} {total?file|files}, {changed} to copy",
    run_sort: "Sort {n}", run_copy: "Copy {n}",
    done_sort: "{n} sorted", done_copy: "{n} copied", done_unz: "{n} {n?archive|archives} unpacked",
    w_unz: "Unpacked ", w_copy: "Copied ",

    /* 分出来的文件夹名（Python 读）：已经分好的旧文件夹不改名，换了语言以后新来的进新语言的文件夹 */
    t_img: "Images", t_video: "Videos", t_audio: "Audio", t_doc: "Documents", t_sheet: "Spreadsheets",
    t_slides: "Presentations", t_archive: "Archives", t_app: "Installers", t_code: "Code",
    other: "Other", big: "Large files", unz_dir: "Unpacked", dl_file: "file", my_scheme: "My rules",
    p_type: "By type", p_month: "By month", p_taken: "Photos by month taken",
    /* 「用示例试试」造的乱文件（Python 读）：| 隔开 */
    demo_dir: "Jiechi sample-",
    demo_files: "Invoice - Uber  2026-09.pdf|Q3 report FINAL.xlsx|Contract (final) (2).docx|Screenshot 2026-10-01 at 10.21.png|setup.exe|meeting notes .txt|guest list.csv|offsite rehearsal.mp4",
    demo_zip: "stuff.zip", demo_zip_in: "readme.txt",

    /* 出错：一句人话 + 怎么办 */
    fail_head: "{n} failed: ",
    err_busy: "Open in another app", fix_busy: "Close whatever has it open (Excel, a photo viewer), then try again.",
    err_gone: "File’s gone", fix_gone: "Probably just moved. Open the folder again.",
    err_exists: "Name’s taken", fix_exists: "Try again and I’ll pick another name.",
    err_toolong: "Path too long", fix_toolong: "Move it somewhere shallower and try again.",
    err_diskfull: "Disk full", fix_diskfull: "Free up some space and try again.",
    err_oserror: "Windows said no", fix_oserror: "It may be read-only or need admin rights.",
    err_password: "Archive has a password", fix_password: "That one’s yours to open.",
    err_badarchive: "Archive is broken", fix_badarchive: "Download a fresh copy and try again.",
    err_toobig: "Archive too big", fix_toobig: "Over 20 GB or 100,000 files inside. Not risking it.",
    err_notarchive: "Not an archive", fix_notarchive: "The extension lied. Ignore it.",
    err_changed: "Copy was edited, left alone", err_nothing: "Nothing to undo", err_already: "Already undone",
    retry: "Try Again",

    /* 盯着 */
    w_title: "Watch", w_today: "{n} sorted today", w_today0: "On watch", w_off: "Off duty", w_gone: "Folder’s gone",
    downloads_name: "Downloads",
    w_add: "Watch another folder", w_add_ph: "Paste a folder path, press Enter", w_remove: "Stop watching",
    w_auto: "Start with Windows", w_auto_s: "Keeps watching from the tray after you close the window",
    w_notify: "Notify after sorting", w_notify_s: "Only while the window is hidden",
    w_log: "Just sorted", w_log_empty: "Nothing new yet. Download something and watch.",
    w_undone: "Undone", w_busy: "In use. Sorting once it’s free.",
    w_inplace: "Renamed in place",
    w_toast: "{name} → {to}", w_toast_n: "{name} and {more} more → {to}",
    sep_list: ", ", sep_clause: ", ",

    /* 下载 */
    d_title: "Download", d_ph: "Paste links here. One per line, or buried in a wall of text. I’ll dig them out.",
    d_found: "{n} {n?link|links} found", d_found0: "No links yet",
    d_folder: "Save to", d_naming: "Names",
    nm_keep: "Original", nm_number: "Numbered", nm_custom: "All named", nm_custom_ph: "Contract",
    d_go: "Download {n}", d_go0: "Download", d_retry: "Retry failed", d_cancel: "Stop", d_clear: "Clear",
    d_stat: "{done}/{total} done", d_failed_n: ", {n} failed",
    st_wait: "Queued", st_run: "Downloading", st_retry: "Dropped, resuming (try {n})", st_done: "Done", st_failed: "Failed", st_cancel: "Stopped",
    nourl: "No links found", d_fix: "Bad link, or the site said no. “Retry failed” has another go.",

    /* 记录 */
    h_title: "History", h_sub: "Every batch can be undone in one go.", h_empty: "Nothing done yet. Enjoy the calm.",
    k_rename: "Rename", k_organize: "Organize", k_watch: "Auto-sort",
    h_line: "{n} {n?file|files}", h_undone: "Undone",

    /* 托盘、冒泡（Python 读） */
    tray_open: "Open Jiechi", tray_watch_dl: "Watch Downloads", tray_quit: "Quit",
    tray_tip_on: "Jiechi · Watching Downloads", tray_tip_off: "Jiechi · Off duty",
    tray_first: "Still watching Downloads from down here. Right-click the broom to quit.",
    n_title: "Jiechi · {folder}", n_one: "{name} → {to}", n_many: "{name} and {more} more → {to}",

    /* 介绍页 saodi/index.html */
    i_title: "Jiechi · File Sweeper",
    i_desc: "The cure for desktop clutter. Batch-download, rename, and send every file to the folder it belongs in. Free for Windows. Your files never leave your PC.",
    i_home: "QIANSHOU LAB", i_dl: "Download",
    i_tag: "Your files, disciplined.",
    i_lede: "The cure for desktop clutter. Batch-download, rename, and send every file to the folder it belongs in. Order restored, no lecture.",
    i_dl_btn: "Download for Windows",
    i_meta: "{v} · 19 MB · Windows 10 / 11 · Free · No installer",
    i_alt: "Jiechi window: the Rename page, rules on the left, old and new names side by side",
    i_s1: "You download. It files.", i_s1_sub: "Watches Downloads from the first launch. Don’t want that? One switch.",
    i_f1: "Downloads sorts itself", i_f1_p: "New files go to Images, Documents, Spreadsheets. Half-finished downloads, hidden files and Office temp files stay put.",
    i_f2: "On duty from startup", i_f2_p: "Close the window and it keeps watching from the tray. Anything that came in while it was off gets sorted next time.",
    i_f3: "Oops? Undo the batch", i_f3_p: "Every batch is logged. One click puts it all back, and it won’t touch those files again.",
    i_f4: "Rename in a click", i_f4_p: "Numbers, find and replace, dates, date taken, Artist - Title. New names preview live. Your rules are remembered.",
    i_f5: "Sort into folders", i_f5_p: "By type, by month, photos by date taken, or by what’s in the name or the file. Move or copy, and unpack archives on the way.",
    i_f6: "Nothing leaves your PC", i_f6_p: "Everything happens on your machine. Nothing gets uploaded, nothing gets deleted. Worst case, the Recycle Bin.",
    i_s2: "Benchmarked, not boasted", i_s2_sub: "Same nasty test files, head to head with KRename, organize and aria2.",
    i_n1: "0 errors", i_n1_p: "5,042 files and 52 links: name clashes, overlong names, locked files, half-done downloads",
    i_n2: "0.11 s", i_n2_p: "To number 1,000 files, from click to done (KRename: 1.26 s)",
    i_n3: "0.27 s", i_n3_p: "52 links, dropped connections picked up where they left off (aria2: 0.51 s, and it lost one)",
    i_s3: "Three steps",
    i_st1: "Download", i_st1_p: "Hit the button above. You get {exe}.",
    i_st2: "Run it", i_st2_p: "No installer. If Windows objects, click <code>More info</code> → <code>Run anyway</code>.",
    i_st3: "Walk away", i_st3_p: "Downloads is handled. To rename a batch, drag the folder into the window.",
    i_foot: "QIANSHOU LAB · Jiechi", i_foot_home: "QIANSHOU LAB home",
  },

  zh: {
    html_lang: "zh-CN",
    app: "戒尺僧",
    win_title: "戒尺僧",
    tagline: "凡尘乱档，统统归位",
    nav_rename: "改名", nav_sort: "分文件夹", nav_dl: "下载", nav_watch: "盯着", nav_hist: "记录",
    side_today: "今天 {n}",
    foot_mail_pre: "找方丈：", foot_home: "千手院",
    lang_label: "语言",
    upd_t: "v{v} 搞出来了",
    upd_go: "去下载",

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
    loading0: "正在看…",

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
    rules_empty: "从下面挑一条，右边马上出新名字。",
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
    undo_skip: "，{n} 个挪走了或被占着，没动",
    tpl_music: "{歌手} - {标题}", tpl_attr: "{原名}_{宽}x{高}",
    tpl_vars: "原名,文件夹,大小,修改日期,拍摄日期,相机,宽,高,歌手,标题,专辑,音轨,年份,序号",
    demo_find: "IMG_", demo_to: "夏天-",

    /* 分文件夹 */
    s_title: "分文件夹", s_how: "怎么分", s_scheme: "分法",
    scheme_custom: "自己定", scheme_custom_d: "名字、内容、扩展名、日期、大小随便组合",
    sd_type: "图片、文档、表格各进各的", sd_month: "按修改月份，2026/2026-10", sd_taken: "照片按拍摄月份，别的不动",
    act_move: "挪过去", act_copy: "复制一份", act_unzip: "压缩包顺手解开（zip、tar）",
    s_watch: "以后新来的也这么分", s_watch_on: "盯着呢，新来的自动分",
    by_type: "按类型", by_content: "内容里有", by_date: "按日期", by_kw: "名字里有", by_ext: "扩展名是", by_size: "大于",
    to_folder: "放进", rest: "其余的", rest_stay: "留在原地", rest_to: "放进",
    add_rule: "加一条", mb: "MB",
    ph_kw: "发票, invoice", ph_content: "合同, 发票", ph_ext: "pdf, docx", ph_folder: "文件夹名",
    groups: "分成 {n} 堆", stay_n: "{n} 个不动", inplace: "原地改名", unz_grp: "解压出来", unz_n: "{n} 个压缩包要解",
    stat_move: "{total} 个文件，{changed} 个要挪", stat_copy: "{total} 个文件，{changed} 个要复制",
    run_sort: "分好 {n} 个", run_copy: "复制 {n} 个",
    done_sort: "分好了 {n} 个", done_copy: "复制好了 {n} 个", done_unz: "解了 {n} 个包",
    w_unz: "解压 ", w_copy: "复制 ",

    /* 分出来的文件夹名（Python 读） */
    t_img: "图片", t_video: "视频", t_audio: "音频", t_doc: "文档", t_sheet: "表格",
    t_slides: "演示", t_archive: "压缩包", t_app: "安装包", t_code: "代码",
    other: "其他", big: "大文件", unz_dir: "解压", dl_file: "文件", my_scheme: "我的方案",
    p_type: "按类型", p_month: "按月份", p_taken: "照片按拍摄月份",
    /* 「用示例试试」造的乱文件（Python 读）：| 隔开 */
    demo_dir: "戒尺僧示例-",
    demo_files: "发票-滴滴  2026-09.pdf|Q3 报表 final.xlsx|合同（终版）.docx|截图 2026-10-01 10.21.png|setup.exe|会议纪要 .txt|名单.csv|年会 彩排.mp4",
    demo_zip: "资料.zip", demo_zip_in: "说明.txt",

    /* 出错：一句人话 + 怎么办 */
    fail_head: "{n} 个没动成：",
    err_busy: "被别的程序占着", fix_busy: "关掉开着它的程序（比如 Excel、看图），再点一次。",
    err_gone: "文件不见了", fix_gone: "可能刚被挪走了，重新打开这个文件夹看看。",
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
    w_title: "盯着", w_today: "今天分了 {n} 个", w_today0: "盯着呢", w_off: "歇着", w_gone: "文件夹不见了",
    downloads_name: "下载",
    w_add: "再盯一个文件夹", w_add_ph: "粘贴文件夹路径，回车", w_remove: "不盯了",
    w_auto: "开机就在岗", w_auto_s: "关了窗口也在右下角托盘里盯着",
    w_notify: "分完冒个泡", w_notify_s: "窗口收起来的时候",
    w_log: "刚才分的", w_log_empty: "还没新文件进来。下个东西试试。",
    w_undone: "撤销了", w_busy: "被占着，等它松手再分",
    w_inplace: "原地改名",
    w_toast: "{name} → {to}", w_toast_n: "{name} 等 {n} 个 → {to}",
    sep_list: "、", sep_clause: "，",

    /* 下载 */
    d_title: "下载", d_ph: "把网址贴这儿。一行一个也行，混在一堆字里也行，贫僧自己抠。",
    d_found: "认出 {n} 个网址", d_found0: "还没认出网址",
    d_folder: "存到", d_naming: "文件名",
    nm_keep: "原名", nm_number: "加序号", nm_custom: "统一叫", nm_custom_ph: "合同",
    d_go: "下载 {n} 个", d_go0: "下载", d_retry: "重试失败的", d_cancel: "停", d_clear: "清掉",
    d_stat: "{done}/{total} 好了", d_failed_n: "，{n} 个失败",
    st_wait: "排队", st_run: "下载中", st_retry: "断了，在接（第 {n} 次）", st_done: "好了", st_failed: "失败", st_cancel: "停了",
    nourl: "没认出网址", d_fix: "网址不对，或者网站不给下。点「重试失败的」再来一遍。",

    /* 记录 */
    h_title: "记录", h_sub: "每一批都能整批撤销。", h_empty: "还没干过活。",
    k_rename: "改名", k_organize: "分文件夹", k_watch: "自动分",
    h_line: "{n} 个文件", h_undone: "撤销了",

    /* 托盘、冒泡（Python 读） */
    tray_open: "打开戒尺僧", tray_watch_dl: "盯着「下载」", tray_quit: "退出",
    tray_tip_on: "戒尺僧 · 盯着「下载」", tray_tip_off: "戒尺僧 · 歇着",
    tray_first: "还在右下角盯着「下载」。要退出，右键这把小扫帚。",
    n_title: "戒尺僧 · 「{folder}」", n_one: "{name} → {to}", n_many: "{name} 等 {n} 个 → {to}",

    /* 介绍页 saodi/index.html */
    i_title: "戒尺僧 · 凡尘乱档，统统归位",
    i_desc: "专治桌面满天星。批量下载、重命名、丢进该去的文件夹，安排得明明白白。Windows 电脑程序，免费，文件不出你电脑。",
    i_home: "千手院", i_dl: "下载",
    i_tag: "凡尘乱档，统统归位",
    i_lede: "专治桌面满天星。批量下载、重命名、丢进该去的文件夹，安排得明明白白。",
    i_dl_btn: "下载 Windows 版",
    i_meta: "{v} · 19 MB · Windows 10 / 11 · 免费 · 不用装，双击就跑",
    i_alt: "戒尺僧窗口：改名页，左边规则，右边新旧名字对照",
    i_s1: "你下你的，它分它的", i_s1_sub: "第一次打开就盯上「下载」。不想要，一个开关关掉。",
    i_f1: "「下载」自己归位", i_f1_p: "新下的按类型进图片、文档、表格。没下完的、隐藏的、Office 临时文件，一概不碰。",
    i_f2: "开机就在岗", i_f2_p: "关了窗口，它在右下角托盘里接着盯。程序关着那阵下的，下回一开自己补上。",
    i_f3: "手滑？整批撤回", i_f3_p: "每一批都记账，点一下原样回来。撤回来的，贫僧不再碰。",
    i_f4: "改名，一点就有", i_f4_p: "序号、替换、日期、拍摄时间、歌手 - 歌名。右边实时看新名字，改法记住，下回直接用。",
    i_f5: "分文件夹", i_f5_p: "按类型、按月份、照片按拍摄时间，或者名字、内容里有啥。挪过去或复制一份，压缩包顺手解开。",
    i_f6: "文件不出门", i_f6_p: "全在你电脑上过手，不传任何服务器。从不删东西，真要扔也进回收站。",
    i_s2: "比过了才说", i_s2_sub: "同一批刁钻文件，跟 KRename、organize、aria2 实打实比的。",
    i_n1: "0 错", i_n1_p: "5,042 个文件、52 个网址：撞名、超长名、被占着、下到一半",
    i_n2: "0.11 秒", i_n2_p: "1,000 个文件加序号，点下去到改完（KRename 1.26 秒）",
    i_n3: "0.27 秒", i_n3_p: "52 个网址，断了的照样接着下完（aria2 0.51 秒，还丢 1 个）",
    i_s3: "三步上手",
    i_st1: "下载", i_st1_p: "点上面的按钮，拿到 {exe}。",
    i_st2: "双击", i_st2_p: "不用安装。Windows 拦一下就点 <code>更多信息</code> → <code>仍要运行</code>。",
    i_st3: "去玩", i_st3_p: "「下载」它自己盯着。要改名，把文件夹拖进窗口。",
    i_foot: "千手院 · 戒尺僧", i_foot_home: "千手院总舵",
  },
};

/* 当前语言：程序里由 app.js 照设置文件改，介绍页照 localStorage 改；没定之前是英文 */
window.LANG = "en";
window.t = (k, v) => {
  let s = (STR[LANG] && STR[LANG][k]) ?? STR.en[k] ?? k;
  if (v) {
    const num = x => +String(x).replace(/<[^>]*>|[,\s]/g, "");
    s = s.replace(/\{(\w+)\?([^|{}]*)\|([^{}]*)\}/g, (m, a, one, many) => (a in v ? (num(v[a]) === 1 ? one : many) : m));
    for (const [a, b] of Object.entries(v)) s = s.split("{" + a + "}").join(b);
  }
  return s;
};

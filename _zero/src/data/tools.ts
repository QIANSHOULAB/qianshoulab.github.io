// 工具分拣表（Song 11-27：「零肉身造物主页打开里面是千手院，入口和赛博杂货铺就是小工具」；16:49 更正：是杂货铺，不是炸货铺）
// 规矩：叫「X 僧」的罗汉住千手院（/qianshou/）；大白话名字的小工具进赛博杂货铺（/zahuopu/）。
// 每个工具的网址一个都不改，卡片只是指过去。字照搬千手院总舵（qianshou/index.html 的 QS_STRINGS），
// 英寸照妖镜、角度算距离的中文照它们自己页面上的字（gongshi 仓库，铁屑江湖 app 里也是这套）。

export type Home = 'qianshou' | 'zahuopu';
type L = { en: string; zh: string };
export interface Tool {
  slug: string;
  href: string;
  home: Home;
  glyph: string;
  name: L;
  sub: L;
  what: L;
  note: L;
  go?: L;
  /** 货架上那只线框小物种：超级公式两组参数 [m, n1, n2, n3]（r1 经度、r2 纬度） */
  species?: [number[], number[]];
}

const phone: L = { en: '(Runs on your phone)', zh: '（手机打开就能用）' };

export const tools: Tool[] = [
  // —— 千手院：十尊罗汉（办公工具） ——
  { slug: 'luruseng', href: '/luruseng/', home: 'qianshou', glyph: '录',
    name: { en: 'Luru · Photo Typist', zh: '录入僧' }, sub: { en: 'Snap the forms. Skip the typing.', zh: '施主去玩，贫僧填表' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'pabiao', href: '/pabiao/', home: 'qianshou', glyph: '渡',
    name: { en: 'Dubiao · PDF to Excel', zh: '渡表僧' }, sub: { en: 'Drop the PDF. Go play.', zh: '表丢来，你去玩，贫僧超度' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'xibiao', href: '/xibiao/', home: 'qianshou', glyph: '净',
    name: { en: 'Jingtan · Clean Sheet', zh: '净坛僧' }, sub: { en: 'Brings inner peace to messy data.', zh: '烂表千行，一扫而光' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'yijing', href: '/yijing/', home: 'qianshou', glyph: '译',
    name: { en: 'Yijing · Data Mover', zh: '译经僧' }, sub: { en: 'Data migration, minus the suffering.', zh: '凡表皆可转，万物皆可通' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'chaojing', href: '/chaojing/', home: 'qianshou', glyph: '抄',
    name: { en: 'Chaojing · Doc Batcher', zh: '抄经僧' }, sub: { en: 'Leave the copying to the monk.', zh: '名单丢来，贫僧一行抄一份' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'huayuan', href: '/huayuan/', home: 'qianshou', glyph: '化',
    name: { en: 'Huayuan · List Grabber', zh: '化缘僧' }, sub: { en: 'Any web list, straight into Excel.', zh: '过路留名，见网扒皮' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'xunshan', href: '/xunshan/', home: 'qianshou', glyph: '巡',
    name: { en: 'Xunshan · Price Watch', zh: '巡山僧' }, sub: { en: 'Stares at the page so you don’t have to.', zh: '替你盯梢' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'daibi', href: '/daibi/', home: 'qianshou', glyph: '笔',
    name: { en: 'Daibi · Form Filler', zh: '代笔僧' }, sub: { en: 'You sip tea. The monk types.', zh: '施主喝茶，贫僧代笔' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'zhike', href: '/zhike/', home: 'qianshou', glyph: '知',
    name: { en: 'Zhike · Inbox Sorter', zh: '知客僧' }, sub: { en: 'Orders, invoices and tracking numbers file themselves.', zh: '收发室那点活，贫僧包了' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },
  { slug: 'saodi', href: '/saodi/', home: 'qianshou', glyph: '戒',
    name: { en: 'Jiechi · File Sweeper', zh: '戒尺僧' }, sub: { en: 'Your files, disciplined.', zh: '凡尘乱档，统统归位' },
    what: { en: '', zh: '' }, note: { en: '', zh: '' } },

  // —— 赛博杂货铺：大白话名字的小工具 ——
  { slug: 'gongshi', href: '/gongshi/', home: 'zahuopu', glyph: '榨',
    go: { en: 'Squeeze', zh: '请他算账' }, species: [[7, 0.2, 1.7, 1.7], [7, 0.2, 1.7, 1.7]], 
    name: { en: 'Gongshi · Net Hours', zh: '工时榨汁机' },
    sub: { en: 'Squeeze out the breaks. Keep the real hours.', zh: '水分榨干，只剩真工时' },
    what: { en: 'Enter a start and an end time. Tea breaks and meals get squeezed out, and the real hours come out fresh-pressed. Made for the changeover box on your CO sheet.',
            zh: '开始、结束两个时间一填，茶歇饭点自动扣光，真工时当场出汁。专治换型单上那格 CO 时间。' },
    note: phone },
  { slug: 'inch', href: '/gongshi/inch/', home: 'zahuopu', glyph: '镜',
    go: { en: 'Unmask the inches', zh: '去照妖' }, species: [[4, 1, 1, 1], [4, 1, 1, 1]], 
    name: { en: 'Yingcun · Inch Converter', zh: '英寸照妖镜' },
    sub: { en: 'Point it at the sheet. Inches confess in millimeters.', zh: '八分之三算断魂，二五点四乘进坟。\n烂图一拍全干碎，只认毫米弃碑文。' },
    what: { en: 'Snap an inspection sheet. Every inch value gets its millimeter twin, written in red right on the photo.',
            zh: '拍检查表，英寸换毫米，红字写在原图上。' },
    note: phone },
  { slug: 'tp', href: '/gongshi/tp/', home: 'zahuopu', glyph: '角',
    go: { en: 'Do the math', zh: '去算' }, species: [[3, 4.5, 10, 10], [4, 1, 1, 1]], 
    name: { en: 'Jiaodu · Degrees to mm', zh: '角度算距离' },
    sub: { en: 'Off by 0.4°? Sounds harmless. In millimeters, it isn’t.', zh: '报告说只歪了零点几度，听着不多。\n换成毫米，当场露馅。' },
    what: { en: 'Type the radius and the angle off your CMM report. Out comes how far the hole center really moved.',
            zh: '填半径和偏的度数，算孔心挪了几毫米。' },
    note: phone },
  { slug: 'qianye', href: '/qianye/', home: 'zahuopu', glyph: '一',
    go: { en: 'Frame it', zh: '请他装裱' }, species: [[8, 0.5, 0.5, 8], [2, 1, 1, 1]], 
    name: { en: 'one', zh: 'one' },
    sub: { en: 'Messy notes in. Pretty picture out.', zh: '随手成画' },
    what: { en: 'Snap your handwriting or paste some text. It comes back mounted as a handsome image, ready to share and show off.',
            zh: '手写拍照或打字粘贴，自动装裱成一张体面好图，拿去分享倍儿有面子。' },
    note: phone },
  { slug: 'baozuseng', href: '/baozuseng/', home: 'zahuopu', glyph: '算',
    go: { en: 'Split rent', zh: '去算账' }, species: [[4, 12, 15, 15], [4, 12, 15, 15]], 
    name: { en: 'Rent Splitter', zh: '二房东算账' },
    sub: { en: 'Power bill, split to the cent. Drama not included.', zh: '电费掰到分，狮子吼都省了' },
    what: { en: 'Paste the tenant list, enter the power bill. Rent and power split by head and by day, and who owes what is obvious at a glance.',
            zh: '租客名单一贴，电费总数一填，房租电费按人头按天自己摊，谁欠钱一眼看穿。' },
    note: { en: '(Runs on your phone. The books stay there.)', zh: '（手机打开就能用，账只存你手机）' } },
  { slug: 'tiexie', href: '/tiexie/', home: 'zahuopu', glyph: '铁',
    go: { en: 'Read the scrolls', zh: '翻秘籍' }, species: [[12, 0.6, 1.2, 1.2], [12, 0.6, 1.2, 1.2]], 
    name: { en: 'Tiexie · CNC Kung Fu', zh: '铁屑江湖' },
    sub: { en: 'Ancient scrolls. Real G-code.', zh: '刀光剑影，铁屑横飞' },
    what: { en: 'Shop-floor kung fu, starting with probing. Every move battle-tested on a real machine. Made for the new setter frozen in front of the control.',
            zh: '机床边的武功秘籍：从探头找零起，一招一式都在车间实战过。专治新人对着机床发呆。' },
    note: { en: '(Chinese only. Reads fine on your phone)', zh: '（手机打开就能看）' } },
];

export const monks = tools.filter((x) => x.home === 'qianshou');
export const shop = tools.filter((x) => x.home === 'zahuopu');

// 四个真组件页共用的选项（和 ../gen.py 对齐）
export const PROD = [{ value: 'std', label: '标准版' }, { value: 'pro', label: '专业版' }, { value: 'max', label: '旗舰版' }];
export const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '新加坡', '南京', '武汉', '西安'];
export const TAGS = ['新客户', '老客户', '加急', '大客户', '需发票', '海外'];
export async function send(site, body) {
  const r = await fetch('/api/' + site, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  location.href = '/?ok=' + j.id;
}
export const ok = () => { const m = /ok=(\d+)/.exec(location.search); return m ? m[1] : null; };

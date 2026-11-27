// 没有 WebGL 时七幕各一张静态图（场景自己截的：电脑一套 16:10、手机一套竖的）。
// 图由 scripts/genesis-stills.mjs 用 ?act=k&still 定格截出来，放在 src/assets/genesis/。
const land = import.meta.glob<string>('../assets/genesis/still-land-*.jpg', { eager: true, query: '?url', import: 'default' });
const port = import.meta.glob<string>('../assets/genesis/still-port-*.jpg', { eager: true, query: '?url', import: 'default' });
const pick = (m: Record<string, string>) => Object.keys(m).sort().map((k) => m[k]);

const stills = { land: pick(land), port: pick(port) };
export default stills;

// 打包真组件测试页：node build.js → build/<网站>.js / .css（site.js 从这里取）
const esbuild = require('esbuild'), path = require('path');
const pages = ['antd.jsx', 'element.js', 'mui.jsx', 'select2.js', 'shadow.js'];
esbuild.build({
  entryPoints: pages.map(p => path.join(__dirname, 'src', p)),
  outdir: path.join(__dirname, 'build'), bundle: true, minify: true, format: 'iife', target: 'chrome116',
  jsx: 'automatic', loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  logLevel: 'warning'
}).then(() => console.log('build/ 好了：', pages.join(' ')), () => process.exit(1));

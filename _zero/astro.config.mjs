// 零肉身造物（Assetless Genesis）· 构建配置
// 产物照常出到 _zero/dist，再由 scripts/publish.mjs 拷到仓库根目录（只拷它名下那几样，别的一概不碰）。
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://qianshoulab.github.io',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // GitHub Pages 用 Jekyll 发，下划线开头的文件夹（Astro 默认的 _astro）不发：换个名字
    assets: 'zero-assets',
    // 样式直接塞进页面，少一个请求
    inlineStylesheets: 'always',
  },
  integrations: [mdx()],
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false },
  prefetch: false,
});

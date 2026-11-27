// 首页放在哪（只有这一行管这件事）
//
//   false：首页只发到 https://qianshoulab.github.io/zero/ ，根目录 / 照旧是千手院（现在这样）
//   true ：根目录 / 也换成零肉身造物首页（/zero/ 照样能打开；顶栏、页脚里「回首页」的链接一起改成 /）
//
// 换根目录：把下面的 false 改成 true，提交推到 main。工作流 zero.yml 自己构建、自己把首页拷到根目录。
// 换回千手院：改回 false 推上去（链接改回 /zero/），再把根目录恢复成千手院那份：
//   git checkout 8545e2b -- index.html && git commit -m "根目录换回千手院" && git push
// 千手院自己的家 /qianshou/ 不归这里管，换不换都在。
export const HOME_AT_ROOT = false;

export const HOME_PATH = HOME_AT_ROOT ? '/' : '/zero/';

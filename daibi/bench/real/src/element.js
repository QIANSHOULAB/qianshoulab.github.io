// Element Plus：el-select 单选 / 可搜单选 / 多选，el-date-picker（默认可输入，值在组件里）
import { createApp, reactive } from 'vue/dist/vue.esm-bundler.js';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import { PROD, CITIES, TAGS, send, ok } from './data.js';

createApp({
  setup() {
    const f = reactive({ name: '', product: '', city: '', tags: [], due: '' });
    const rules = { name: [{ required: true, message: '请填联系人' }], product: [{ required: true, message: '请选择产品版本' }], city: [{ required: true, message: '请选择城市' }], due: [{ required: true, message: '请选择日期' }] };
    return { f, rules, PROD, CITIES, TAGS, okId: ok() };
  },
  methods: {
    async submit() {
      const valid = await this.$refs.fr.validate().catch(() => false);
      if (!valid) return;
      send('element', { name: this.f.name, product: this.f.product, city: this.f.city, tags: this.f.tags.join(','), due: this.f.due || '' });
    }
  },
  template: `
  <el-alert v-if="okId" type="success" :title="'已保存，编号 ' + okId" :closable="false" style="margin-bottom:16px"/>
  <el-form ref="fr" :model="f" :rules="rules" label-width="96px">
    <el-form-item label="联系人" prop="name"><el-input v-model="f.name"/></el-form-item>
    <el-form-item label="产品版本" prop="product"><el-select v-model="f.product" placeholder="请选择"><el-option v-for="p in PROD" :key="p.value" :label="p.label" :value="p.value"/></el-select></el-form-item>
    <el-form-item label="所在城市" prop="city"><el-select v-model="f.city" filterable placeholder="请选择"><el-option v-for="c in CITIES" :key="c" :label="c" :value="c"/></el-select></el-form-item>
    <el-form-item label="客户标签" prop="tags"><el-select v-model="f.tags" multiple placeholder="可多选"><el-option v-for="c in TAGS" :key="c" :label="c" :value="c"/></el-select></el-form-item>
    <el-form-item label="交付日期" prop="due"><el-date-picker v-model="f.due" type="date" value-format="YYYY-MM-DD" placeholder="选择日期"/></el-form-item>
    <el-form-item><el-button type="primary" @click="submit">提交</el-button></el-form-item>
  </el-form>`
}).use(ElementPlus, { locale: zhCn }).mount('#app');

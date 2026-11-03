// AntD 5：Select 单选 / 可搜单选 / 多选，DatePicker 只读输入框（只能点日历格子）
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, Form, Input, Select, DatePicker, Button, Alert } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { PROD, CITIES, TAGS, send, ok } from './data.js';
dayjs.locale('zh-cn');

function App() {
  const onFinish = v => send('antd', {
    name: v.name || '', product: v.product || '', city: v.city || '',
    tags: (v.tags || []).join(','), due: v.due ? v.due.format('YYYY-MM-DD') : ''
  });
  return (
    <ConfigProvider locale={zhCN}>
      {ok() && <Alert type="success" message={'已保存，编号 ' + ok()} style={{ marginBottom: 16 }} />}
      <Form labelCol={{ span: 5 }} wrapperCol={{ span: 16 }} onFinish={onFinish}>
        <Form.Item label="联系人" name="name" rules={[{ required: true, message: '请填联系人' }]}><Input /></Form.Item>
        <Form.Item label="产品版本" name="product" rules={[{ required: true, message: '请选择产品版本' }]}><Select options={PROD} placeholder="请选择" /></Form.Item>
        <Form.Item label="所在城市" name="city" rules={[{ required: true, message: '请选择城市' }]}><Select showSearch options={CITIES.map(c => ({ value: c, label: c }))} placeholder="请选择" /></Form.Item>
        <Form.Item label="客户标签" name="tags"><Select mode="multiple" options={TAGS.map(c => ({ value: c, label: c }))} placeholder="可多选" /></Form.Item>
        <Form.Item label="交付日期" name="due" rules={[{ required: true, message: '请选择日期' }]}><DatePicker inputReadOnly placeholder="选择日期" style={{ width: '100%' }} /></Form.Item>
        <Form.Item wrapperCol={{ offset: 5 }}><Button type="primary" htmlType="submit">提交</Button></Form.Item>
      </Form>
    </ConfigProvider>
  );
}
createRoot(document.getElementById('app')).render(<App />);

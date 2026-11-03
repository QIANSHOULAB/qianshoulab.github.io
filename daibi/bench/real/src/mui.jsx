// MUI：Select 单选 / 多选（role=combobox 的 div + 弹出菜单），DatePicker（v9 分段输入框，英文，日历点格子）
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TextField, MenuItem, Button, Stack, Alert, FormControl, InputLabel, Select, OutlinedInput } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { PROD, CITIES, TAGS, send, ok } from './data.js';

function App() {
  const [f, setF] = useState({ name: '', product: '', city: '', tags: [], due: null });
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const [err, setErr] = useState('');
  const submit = e => {
    e.preventDefault();
    if (!f.name || !f.product || !f.city || !f.due || !f.due.isValid()) { setErr('请把联系人、产品版本、城市、交付日期填全'); return; }
    send('mui', { name: f.name, product: f.product, city: f.city, tags: f.tags.join(','), due: f.due.format('YYYY-MM-DD') });
  };
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <form onSubmit={submit} noValidate>
        <Stack spacing={2.5} sx={{ maxWidth: 420 }}>
          {ok() && <Alert severity="success">已保存，编号 {ok()}</Alert>}
          {err && <Alert severity="error">{err}</Alert>}
          <TextField label="联系人" name="name" value={f.name} onChange={set('name')} />
          <FormControl><InputLabel id="lp">产品版本</InputLabel>
            <Select labelId="lp" label="产品版本" value={f.product} onChange={set('product')}>{PROD.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</Select></FormControl>
          <FormControl><InputLabel id="lc">所在城市</InputLabel>
            <Select labelId="lc" label="所在城市" value={f.city} onChange={set('city')}>{CITIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>
          <FormControl><InputLabel id="lt">客户标签</InputLabel>
            <Select labelId="lt" multiple value={f.tags} onChange={set('tags')} input={<OutlinedInput label="客户标签" />} renderValue={v => v.join('、')}>{TAGS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>
          <DatePicker label="交付日期" value={f.due} onChange={v => setF(s => ({ ...s, due: v }))} />
          <Button type="submit" variant="contained">提交</Button>
        </Stack>
      </form>
    </LocalizationProvider>
  );
}
createRoot(document.getElementById('app')).render(<App />);

// select2：原生 select 藏起来，外面套 select2 的皮（单选 / 可搜单选 / 多选），普通表单提交
import $ from 'jquery';
import select2 from 'select2';
import 'select2/dist/css/select2.css';
select2($);
$(function () {
  $('#s1').select2({ placeholder: '请选择', width: 280, minimumResultsForSearch: Infinity });
  $('#s2').select2({ placeholder: '请选择', width: 280 });
  $('#s3').select2({ placeholder: '可多选', width: 280 });
  $('#sf').on('submit', function (e) { if (!$('#s1').val() || !$('#s2').val()) { e.preventDefault(); alert('请选择产品版本和城市'); } });
});

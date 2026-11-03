# 和知客僧用户建的规则同样的意思：两家供应商的发票转财务，询价转销售
if address :domain :is "from" ["lotus-supplies.example", "qingshi-tech.example"] {
  redirect "finance@ourco.example";
  stop;
}
if header :contains "subject" ["询价", "报价", "Quotation"] {
  redirect "sales@ourco.example";
}

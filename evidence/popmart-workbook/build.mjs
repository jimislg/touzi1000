import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outPath = "/Users/bytedance/Documents/郎刚的芒格/codex-产出/泡泡玛特上市以来销售数据库-20260830.xlsx";
const wb = Workbook.create();

// Create every worksheet before writing cross-sheet formulas.
for (const name of ["结论总览","地区收入","年度渠道","地区渠道矩阵","线上细分","产品品类","IP收入","门店网络","业绩会补充","来源与校验"]) {
  wb.worksheets.add(name);
}

const COLORS = {
  navy: "#17365D", blue: "#D9EAF7", blue2: "#5B9BD5", green: "#70AD47",
  orange: "#ED7D31", red: "#C00000", gray: "#F2F2F2", grid: "#D9E2F3",
  white: "#FFFFFF", black: "#000000", paleGreen: "#E2F0D9", paleRed: "#FCE4D6",
};

const sources = {
  AR2020: "https://www1.hkexnews.hk/listedco/listconews/sehk/2021/0426/2021042601657.pdf",
  AR2021: "https://www.hkexnews.hk/listedco/listconews/sehk/2022/0427/2022042701431_c.pdf",
  AR2022: "https://prod-out-res.popmart.com/cms/ANNUAL_REPORT_2022_e5c3886181.pdf",
  AR2023: "https://www1.hkexnews.hk/listedco/listconews/sehk/2024/0425/2024042500730.pdf",
  AR2024: "https://www1.hkexnews.hk/listedco/listconews/sehk/2025/0423/2025042300687.pdf",
  AR2025: "https://prod-out-res.popmart.com/cms/ANNUAL_REPORT_2025_bd4e173872.pdf",
  H12026: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0820/2026082000353.pdf",
  IR: "https://www.popmart.com.cn/home/investor",
  CALL2020: "https://xueqiu.com/1863122099/392576964",
  CALL2022: "https://xueqiu.com/1163141813/245940803",
  CALL2023: "https://finance.sina.com.cn/jjxw/2024-03-20/doc-inanyitn0034560.shtml",
  CALL2024: "https://finance.sina.com.cn/stock/hkstock/ggscyd/2025-03-26/doc-ineqyrfp8926289.shtml",
  CALL2025: "https://caifuhao.eastmoney.com/news/20260425080725715185600",
  CALL2026H1: "https://finance.eastmoney.com/a/202608203848013364.html",
};

function title(sheet, text, subtitle, endCol = "H") {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${endCol}1`).merge();
  sheet.getRange("A1").values = [[text]];
  sheet.getRange("A1").format = { fill: COLORS.navy, font: { color: COLORS.white, bold: true, size: 18 }, rowHeight: 30 };
  sheet.getRange(`A2:${endCol}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2").format = { fill: COLORS.blue, font: { color: COLORS.navy, italic: true, size: 10 }, wrapText: true, rowHeight: 30 };
}

function styleTable(sheet, range, headerRow = 1) {
  const r = sheet.getRange(range);
  r.format.borders = { preset: "inside", style: "thin", color: COLORS.grid };
  const startCol = range.match(/^([A-Z]+)/)[1];
  const endCol = range.match(/:([A-Z]+)/)[1];
  sheet.getRange(`${startCol}${headerRow}:${endCol}${headerRow}`).format = {
    fill: COLORS.navy, font: { color: COLORS.white, bold: true }, wrapText: true,
    borders: { preset: "all", style: "thin", color: COLORS.white }, rowHeight: 28,
  };
}

function setWidths(sheet, widths) {
  for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}:${col}`).format.columnWidth = width;
}

// --- Summary ---
const summary = wb.worksheets.getItem("结论总览");
title(summary, "泡泡玛特上市以来销售全景", "数据截止：2026-06-30；金额单位：人民币百万元。正式销售数字以年报/中报为准，业绩会内容仅作解释与管理层指引。", "L");
summary.getRange("A4:B10").values = [
  ["核心指标", "数值"],
  ["2020-2025收入CAGR", null],
  ["2025海外收入占比（PRC外）", null],
  ["2026H1海外收入同比", null],
  ["2026H1海外线下收入同比", null],
  ["2026H1海外线上收入同比", null],
  ["2026H1毛绒收入占比", null],
];
summary.getRange("B5:B10").formulas = [
  ["=('年度渠道'!H10/'年度渠道'!H5)^(1/5)-1"],
  ["=1-'地区收入'!D21/'地区收入'!D25"],
  ["=('地区收入'!D35-'地区收入'!D30)/'地区收入'!D30"],
  ["=('地区渠道矩阵'!C24-'地区渠道矩阵'!C19)/'地区渠道矩阵'!C19"],
  ["=('地区渠道矩阵'!D24-'地区渠道矩阵'!D19)/'地区渠道矩阵'!D19"],
  ["='产品品类'!D21"],
];
styleTable(summary, "A4:B10", 4);
summary.getRange("B5:B10").format.numberFormat = "0.0%";
summary.getRange("D4:L4").merge();
summary.getRange("D4").values = [["关键判断"]];
summary.getRange("D4:L4").format = { fill: COLORS.navy, font: { color: COLORS.white, bold: true } };
summary.getRange("D5:L10").merge(true);
summary.getRange("D5:D10").values = [
  ["1. 2020-2025是超常扩张期，但2026H1已从全球共振切换为“中国增长、海外调整”。"],
  ["2. 海外并非需求全面消失：2026H1三大海外区域线下仍增长，但线上流量红利同步回落。"],
  ["3. 门店人头攒动是正面证据，但海外期末门店数增长明显快于门店收入，不能等同于成熟店同店增长。"],
  ["4. 产品增长从手办迁移到毛绒：2026H1毛绒占57.2%，手办收入仅增0.3%，增长集中度上升。"],
  ["5. IP接力正在发生：THE MONSTERS回落，Twinkle Twinkle接棒；这证明平台能力，也同时证明爆款迁移风险。"],
  ["6. 最应跟踪：分地区成熟店同店、线上获客效率、毛绒占比、前三IP集中度和库存周转。"],
];
summary.getRange("D5:L10").format = { wrapText: true, rowHeight: 34, fill: COLORS.gray, font: { size: 10 } };
summary.getRange("A13:G20").values = [
  ["年度", "收入", "同比", "PRC/中国占比", "海外占比", "毛绒占比", "备注"],
  [2020, 2513.471, null, null, null, null, "上市当年；地区披露不足"],
  [2021, 4490.651, null, 4306.936/4490.651, 183.715/4490.651, null, "旧口径：中国大陆/港澳台及海外"],
  [2022, 4617.324, null, 4163.386/4617.324, 453.938/4617.324, null, "旧口径"],
  [2023, 6301.002, null, 5234.901/6301.002, 1066.101/6301.002, 203.888/6301.002, "首次披露产品品类"],
  [2024, 13037.749, null, 8886.483/13037.749, 1-8886.483/13037.749, 2832.078/13037.749, "按2025年报重分类PRC口径"],
  [2025, 37120.052, null, 20851.717/37120.052, 1-20851.717/37120.052, 18708.074/37120.052, "全球爆发年"],
  ["2026H1", 17172.921, 0.238, 12200.509/17172.921, 1-12200.509/17172.921, 9824.944/17172.921, "海外收入同比-11.1%"],
];
summary.getRange("C15:C19").formulas = [["=B15/B14-1"],["=B16/B15-1"],["=B17/B16-1"],["=B18/B17-1"],["=B19/B18-1"]];
styleTable(summary, "A13:G20", 13);
summary.getRange("B14:B20").format.numberFormat = "#,##0.0";
summary.getRange("C14:F20").format.numberFormat = "0.0%";
setWidths(summary, {A:28,B:14,C:12,D:16,E:14,F:14,G:34,L:14});
summary.freezePanes.freezeRows(2);
summary.charts.add("line", {
  title: "收入从25亿增至371亿（人民币百万元）",
  categories: ["2020","2021","2022","2023","2024","2025"],
  series: [{name:"收入",values:[2513.471,4490.651,4617.324,6301.002,13037.749,37120.052],color:COLORS.blue2}],
  hasLegend: false,
  from: {row:22,col:0}, extent: {widthPx:620,heightPx:300},
  yAxis: {numberFormatCode:"#,##0"},
});
summary.charts.add("bar", {
  title: "产品收入结构占比（%）",
  categories: ["2023","2024","2025","2026H1"],
  series: [
    {name:"毛绒",values:[3.24,21.72,50.40,57.21],color:COLORS.orange},
    {name:"手办",values:[76.08,53.20,32.39,30.24],color:COLORS.blue2},
    {name:"其他",values:[20.68,25.08,17.21,12.55],color:COLORS.green},
  ],
  hasLegend:true, legend:{position:"bottom"},
  barOptions:{direction:"column",grouping:"stacked"},
  from:{row:22,col:6},extent:{widthPx:620,heightPx:300},
  yAxis:{numberFormatCode:"0",minimumScale:0,maximumScale:100},
});

// --- Region revenue ---
const region = wb.worksheets.getItem("地区收入");
title(region, "地区收入（长表）", "同一年可能出现两套口径；“旧口径”和“新口径”不可横向相加。2025年起PRC含中国大陆及港澳台。", "H");
const regionRows = [
  ["期间","披露口径","地区","收入","占总收入","同比","来源ID","备注"],
  [2021,"旧口径","中国大陆",4306.936,4306.936/4490.651,null,"AR2022","2022年报重列2021比较数"],
  [2021,"旧口径","港澳台及海外",183.715,183.715/4490.651,null,"AR2022","合并口径"],
  [2022,"旧口径","中国大陆",4163.386,4163.386/4617.324,-0.0333,"AR2022",""],
  [2022,"旧口径","港澳台及海外",453.938,453.938/4617.324,1.4703,"AR2022",""],
  [2023,"旧口径","中国大陆",5234.901,5234.901/6301.002,0.2574,"AR2023",""],
  [2023,"旧口径","港澳台及海外",1066.101,1066.101/6301.002,1.3486,"AR2023",""],
  [2024,"旧口径","中国大陆",7972.074,7972.074/13037.749,0.5229,"AR2024",""],
  [2024,"旧口径","港澳台及海外",5065.675,5065.675/13037.749,3.7520,"AR2024",""],
  [2024,"旧口径细分","东南亚",2402.732,2402.732/13037.749,6.191,"AR2024","港澳台及海外的细分"],
  [2024,"旧口径细分","东亚及港澳台",1385.666,1385.666/13037.749,1.846,"AR2024",""],
  [2024,"旧口径细分","北美",723.025,723.025/13037.749,5.569,"AR2024",""],
  [2024,"旧口径细分","欧澳及其他",554.252,554.252/13037.749,3.107,"AR2024",""],
  [2024,"新口径重列","PRC",8886.483,8886.483/13037.749,null,"AR2025","含中国大陆及港澳台"],
  [2024,"新口径重列","亚太",3109.700,3109.700/13037.749,null,"AR2025","不含PRC"],
  [2024,"新口径重列","美洲",802.219,802.219/13037.749,null,"AR2025",""],
  [2024,"新口径重列","欧洲及其他",239.347,239.347/13037.749,null,"AR2025","与旧口径欧澳及其他不可直接比较"],
  [2025,"新口径","PRC",20851.717,20851.717/37120.052,1.346,"AR2025",""],
  [2025,"新口径","亚太",8011.027,8011.027/37120.052,1.576,"AR2025",""],
  [2025,"新口径","美洲",6806.189,6806.189/37120.052,7.484,"AR2025",""],
  [2025,"新口径","欧洲及其他",1451.119,1451.119/37120.052,5.063,"AR2025",""],
  [2025,"新口径","合计",37120.052,1,1.847,"AR2025",""],
  ["2025H1","新口径","PRC",8282.812,8282.812/13876.276,null,"H12026","2026中报比较数"],
  ["2025H1","新口径","亚太",2850.902,2850.902/13876.276,null,"H12026",""],
  ["2025H1","新口径","美洲",2264.882,2264.882/13876.276,null,"H12026",""],
  ["2025H1","新口径","欧洲及其他",477.680,477.680/13876.276,null,"H12026",""],
  ["2025H1","新口径","海外合计",5593.464,5593.464/13876.276,null,"H12026",""],
  ["2026H1","新口径","PRC",12200.509,12200.509/17172.921,0.473,"H12026",""],
  ["2026H1","新口径","亚太",2575.045,2575.045/17172.921,-0.097,"H12026",""],
  ["2026H1","新口径","美洲",1891.637,1891.637/17172.921,-0.165,"H12026",""],
  ["2026H1","新口径","欧洲及其他",505.730,505.730/17172.921,0.059,"H12026",""],
  ["2026H1","新口径","海外合计",4972.412,4972.412/17172.921,-0.111,"H12026","计算值"],
];
region.getRange(`A4:H${3+regionRows.length}`).values = regionRows;
styleTable(region, `A4:H${3+regionRows.length}`, 4);
region.getRange(`D5:D${3+regionRows.length}`).format.numberFormat = "#,##0.0";
region.getRange(`E5:F${3+regionRows.length}`).format.numberFormat = "0.0%";
setWidths(region,{A:12,B:16,C:18,D:14,E:14,F:12,G:12,H:38});
region.freezePanes.freezeRows(4);

// --- Annual channel ---
const channel = wb.worksheets.getItem("年度渠道");
title(channel,"年度渠道结构","2021和2024采用后一年度报告中的最新重分类比较数；收入单位：人民币百万元。", "K");
channel.getRange("A4:K10").values = [
  ["年度","零售店","机器人商店","线下合计","线上","批发及其他","其他/差额","总收入","线下占比","线上占比","来源ID"],
  [2020,1002.054,328.679,null,951.875,230.863,0,2513.471,null,null,"AR2020"],
  [2021,1673.386,469.803,null,1902.645,444.817,0,4490.651,null,null,"AR2022"],
  [2022,1826.671,394.039,null,1920.033,476.581,0,4617.324,null,null,"AR2022"],
  [2023,3062.152,605.950,null,1866.274,766.626,0,6301.002,null,null,"AR2023"],
  [2024,6766.861,831.363,null,4163.082,1276.443,0,13037.749,null,null,"AR2025"],
  [2025,17254.326,1689.446,null,16433.829,1742.451,0,37120.052,null,null,"AR2025"],
];
channel.getRange("D5:D10").formulas = [["=SUM(B5:C5)"],["=SUM(B6:C6)"],["=SUM(B7:C7)"],["=SUM(B8:C8)"],["=SUM(B9:C9)"],["=SUM(B10:C10)"]];
channel.getRange("I5:I10").formulas = [["=D5/H5"],["=D6/H6"],["=D7/H7"],["=D8/H8"],["=D9/H9"],["=D10/H10"]];
channel.getRange("J5:J10").formulas = [["=E5/H5"],["=E6/H6"],["=E7/H7"],["=E8/H8"],["=E9/H9"],["=E10/H10"]];
styleTable(channel,"A4:K10",4);
channel.getRange("B5:H10").format.numberFormat = "#,##0.0";
channel.getRange("I5:J10").format.numberFormat = "0.0%";
channel.getRange("A13:H16").values = [
  ["期间","零售店","机器人商店","线下合计","线上","批发及其他","总收入","来源ID"],
  ["2025H1",6908.010,820.741,null,5497.997,649.528,13876.276,"H12026"],
  ["2026H1",9111.986,950.526,null,6212.072,898.337,17172.921,"H12026"],
  ["说明",null,null,null,null,null,null,"2025H1完整地区渠道拆分见‘地区渠道矩阵’，本行不用于计算"],
];
channel.getRange("D14").formulas = [["=SUM(B14:C14)"]];
channel.getRange("D15").formulas = [["=SUM(B15:C15)"]];
styleTable(channel,"A13:H16",13);
channel.getRange("B14:G16").format.numberFormat = "#,##0.0";
setWidths(channel,{A:12,B:14,C:14,D:14,E:14,F:16,G:14,H:14,I:14,J:14,K:12});
channel.freezePanes.freezeRows(4);

// --- Region/channel matrix ---
const matrix = wb.worksheets.getItem("地区渠道矩阵");
title(matrix,"地区 × 渠道矩阵","用于判断增长来自线上流量还是线下门店。2024/2025为全年，2025H1/2026H1为半年。", "H");
const matrixRows = [
  ["期间","地区","线下","线上","批发及其他","总收入","线下同比","线上同比"],
  [2024,"PRC",5351.613,2771.950,762.920,8886.483,null,null],
  [2024,"亚太",1707.736,971.631,430.333,3109.700,null,null],
  [2024,"美洲",379.581,364.345,58.293,802.219,null,null],
  [2024,"欧洲及其他",159.294,55.156,24.897,239.347,null,null],
  [2024,"海外合计",2246.611,1391.132,513.523,4151.266,null,null],
  [2025,"PRC",11421.362,8522.321,908.034,20851.717,1.134,2.074],
  [2025,"亚太",4414.062,3052.963,544.002,8011.027,1.585,2.142],
  [2025,"美洲",2235.529,4353.581,217.079,6806.189,4.889,10.949],
  [2025,"欧洲及其他",872.819,504.964,73.336,1451.119,4.479,8.155],
  [2025,"海外合计",7522.410,7911.508,834.417,16268.335,2.349,4.687],
  ["2025H1","PRC",5084.246,2937.255,261.311,8282.812,null,null],
  ["2025H1","亚太",1525.588,1069.214,256.100,2850.902,null,null],
  ["2025H1","美洲",842.390,1326.565,95.927,2264.882,null,null],
  ["2025H1","欧洲及其他",276.527,164.963,36.190,477.680,null,null],
  ["2025H1","海外合计",2644.505,2560.742,388.217,5593.464,null,null],
  ["2026H1","PRC",6868.639,4778.746,553.124,12200.509,0.351,0.627],
  ["2026H1","亚太",1772.694,643.551,158.800,2575.045,0.162,-0.398],
  ["2026H1","美洲",1007.007,722.144,162.486,1891.637,0.195,-0.456],
  ["2026H1","欧洲及其他",414.172,67.631,23.927,505.730,0.498,-0.590],
  ["2026H1","海外合计",3193.873,1433.326,345.213,4972.412,0.208,-0.440],
];
matrix.getRange(`A4:H${3+matrixRows.length}`).values = matrixRows;
styleTable(matrix,`A4:H${3+matrixRows.length}`,4);
matrix.getRange(`C5:F${3+matrixRows.length}`).format.numberFormat = "#,##0.0";
matrix.getRange(`G5:H${3+matrixRows.length}`).format.numberFormat = "0.0%";
setWidths(matrix,{A:12,B:18,C:14,D:14,E:16,F:14,G:14,H:14});
matrix.freezePanes.freezeRows(4);

// --- Online subchannels ---
const online = wb.worksheets.getItem("线上细分");
title(online,"线上渠道细分","平台名称和地区口径随年份变化；未单独披露的平台保留在“其他”。收入单位：人民币百万元。", "H");
const onlineRows = [
  ["期间","地区","平台","收入","占该地区线上","同比","来源ID","备注"],
  [2020,"中国大陆","抽盒机",466.364,466.364/951.875,null,"AR2021","2021年报比较数"],
  [2020,"中国大陆","天猫",406.110,406.110/951.875,null,"AR2021",""],
  [2020,"中国大陆","京东",36.173,36.173/951.875,null,"AR2021",""],
  [2020,"中国大陆","其他",43.228,43.228/951.875,null,"AR2021",""],
  [2021,"中国大陆","抽盒机",921.469,921.469/1861.483,0.976,"AR2022","重分类比较数"],
  [2021,"中国大陆","天猫",598.865,598.865/1861.483,0.475,"AR2022",""],
  [2021,"中国大陆","京东",143.229,143.229/1861.483,2.960,"AR2022",""],
  [2021,"中国大陆","其他",197.920,197.920/1861.483,3.578,"AR2022",""],
  [2021,"港澳台及海外","官方站/Shopify",15.167,15.167/41.162,null,"AR2022",""],
  [2021,"港澳台及海外","Amazon",8.959,8.959/41.162,null,"AR2022",""],
  [2021,"港澳台及海外","其他",17.036,17.036/41.162,null,"AR2022",""],
  [2022,"中国大陆","抽盒机",954.678,954.678/1829.809,0.036,"AR2022",""],
  [2022,"中国大陆","天猫",462.394,462.394/1829.809,-0.228,"AR2022",""],
  [2022,"中国大陆","京东",137.885,137.885/1829.809,-0.037,"AR2022",""],
  [2022,"中国大陆","其他",274.852,274.852/1829.809,0.389,"AR2022",""],
  [2022,"港澳台及海外","官方站/Shopify",27.061,27.061/90.224,0.784,"AR2022",""],
  [2022,"港澳台及海外","Amazon",23.643,23.643/90.224,1.639,"AR2022",""],
  [2022,"港澳台及海外","其他",39.520,39.520/90.224,1.320,"AR2022",""],
  [2023,"中国大陆","抽盒机",729.280,729.280/1710.469,-0.236,"AR2023",""],
  [2023,"中国大陆","天猫",321.966,321.966/1710.469,-0.304,"AR2023",""],
  [2023,"中国大陆","抖音",283.318,283.318/1710.469,4.312,"AR2023",""],
  [2023,"中国大陆","其他",375.905,375.905/1710.469,0.046,"AR2023",""],
  [2023,"港澳台及海外","官方站",39.479,39.479/155.805,0.459,"AR2024",""],
  [2023,"港澳台及海外","Shopee",42.885,42.885/155.805,0.703,"AR2024",""],
  [2023,"港澳台及海外","TikTok",4.455,4.455/155.805,null,"AR2024",""],
  [2023,"港澳台及海外","其他",68.986,68.986/155.805,null,"AR2024",""],
  [2024,"中国大陆","抽盒机",1113.741,1113.741/2697.619,0.527,"AR2024",""],
  [2024,"中国大陆","天猫",627.788,627.788/2697.619,0.950,"AR2024",""],
  [2024,"中国大陆","抖音",601.231,601.231/2697.619,1.122,"AR2024",""],
  [2024,"中国大陆","其他",354.859,354.859/2697.619,0.868,"AR2024",""],
  [2024,"港澳台及海外","官方站",531.460,531.460/1455.162,12.462,"AR2024",""],
  [2024,"港澳台及海外","Shopee",324.197,324.197/1455.162,6.560,"AR2024",""],
  [2024,"港澳台及海外","TikTok",261.943,261.943/1455.162,57.798,"AR2024",""],
  [2024,"港澳台及海外","其他",337.562,337.562/1455.162,3.893,"AR2024",""],
  [2025,"PRC","抽盒机",3423.456,3423.456/8522.321,2.074,"AR2025",""],
  [2025,"PRC","天猫",1785.332,1785.332/8522.321,1.844,"AR2025",""],
  [2025,"PRC","抖音",1589.842,1589.842/8522.321,1.644,"AR2025",""],
  [2025,"PRC","其他",1723.691,1723.691/8522.321,3.016,"AR2025",""],
  [2025,"亚太","自研APP及官方站",1458.282,1458.282/3052.963,2.786,"AR2025",""],
  [2025,"亚太","Shopee",568.675,568.675/3052.963,0.999,"AR2025",""],
  [2025,"亚太","其他",1026.006,1026.006/3052.963,1.683,"AR2025",""],
  [2025,"美洲","自研APP及官方站",2870.016,2870.016/4353.581,13.954,"AR2025",""],
  [2025,"美洲","TikTok",1039.919,1039.919/4353.581,8.659,"AR2025",""],
  [2025,"美洲","其他",443.646,443.646/4353.581,5.851,"AR2025",""],
  [2025,"欧洲及其他","自研APP及官方站",315.571,315.571/504.964,14.142,"AR2025",""],
  [2025,"欧洲及其他","其他",189.393,189.393/504.964,4.519,"AR2025",""],
  ["2026H1","PRC","抽盒机",2062.871,2062.871/4778.746,0.833,"H12026",""],
  ["2026H1","PRC","抖音",976.376,976.376/4778.746,0.740,"H12026",""],
  ["2026H1","PRC","天猫",901.303,901.303/4778.746,0.371,"H12026",""],
  ["2026H1","PRC","其他",838.196,838.196/4778.746,0.413,"H12026",""],
  ["2026H1","亚太","自研APP及官方站",338.397,338.397/643.551,0.081,"H12026",""],
  ["2026H1","亚太","Shopee",106.528,106.528/643.551,-0.621,"H12026",""],
  ["2026H1","亚太","其他",198.626,198.626/643.551,-0.582,"H12026",""],
  ["2026H1","美洲","自研APP及官方站",491.235,491.235/722.144,-0.446,"H12026",""],
  ["2026H1","美洲","Amazon",168.318,168.318/722.144,0.346,"H12026",""],
  ["2026H1","美洲","其他",62.591,62.591/722.144,-0.801,"H12026",""],
  ["2026H1","欧洲及其他","自研APP及官方站",52.991,52.991/67.631,-0.374,"H12026",""],
  ["2026H1","欧洲及其他","其他",14.640,14.640/67.631,-0.818,"H12026",""],
];
online.getRange(`A4:H${3+onlineRows.length}`).values = onlineRows;
styleTable(online,`A4:H${3+onlineRows.length}`,4);
online.getRange(`D5:D${3+onlineRows.length}`).format.numberFormat = "#,##0.0";
online.getRange(`E5:F${3+onlineRows.length}`).format.numberFormat = "0.0%";
setWidths(online,{A:12,B:18,C:20,D:14,E:16,F:12,G:12,H:28});
online.freezePanes.freezeRows(4);

// --- Product categories ---
const product = wb.worksheets.getItem("产品品类");
title(product,"产品品类收入","公司自2023年起披露统一产品品类；2026H1不再单列MEGA，归入其他IP相关产品。", "G");
const productRows = [
  ["期间","品类","收入","占比","同比","来源ID","备注"],
  [2023,"手办",4793.872,4793.872/6301.002,null,"AR2024","2024年报比较数"],
  [2023,"毛绒",203.888,203.888/6301.002,null,"AR2024",""],
  [2023,"MEGA",684.275,684.275/6301.002,null,"AR2024",""],
  [2023,"衍生品及其他",618.967,618.967/6301.002,null,"AR2024",""],
  [2024,"手办",6936.087,6936.087/13037.749,0.447,"AR2024",""],
  [2024,"毛绒",2832.078,2832.078/13037.749,12.890,"AR2024",""],
  [2024,"MEGA",1683.780,1683.780/13037.749,1.461,"AR2024",""],
  [2024,"衍生品及其他",1585.804,1585.804/13037.749,1.562,"AR2024",""],
  [2025,"手办",12022.569,12022.569/37120.052,0.733,"AR2025",""],
  [2025,"毛绒",18708.074,18708.074/37120.052,5.606,"AR2025",""],
  [2025,"MEGA",1916.082,1916.082/37120.052,0.138,"AR2025",""],
  [2025,"衍生品及其他",4473.327,4473.327/37120.052,1.821,"AR2025",""],
  ["2025H1","手办",5175.875,5175.875/13876.276,null,"H12026","2026中报比较数"],
  ["2025H1","毛绒",6139.236,6139.236/13876.276,null,"H12026",""],
  ["2025H1","其他IP相关产品及其他",2561.165,2561.165/13876.276,null,"H12026","含MEGA"],
  ["2026H1","手办",5192.493,5192.493/17172.921,0.003,"H12026",""],
  ["2026H1","毛绒",9824.944,9824.944/17172.921,0.600,"H12026",""],
  ["2026H1","其他IP相关产品及其他",2155.484,2155.484/17172.921,-0.158,"H12026","含MEGA"],
];
product.getRange(`A4:G${3+productRows.length}`).values = productRows;
styleTable(product,`A4:G${3+productRows.length}`,4);
product.getRange(`C5:C${3+productRows.length}`).format.numberFormat = "#,##0.0";
product.getRange(`D5:E${3+productRows.length}`).format.numberFormat = "0.0%";
setWidths(product,{A:12,B:24,C:14,D:12,E:12,F:12,G:30});
product.freezePanes.freezeRows(4);

// --- IP revenue ---
const ip = wb.worksheets.getItem("IP收入");
title(ip,"IP收入（公司披露的具名IP）","分类方法于2023年变化：此前的自有IP+独家IP合并为艺术家IP。表中仅列公司具名披露项，不代表全部IP。", "H");
const ipRows = [
  ["期间","IP","收入","占总收入","同比","分类口径","来源ID","备注"],
  [2020,"MOLLY",356.918,0.142,-0.217,"自有IP","AR2020",""],
  [2020,"DIMOO",315.248,0.125,2.150,"自有IP","AR2020",""],
  [2020,"THE MONSTERS",204.828,0.081,0.899,"独家IP","AR2020",""],
  [2020,"PUCKY",300.009,0.119,-0.049,"独家IP","AR2020",""],
  [2020,"SKULLPANDA",39.065,0.016,null,"自有IP","AR2020","新IP"],
  [2021,"MOLLY",705.098,0.157,0.975,"自有IP","AR2021",""],
  [2021,"SKULLPANDA",595.256,0.133,14.234,"自有IP","AR2021",""],
  [2021,"DIMOO",566.735,0.126,0.798,"自有IP","AR2021",""],
  [2021,"THE MONSTERS",304.431,0.068,0.486,"独家IP","AR2021",""],
  [2021,"PUCKY",182.245,0.041,-0.393,"独家IP","AR2021",""],
  [2022,"SKULLPANDA",851.611,0.184,0.431,"自有IP","AR2022",""],
  [2022,"MOLLY",802.155,0.174,0.138,"自有IP","AR2022",""],
  [2022,"DIMOO",577.948,0.125,0.020,"自有IP","AR2022",""],
  [2022,"THE MONSTERS",263.002,0.057,-0.136,"独家IP","AR2022",""],
  [2022,"HIRONO",140.768,0.031,1.694,"自有IP","AR2022",""],
  [2023,"SKULLPANDA",1024.788,0.163,0.203,"艺术家IP","AR2023",""],
  [2023,"MOLLY",1020.305,0.162,0.272,"艺术家IP","AR2023",""],
  [2023,"DIMOO",737.666,0.117,0.276,"艺术家IP","AR2023",""],
  [2023,"THE MONSTERS",367.871,0.058,0.399,"艺术家IP","AR2023",""],
  [2023,"HIRONO",351.201,0.056,1.495,"艺术家IP","AR2023",""],
  [2023,"CRYBABY",71.149,0.011,null,"艺术家IP","AR2024","比较数"],
  [2024,"THE MONSTERS",3040.664,0.233,7.266,"艺术家IP","AR2024",""],
  [2024,"MOLLY",2093.172,0.161,1.052,"艺术家IP","AR2024",""],
  [2024,"SKULLPANDA",1308.262,0.100,0.277,"艺术家IP","AR2024",""],
  [2024,"CRYBABY",1164.885,0.089,15.372,"艺术家IP","AR2024",""],
  [2024,"DIMOO",909.561,0.070,0.233,"艺术家IP","AR2024",""],
  [2024,"HIRONO",726.525,0.056,1.069,"艺术家IP","AR2024",""],
  [2024,"Twinkle Twinkle",120.788,0.009,null,"艺术家IP","AR2025","2025年报比较数"],
  [2025,"THE MONSTERS",14161.064,0.381,3.657,"艺术家IP","AR2025",""],
  [2025,"SKULLPANDA",3539.542,0.095,1.705,"艺术家IP","AR2025",""],
  [2025,"CRYBABY",2929.006,0.079,1.514,"艺术家IP","AR2025",""],
  [2025,"MOLLY",2897.084,0.078,0.384,"艺术家IP","AR2025",""],
  [2025,"DIMOO",2776.695,0.075,2.053,"艺术家IP","AR2025",""],
  [2025,"Twinkle Twinkle",2055.580,0.055,16.018,"艺术家IP","AR2025",""],
  [2025,"HIRONO",1735.235,0.047,1.388,"艺术家IP","AR2025",""],
  ["2025H1","THE MONSTERS",4814.017,0.347,null,"艺术家IP","H12026",""],
  ["2025H1","Twinkle Twinkle",389.363,0.028,null,"艺术家IP","H12026",""],
  ["2025H1","MOLLY",1357.248,0.098,null,"艺术家IP","H12026",""],
  ["2025H1","SKULLPANDA",1220.504,0.088,null,"艺术家IP","H12026",""],
  ["2025H1","CRYBABY",1218.170,0.088,null,"艺术家IP","H12026",""],
  ["2025H1","DIMOO",1105.135,0.080,null,"艺术家IP","H12026",""],
  ["2026H1","THE MONSTERS",4454.361,0.260,-0.075,"艺术家IP","H12026",""],
  ["2026H1","Twinkle Twinkle",2649.969,0.154,5.806,"艺术家IP","H12026",""],
  ["2026H1","CRYBABY",1632.570,0.095,0.340,"艺术家IP","H12026",""],
  ["2026H1","DIMOO",1619.217,0.094,0.465,"艺术家IP","H12026",""],
  ["2026H1","SKULLPANDA",1551.211,0.090,0.271,"艺术家IP","H12026",""],
  ["2026H1","HIRONO",1008.855,0.059,0.385,"艺术家IP","H12026",""],
  ["2026H1","MOLLY",900.631,0.053,-0.336,"艺术家IP","H12026",""],
];
ip.getRange(`A4:H${3+ipRows.length}`).values = ipRows;
styleTable(ip,`A4:H${3+ipRows.length}`,4);
ip.getRange(`C5:C${3+ipRows.length}`).format.numberFormat = "#,##0.0";
ip.getRange(`D5:E${3+ipRows.length}`).format.numberFormat = "0.0%";
setWidths(ip,{A:12,B:22,C:14,D:14,E:12,F:16,G:12,H:26});
ip.freezePanes.freezeRows(4);

// --- Store footprint and rough productivity ---
const stores = wb.worksheets.getItem("门店网络");
title(stores,"门店网络与粗略店效","“收入/期末门店数”仅为扩张期粗略代理，不是同店销售；新店开业时间会显著影响该指标。", "J");
const storeRows = [
  ["期间","地区","零售店数","零售店收入","收入/期末店数","店数同比","零售收入同比","粗略店效同比","机器人商店数","来源ID"],
  [2020,"中国大陆",187,1002.054,null,null,null,null,1351,"AR2020"],
  [2021,"中国大陆",288,1670.174,null,0.540,0.667,null,1861,"AR2022"],
  [2021,"港澳台及海外",7,3.212,null,null,null,null,9,"AR2022"],
  [2022,"中国大陆",329,1691.112,null,0.142,0.013,null,2067,"AR2022"],
  [2022,"港澳台及海外",28,135.559,null,3.000,41.204,null,49,"AR2022"],
  [2023,"中国大陆",363,2479.243,null,0.103,0.466,null,2190,"AR2023"],
  [2023,"港澳台及海外",70,582.909,null,1.500,3.300,null,99,"AR2023"],
  [2024,"中国大陆",401,3827.861,null,0.105,0.439,null,2300,"AR2024"],
  [2024,"港澳台",30,772.937,null,null,null,null,39,"AR2025"],
  [2024,"亚太",54,1667.850,null,null,null,null,null,"AR2025"],
  [2024,"美洲",22,341.148,null,null,null,null,null,"AR2025"],
  [2024,"欧洲及其他",14,157.065,null,null,null,null,null,"AR2025"],
  [2025,"中国大陆",410,8502.705,null,0.022,1.221,null,2350,"AR2025"],
  [2025,"港澳台",35,1572.727,null,0.167,1.035,null,46,"AR2025"],
  [2025,"亚太",85,4318.886,null,0.574,1.589,null,null,"AR2025"],
  [2025,"美洲",64,2003.799,null,1.909,4.874,null,null,"AR2025"],
  [2025,"欧洲及其他",36,856.209,null,1.571,4.451,null,null,"AR2025"],
  ["2025H1","PRC",443,4405.948,null,null,null,null,2437,"H12026"],
  ["2025H1","亚太",69,1492.991,null,null,null,null,null,"H12026"],
  ["2025H1","美洲",41,736.961,null,null,null,null,null,"H12026"],
  ["2025H1","欧洲及其他",18,272.110,null,null,null,null,null,"H12026"],
  ["2026H1","PRC",455,6089.686,null,0.027,0.382,null,2482,"H12026"],
  ["2026H1","亚太",90,1716.171,null,0.304,0.149,null,null,"H12026"],
  ["2026H1","美洲",86,903.063,null,1.098,0.225,null,null,"H12026"],
  ["2026H1","欧洲及其他",45,403.066,null,1.500,0.481,null,null,"H12026"],
];
stores.getRange(`A4:J${3+storeRows.length}`).values = storeRows;
for (let row=5; row<=3+storeRows.length; row++) stores.getRange(`E${row}`).formulas = [[`=IFERROR(D${row}/C${row},"")`]];
for (let row=5; row<=3+storeRows.length; row++) stores.getRange(`H${row}`).formulas = [[`=IF(F${row}="","",(1+G${row})/(1+F${row})-1)`]];
styleTable(stores,`A4:J${3+storeRows.length}`,4);
stores.getRange(`D5:E${3+storeRows.length}`).format.numberFormat = "#,##0.0";
stores.getRange(`F5:H${3+storeRows.length}`).format.numberFormat = "0.0%";
setWidths(stores,{A:12,B:18,C:12,D:14,E:16,F:12,G:14,H:16,I:16,J:12});
stores.freezePanes.freezeRows(4);

// --- Management commentary ---
const mgmt = wb.worksheets.getItem("业绩会补充");
title(mgmt,"业绩说明会与管理层问答补充","以下不是审计销售数据。内容用于解释渠道角色、扩张策略和管理层预期；已尽可能用后续实际结果检验。", "H");
const mgmtRows = [
  ["会议/日期","管理层信息","关键表述","可量化指标/目标","后续结果","判断","来源ID","证据等级"],
  ["2020年度业绩会","渠道定位","门店兼具销售、品牌展示和拉新；机器人商店兼具便利、拉新和选址雷达；天猫偏拉新，抽盒机偏核心用户。","四类渠道各有明确角色","此后渠道结构多次迁移，但全渠道能力持续","解释力强","CALL2020","二手会议纪要"],
  ["2022年度业绩会","海外","管理层预计海外继续高速增长。","方向性指引","2023海外+134.9%，2024+375.2%","兑现","CALL2022","二手会议纪要"],
  ["2023年度业绩会","中国门店","2024增长不依赖大举开店，重点提升门店运营、购买规模和客单价。","门店数量小幅增长、单店改善","2024大陆店数+10.5%，零售收入+43.9%","基本兑现","CALL2023","权威媒体转述"],
  ["2024年度业绩会","2025目标","集团收入增速50%以上、收入超200亿元；海外收入超100亿元并新开约100家门店。",">200亿元；海外>100亿元","实际371.2亿元；PRC外162.7亿元；PRC外门店约净增95家","大幅超额兑现","CALL2024","媒体/纪要交叉"],
  ["2024年度业绩会","海外店效","东南亚超过10家门店月销超500万元；6家地标店月均坪效超10万元；欧美坪效约1-2万元。","门店级非审计指标","没有在年报中形成持续同店序列","仅作佐证","CALL2024","二手会议纪要"],
  ["2025年度业绩会","中国结构","管理层称THE MONSTERS在中国全品类约占三分之一，约七成来自其他IP和品类。","中国业务IP集中度说明","公司未在财报中按地区披露IP收入，无法审计复核","方向性证据","CALL2025","二手会议纪要"],
  ["2025年度业绩会","2026开店","适度增加门店，但重点从数量转向质量、旗舰店和改造升级。","经营质量优先","2026H1 PRC店数+2.7%、零售收入+38.2%；海外店数快增但粗略店效下行","中国兑现，海外仍在调整","CALL2025","二手会议纪要"],
  ["2026中期业绩会","调整年","王宁称2025存在运气和意外流量，暴露管理问题；2026不以冲高业绩为首要目标。","全年原20%增长目标大概率无法完成","2026H1收入+23.8%，海外-11.1%","重要负面修正","CALL2026H1","权威媒体转述"],
];
mgmt.getRange(`A4:H${3+mgmtRows.length}`).values = mgmtRows;
styleTable(mgmt,`A4:H${3+mgmtRows.length}`,4);
mgmt.getRange(`A5:H${3+mgmtRows.length}`).format = { wrapText: true, rowHeight: 54, verticalAlignment: "top" };
setWidths(mgmt,{A:18,B:16,C:42,D:30,E:36,F:18,G:14,H:18});
mgmt.freezePanes.freezeRows(4);

// --- Sources and checks ---
const audit = wb.worksheets.getItem("来源与校验");
title(audit,"来源、口径与校验","优先级：港交所/公司正式报告 > 公司投资者关系页面 > 权威媒体转述 > 会议纪要。", "G");
const sourceRows = [["来源ID","类型","报告期/主题","URL","使用范围","备注","核验"]];
for (const [id,url] of Object.entries(sources)) {
  const type = id.startsWith("AR") || id.startsWith("H1") ? "正式报告" : id === "IR" ? "官方IR" : "业绩会/媒体";
  sourceRows.push([id,type,id,url,"对应数据表或管理层补充","完整URL，便于复核",type === "正式报告" ? "一手" : "解释层"]);
}
audit.getRange(`A4:G${3+sourceRows.length}`).values = sourceRows;
styleTable(audit,`A4:G${3+sourceRows.length}`,4);
audit.getRange(`D5:D${3+sourceRows.length}`).format = { font: { color: "#0563C1", underline: true }, wrapText: true };
const checkStart = 7 + sourceRows.length;
audit.getRange(`A${checkStart}:G${checkStart}`).values = [["校验项","实际值","预期值","差异","容差","状态","说明"]];
audit.getRange(`A${checkStart+1}:G${checkStart+5}`).values = [
  ["2025地区合计",null,37120.052,null,0.01,null,"PRC+亚太+美洲+欧洲"],
  ["2025渠道合计",null,37120.052,null,0.01,null,"零售+机器人+线上+批发"],
  ["2025产品品类合计",null,37120.052,null,0.01,null,"毛绒+手办+MEGA+其他"],
  ["2026H1地区合计",null,17172.921,null,0.01,null,"四地区"],
  ["2026H1品类合计",null,17172.921,null,0.01,null,"三品类"],
];
audit.getRange(`B${checkStart+1}`).formulas = [["=SUM('地区收入'!D21:D24)"]];
audit.getRange(`B${checkStart+2}`).formulas = [["=SUM('年度渠道'!B10:C10,'年度渠道'!E10:F10)"]];
audit.getRange(`B${checkStart+3}`).formulas = [["=SUM('产品品类'!C13:C16)"]];
audit.getRange(`B${checkStart+4}`).formulas = [["=SUM('地区收入'!D31:D34)"]];
audit.getRange(`B${checkStart+5}`).formulas = [["=SUM('产品品类'!C20:C22)"]];
for (let r=checkStart+1;r<=checkStart+5;r++) {
  audit.getRange(`D${r}`).formulas = [[`=B${r}-C${r}`]];
  audit.getRange(`F${r}`).formulas = [[`=IF(ABS(D${r})<=E${r},"OK","FAIL")`]];
}
styleTable(audit,`A${checkStart}:G${checkStart+5}`,checkStart);
audit.getRange(`B${checkStart+1}:E${checkStart+5}`).format.numberFormat = "#,##0.000";
setWidths(audit,{A:20,B:16,C:16,D:60,E:20,F:12,G:38});
audit.freezePanes.freezeRows(4);

// Selected highlights.
summary.getRange("D9:L9").format.fill = COLORS.paleRed;
matrix.getRange("A21:H24").format.fill = COLORS.paleRed;
product.getRange("A20:G22").format.fill = COLORS.paleRed;

await fs.mkdir("/Users/bytedance/Documents/郎刚的芒格/codex-产出", { recursive: true });
const out = await SpreadsheetFile.exportXlsx(wb);
await out.save(outPath);

// Compact verification and previews.
console.log((await wb.inspect({kind:"table",range:"结论总览!A4:G20",include:"values,formulas",tableMaxRows:20,tableMaxCols:8})).ndjson);
console.log((await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:100},summary:"formula errors"})).ndjson);
for (const sheetName of ["结论总览","地区收入","年度渠道","地区渠道矩阵","线上细分","产品品类","IP收入","门店网络","业绩会补充","来源与校验"]) {
  const img = await wb.render({sheetName,autoCrop:"all",scale:1,format:"png"});
  await fs.writeFile(`${sheetName}.png`, new Uint8Array(await img.arrayBuffer()));
}
console.log(outPath);

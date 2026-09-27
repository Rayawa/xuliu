import type { FinanceEntryType } from "./finance.ts";

export const expenseCategoryChoices = [
  "餐饮", "日常生活", "购物", "交通", "住房", "通讯", "娱乐", "医疗健康",
  "教育", "校园卡充值", "人情往来", "亲情卡", "金融保险", "其他",
];

export const incomeCategoryChoices = ["工资", "兼职", "奖学金", "报销", "礼金", "其他收入"];

export const categoryGlyphs: Record<string, string> = {
  餐饮: "餐", 日常生活: "日", 购物: "购", 交通: "行", 住房: "住", 通讯: "讯", 娱乐: "娱",
  医疗健康: "医", 教育: "学", 校园卡充值: "校", 人情往来: "礼", 亲情卡: "亲", 金融保险: "财",
  其他: "记", 学习: "学", 居住: "住", 健康: "医", 人情: "礼",
  工资: "薪", 兼职: "兼", 奖学金: "奖", 报销: "报", 礼金: "礼", 其他收入: "收",
};

export function normalizeMerchantName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

export function merchantCategoryKey(type: FinanceEntryType, merchant: string) {
  return `${type}:${normalizeMerchantName(merchant).slice(0, 190)}`;
}

export function transactionCategoryKey(type: FinanceEntryType, merchant: string, note: string) {
  const normalizedMerchant = normalizeMerchantName(merchant);
  const normalizedNote = normalizeMerchantName(note);
  return `${type}:detail:${normalizedMerchant.slice(0, 60)}:${normalizedNote.slice(0, 100)}`;
}

export function merchantFromEntry(note: string, merchant?: string) {
  return (merchant || note.split(" · ")[0] || "").trim();
}

export function classifyWeChatCategory(type: FinanceEntryType, fields: {
  transactionType?: string;
  counterparty?: string;
  product?: string;
  memo?: string;
  amountCents?: number;
}) {
  const title = [fields.transactionType, fields.counterparty, fields.product, fields.memo].filter(Boolean).join(" ").normalize("NFKC");
  const merchant = (fields.counterparty || "").normalize("NFKC");
  const detail = [fields.product, fields.memo].filter(Boolean).join(" ").normalize("NFKC");
  if (type === "income") {
    if (/奖学金|助学金/.test(title)) return "奖学金";
    if (/工资|薪资|薪酬/.test(title)) return "工资";
    if (/报销/.test(title)) return "报销";
    if (/红包|礼金|压岁钱/.test(title)) return "礼金";
    if (/兼职|稿费/.test(title)) return "兼职";
    return "其他收入";
  }
  // A specific purpose takes precedence over the payment platform or institution.
  if (/文创|伴手礼|礼物|礼品|礼金|红包|花束|鲜花/.test(title)) return "人情往来";
  if (/亲情卡/.test(title)) return "亲情卡";
  if (/网费|校园网|网络服务费|宽带|话费|流量|电信|移动|联通|通讯|通信/.test(title)) return "通讯";
  if (/微信读书|读书会员|腾讯读书|电子书|有声书/.test(title)) return "教育";
  if (/上海塔罗斯|塔罗斯/.test(merchant)) return "娱乐";
  if (/共享单车|单车|骑行|自行车|青桔|哈啰单车|美团单车|地铁|公交|打车|出租车|高铁|火车票|机票|滴滴|交通|车费/.test(title)) return "交通";
  if (/美团/.test(merchant) && fields.amountCents === 188 && !/饭|餐|食|外卖|咖啡|奶茶/.test(detail)) return "交通";
  if (/腾讯/.test(title) && /缴费|扣费|自动续费/.test(title) && fields.amountCents === 1900 && !/视频|音乐|游戏/.test(detail)) return "教育";
  if (/北京理工大学|北理工|北理(?!发)/.test(merchant) || /校园卡|一卡通充值|校园钱包充值/.test(title)) return "校园卡充值";
  if (/饭店|饭馆|餐厅|餐饮|食堂|外卖|美团外卖|饿了么|面馆|拉面|米线|麻辣烫|火锅|烧烤|小吃|早点|早餐|午餐|晚餐|奶茶|咖啡|茶饮|面包|蛋糕|甜品|饺子|汉堡|炸鸡|食府|海底捞|肯德基|麦当劳|必胜客|瑞幸|星巴克|茶百道|蜜雪冰城|霸王茶姬/.test(title)) return "餐饮";
  if (/医院|药店|医疗|挂号|体检|诊所|医保/.test(title)) return "医疗健康";
  if (/房租|租金|水费|电费|燃气|物业|公寓|住房/.test(title)) return "住房";
  if (/教材|图书|课程|学费|培训|文具|教育|考试|报名费/.test(title)) return "教育";
  if (/保险|理财|基金|证券|银行手续费/.test(title)) return "金融保险";
  if (/电影|演出|游戏|娱乐|剧院|门票|展览|KTV/.test(title)) return "娱乐";
  if (/超市|便利店|生鲜|菜市场|蔬菜|水果|日用品|洗衣|理发|快递/.test(title)) return "日常生活";
  if (/购物|百货|淘宝|京东|拼多多|商场|旗舰店|服饰|鞋包/.test(title)) return "购物";
  return "其他";
}

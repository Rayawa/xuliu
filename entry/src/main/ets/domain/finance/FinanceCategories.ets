import { FinanceEntry } from '../../models/Workspace';

export interface FinanceClassificationFields {
  transactionType?: string;
  counterparty?: string;
  product?: string;
  memo?: string;
  amountCents?: number;
}

// Native port of source/lib/finance-categories.ts; classification precedence is preserved.
export function normalizeMerchantName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

export function merchantCategoryKey(type: string, merchant: string) {
  return `${type}:${normalizeMerchantName(merchant).slice(0, 190)}`;
}

export function transactionCategoryKey(type: string, merchant: string, note: string) {
  const normalizedMerchant = normalizeMerchantName(merchant);
  const normalizedNote = normalizeMerchantName(note);
  return `${type}:detail:${normalizedMerchant.slice(0, 60)}:${normalizedNote.slice(0, 100)}`;
}

export function paymentAmountKey(type: string, merchant: string, amountCents: number) {
  return `${type}:amount:${normalizeMerchantName(merchant).slice(0, 155)}:${amountCents}`;
}

export function merchantFromEntry(note: string, merchant?: string) {
  return (merchant || note.split(" · ")[0] || "").trim();
}

export function expenseDetailCategory(entry: FinanceEntry) {
  if (entry.purpose?.trim()) return entry.purpose.trim();
  if (entry.origin === "wechat" && entry.updatedAt !== entry.createdAt && entry.merchant && entry.note.trim()
    && !normalizeMerchantName(entry.note).startsWith(normalizeMerchantName(entry.merchant))) return entry.note.trim().slice(0, 40);
  const note = entry.note.normalize("NFKC");
  if (entry.category === "餐饮") {
    if (/早餐|早点|早饭/.test(note)) return "早餐";
    if (/午餐|午饭/.test(note)) return "午餐";
    if (/晚餐|晚饭|夜宵/.test(note)) return "晚餐";
    if (/奶茶|咖啡|茶饮|饮品/.test(note)) return "饮品";
    return "其他餐饮";
  }
  if (entry.category === "交通") {
    if (/单车|骑行|自行车|青桔|哈啰|美团/.test(note) && entry.amountCents === 188) return "共享单车";
    if (/单车|骑行|自行车|青桔|哈啰/.test(note)) return "共享单车";
    if (/地铁|公交/.test(note)) return "公交地铁";
    if (/打车|出租|滴滴/.test(note)) return "打车";
    if (/高铁|火车|机票|飞机/.test(note)) return "长途交通";
    return "其他交通";
  }
  if (entry.category === "教育") {
    if (/微信读书|腾讯读书/.test(note) || (/腾讯/.test(note) && entry.amountCents === 1900)) return "微信读书";
    if (/教材|图书|电子书|书店/.test(note)) return "图书教材";
    if (/课程|培训|学费/.test(note)) return "课程培训";
    return "其他教育";
  }
  if (entry.category === "通讯") return /网费|校园网|宽带/.test(note) ? "网络费用" : /话费|流量/.test(note) ? "手机费用" : "其他通讯";
  if (entry.category === "人情往来") return /文创|礼物|礼品|花束|鲜花/.test(note) ? "礼物文创" : /红包|礼金/.test(note) ? "红包礼金" : "其他人情";
  if (entry.category === "娱乐") return /游戏|月卡|塔罗斯/.test(note) ? "游戏" : /电影|视频|影视|演出/.test(note) ? "影视演出" : "其他娱乐";
  if (entry.category === "日常生活") return /超市|便利店|日用品|生鲜|水果/.test(note) ? "日常采买" : "其他生活";
  if (entry.category === "购物") return /衣|服|鞋|包/.test(note) ? "服饰鞋包" : /电脑|手机|数码/.test(note) ? "数码" : "其他购物";
  if (entry.category === "医疗健康") return /药|医|医院|诊所/.test(note) ? "就医购药" : "其他健康";
  if (entry.category === "住房") return /房租|租金/.test(note) ? "房租" : /水费|电费|燃气|物业/.test(note) ? "水电物业" : "其他住房";
  if (entry.category === "校园卡充值") return "校园卡充值";
  return "其他";
}

export function classifyWeChatCategory(type: string, fields: FinanceClassificationFields) {
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
  if (/电影|演出|游戏|娱乐|剧院|门票|展览|KTV|腾讯视频|视频会员|音乐会员|QQ音乐/.test(title)) return "娱乐";
  if (/超市|便利店|生鲜|菜市场|蔬菜|水果|日用品|洗衣|理发|快递/.test(title)) return "日常生活";
  if (/购物|百货|淘宝|京东|拼多多|商场|旗舰店|服饰|鞋包/.test(title)) return "购物";
  return "其他";
}

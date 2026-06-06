(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LocalLifeAgentCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GROUPS = {
    friends: {
      label: "朋友局",
      summary: "轻松社交、适合多人聊天、集合信息清楚",
      defaultPartySize: 4,
      messageTarget: "朋友群",
    },
    familyKids: {
      label: "亲子家庭",
      summary: "儿童友好、路线短、餐厅低负担",
      defaultPartySize: 3,
      messageTarget: "家人",
    },
    familyElders: {
      label: "家人/长辈",
      summary: "少走路、少排队、安静稳妥",
      defaultPartySize: 3,
      messageTarget: "家人群",
    },
    couple: {
      label: "情侣约会",
      summary: "氛围、节奏、仪式感",
      defaultPartySize: 2,
      messageTarget: "伴侣",
    },
    solo: {
      label: "独自探索",
      summary: "轻松自由、低预约负担",
      defaultPartySize: 1,
      messageTarget: "自己",
    },
    coworkers: {
      label: "同事局",
      summary: "下班后轻社交、可控预算、便于集合",
      defaultPartySize: 4,
      messageTarget: "同事群",
    },
  };

  const MOCK_ACTIVITIES = [
    {
      id: "act-art",
      name: "河西艺术中心轻展览",
      type: "展览",
      distanceKm: 3.2,
      open: "10:00-21:00",
      durationHours: 1.6,
      price: 68,
      needsBooking: true,
      ticketInventory: 6,
      availableSlots: ["14:30", "16:00", "18:30", "19:30"],
      tags: ["indoor", "photo", "quiet", "social", "date"],
      groups: ["friends", "couple", "solo", "coworkers"],
      kidsFriendly: false,
      eldersFriendly: true,
      socialFriendly: true,
    },
    {
      id: "act-citywalk",
      name: "梧桐街区 Citywalk",
      type: "街区漫步",
      distanceKm: 2.4,
      open: "全天",
      durationHours: 1.4,
      price: 0,
      needsBooking: false,
      tags: ["outdoor", "photo", "social", "relaxed"],
      groups: ["friends", "couple", "solo"],
      kidsFriendly: false,
      eldersFriendly: false,
      socialFriendly: true,
    },
    {
      id: "act-boardgame",
      name: "木盒桌游咖啡",
      type: "桌游咖啡",
      distanceKm: 1.4,
      open: "13:00-23:00",
      durationHours: 2,
      price: 45,
      needsBooking: true,
      ticketInventory: 6,
      availableSlots: ["14:30", "16:00", "18:00", "19:00"],
      tags: ["indoor", "social", "relaxed", "chat"],
      groups: ["friends", "coworkers"],
      kidsFriendly: false,
      eldersFriendly: false,
      socialFriendly: true,
    },
    {
      id: "act-park",
      name: "河畔亲子探索公园",
      type: "公园",
      distanceKm: 1.8,
      open: "08:00-20:30",
      durationHours: 1.5,
      price: 0,
      needsBooking: false,
      tags: ["outdoor", "kids", "relaxed", "near"],
      groups: ["familyKids"],
      kidsFriendly: true,
      eldersFriendly: true,
      socialFriendly: false,
    },
    {
      id: "act-science",
      name: "儿童科学小剧场",
      type: "亲子剧场",
      distanceKm: 4.1,
      open: "10:00-18:30",
      durationHours: 1.3,
      price: 120,
      needsBooking: true,
      ticketInventory: 4,
      availableSlots: ["14:00", "15:30", "17:00"],
      tags: ["indoor", "kids", "learning"],
      groups: ["familyKids"],
      kidsFriendly: true,
      eldersFriendly: true,
      socialFriendly: false,
    },
    {
      id: "act-lake",
      name: "湖边茶室慢步道",
      type: "轻步道",
      distanceKm: 2.3,
      open: "09:00-20:00",
      durationHours: 1.1,
      price: 30,
      needsBooking: false,
      tags: ["quiet", "relaxed", "elder", "outdoor"],
      groups: ["familyElders", "couple", "solo"],
      kidsFriendly: true,
      eldersFriendly: true,
      socialFriendly: false,
    },
    {
      id: "act-culture",
      name: "社区文化馆民艺展",
      type: "文化馆",
      distanceKm: 1.9,
      open: "09:30-18:00",
      durationHours: 1,
      price: 20,
      needsBooking: false,
      tags: ["indoor", "quiet", "elder", "near"],
      groups: ["familyElders", "solo"],
      kidsFriendly: false,
      eldersFriendly: true,
      socialFriendly: false,
    },
    {
      id: "act-bookstore",
      name: "城市书店咖啡",
      type: "书店咖啡",
      distanceKm: 1.2,
      open: "10:00-22:00",
      durationHours: 1.2,
      price: 50,
      needsBooking: false,
      tags: ["indoor", "quiet", "solo", "relaxed"],
      groups: ["solo", "couple", "familyElders"],
      kidsFriendly: false,
      eldersFriendly: true,
      socialFriendly: false,
    },
    {
      id: "act-music",
      name: "屋顶音乐小现场",
      type: "小型演出",
      distanceKm: 4.8,
      open: "18:30-22:30",
      durationHours: 1.8,
      price: 128,
      needsBooking: true,
      ticketInventory: 4,
      availableSlots: ["18:30", "19:00", "19:30"],
      tags: ["date", "music", "atmosphere", "evening"],
      groups: ["couple", "friends"],
      kidsFriendly: false,
      eldersFriendly: false,
      socialFriendly: true,
    },
  ];

  const MOCK_RESTAURANTS = [
    {
      id: "res-light",
      name: "绿野轻食餐厅",
      cuisine: "轻食/简餐",
      distanceKm: 1.6,
      pricePerPerson: 88,
      waitMinutes: 10,
      seatCapacity: 3,
      availableSlots: ["17:30", "18:00", "18:30", "19:30", "20:30"],
      tags: ["healthy", "kids", "quiet", "near"],
      groups: ["familyKids", "couple", "solo"],
      kidsFriendly: true,
      eldersFriendly: true,
      healthy: true,
      chatFriendly: true,
    },
    {
      id: "res-bistro",
      name: "云间小馆",
      cuisine: "融合菜",
      distanceKm: 2.7,
      pricePerPerson: 128,
      waitMinutes: 15,
      seatCapacity: 4,
      availableSlots: ["18:00", "18:30", "19:00", "19:30", "20:30"],
      tags: ["chat", "date", "social"],
      groups: ["friends", "couple", "coworkers"],
      kidsFriendly: false,
      eldersFriendly: true,
      healthy: false,
      chatFriendly: true,
    },
    {
      id: "res-old",
      name: "老街本帮菜",
      cuisine: "本帮菜",
      distanceKm: 2.1,
      pricePerPerson: 110,
      waitMinutes: 5,
      seatCapacity: 6,
      availableSlots: ["17:30", "18:00", "18:30", "19:30"],
      tags: ["elder", "family", "stable"],
      groups: ["familyElders", "familyKids"],
      kidsFriendly: true,
      eldersFriendly: true,
      healthy: false,
      chatFriendly: true,
    },
    {
      id: "res-western",
      name: "暖灯西餐厅",
      cuisine: "西餐",
      distanceKm: 3.5,
      pricePerPerson: 180,
      waitMinutes: 12,
      seatCapacity: 2,
      availableSlots: ["18:30", "19:00", "19:30", "20:30"],
      tags: ["date", "atmosphere", "photo"],
      groups: ["couple"],
      kidsFriendly: false,
      eldersFriendly: false,
      healthy: false,
      chatFriendly: true,
    },
    {
      id: "res-friends-full",
      name: "木桌朋友餐吧",
      cuisine: "餐吧",
      distanceKm: 2.2,
      pricePerPerson: 116,
      waitMinutes: 35,
      seatCapacity: 4,
      availableSlots: [],
      tags: ["friends", "chat", "social"],
      groups: ["friends", "coworkers"],
      kidsFriendly: false,
      eldersFriendly: false,
      healthy: false,
      chatFriendly: true,
    },
    {
      id: "res-tea",
      name: "河畔茶餐厅",
      cuisine: "茶餐厅",
      distanceKm: 1.5,
      pricePerPerson: 75,
      waitMinutes: 5,
      seatCapacity: 6,
      availableSlots: ["16:30", "17:30", "18:00", "19:30"],
      tags: ["elder", "near", "quiet"],
      groups: ["familyElders", "familyKids", "solo"],
      kidsFriendly: true,
      eldersFriendly: true,
      healthy: false,
      chatFriendly: true,
    },
    {
      id: "res-japanese",
      name: "日式简餐小屋",
      cuisine: "日式简餐",
      distanceKm: 1.1,
      pricePerPerson: 92,
      waitMinutes: 8,
      seatCapacity: 2,
      availableSlots: ["17:00", "18:00", "19:00", "20:30"],
      tags: ["healthy", "solo", "quiet", "near"],
      groups: ["solo", "couple"],
      kidsFriendly: false,
      eldersFriendly: true,
      healthy: true,
      chatFriendly: false,
    },
  ];

  const MOCK_ADD_ONS = {
    friends: {
      id: "addon-milk-tea",
      name: "4 杯轻糖奶茶",
      target: "附近 20 分钟达奶茶店",
      price: 76,
      saving: 12,
      deliveryTime: "活动结束前送达",
    },
    familyKids: {
      id: "addon-family-dessert",
      name: "儿童小蛋糕 + 低糖饮品",
      target: "亲子友好甜品店",
      price: 88,
      saving: 16,
      deliveryTime: "晚餐前送至餐厅",
    },
    familyElders: {
      id: "addon-tea",
      name: "热茶点心券",
      target: "附近茶点铺",
      price: 48,
      saving: 8,
      deliveryTime: "到店自取",
    },
    couple: {
      id: "addon-flower",
      name: "小束鲜花",
      target: "餐厅前台代收",
      price: 99,
      saving: 20,
      deliveryTime: "晚餐前送达",
    },
    solo: {
      id: "addon-coffee",
      name: "咖啡自提券",
      target: "附近咖啡店",
      price: 29,
      saving: 6,
      deliveryTime: "到店自取",
    },
    coworkers: {
      id: "addon-team-drink",
      name: "团队饮品券",
      target: "附近茶饮店",
      price: 96,
      saving: 18,
      deliveryTime: "晚餐前送达",
    },
  };

  const REPLAN_EVENTS = [
    { id: "rain", label: "下雨了", description: "换室内并重算路线" },
    { id: "restaurant_full", label: "餐厅满座", description: "替换餐厅并保留团购" },
    { id: "activity_sold_out", label: "活动无票", description: "替换同人群、同半径活动" },
    { id: "party_changed", label: "人数变化", description: "重查票量、座位和预算" },
    { id: "tired_child", label: "孩子累了", description: "降低体力消耗" },
    { id: "budget_high", label: "预算太高", description: "替换低价套餐" },
  ];

  const STRATEGIES = {
    friends: [
      { name: "轻松社交：桌游咖啡 + 晚餐", tags: ["social", "chat", "indoor"], restaurantTags: ["friends", "chat"] },
      { name: "看展聊天：轻展览 + 小馆晚餐", tags: ["indoor", "photo", "social"], restaurantTags: ["chat", "social"] },
      { name: "街区散步：Citywalk + 轻松聚餐", tags: ["outdoor", "photo", "relaxed"], restaurantTags: ["social", "chat"] },
    ],
    familyKids: [
      { name: "亲子轻松：探索公园 + 健康晚餐", tags: ["kids", "near", "relaxed"], restaurantTags: ["healthy", "kids"] },
      { name: "室内亲子：科学小剧场 + 轻食", tags: ["kids", "indoor", "learning"], restaurantTags: ["healthy", "kids"] },
      { name: "短途稳妥：公园放电 + 茶餐厅", tags: ["kids", "near"], restaurantTags: ["near", "quiet"] },
    ],
    familyElders: [
      { name: "长辈友好：文化馆 + 本帮菜", tags: ["elder", "quiet", "indoor"], restaurantTags: ["elder", "stable"] },
      { name: "少走路：湖边茶室 + 茶餐厅", tags: ["elder", "relaxed", "quiet"], restaurantTags: ["elder", "near"] },
      { name: "近距离：书店咖啡 + 稳妥晚饭", tags: ["quiet", "near"], restaurantTags: ["family", "quiet"] },
    ],
    couple: [
      { name: "约会氛围：轻展览 + 西餐", tags: ["date", "photo", "indoor"], restaurantTags: ["date", "atmosphere"] },
      { name: "仪式感：音乐小现场 + 晚餐", tags: ["date", "music", "evening"], restaurantTags: ["date"] },
      { name: "轻松约会：Citywalk + 小馆", tags: ["photo", "relaxed"], restaurantTags: ["date", "chat"] },
    ],
    solo: [
      { name: "独自放空：书店咖啡 + 简餐", tags: ["solo", "quiet", "indoor"], restaurantTags: ["solo", "healthy"] },
      { name: "轻量探索：民艺展 + 茶餐厅", tags: ["quiet", "near"], restaurantTags: ["quiet", "near"] },
      { name: "城市散步：Citywalk + 轻食", tags: ["outdoor", "photo"], restaurantTags: ["healthy", "near"] },
    ],
    coworkers: [
      { name: "下班轻社交：桌游咖啡 + 聚餐", tags: ["social", "indoor", "chat"], restaurantTags: ["friends", "chat"] },
      { name: "不尴尬：看展 + 小馆晚餐", tags: ["indoor", "social"], restaurantTags: ["social", "chat"] },
      { name: "短平快：附近咖啡 + 团队晚餐", tags: ["relaxed", "near"], restaurantTags: ["chat"] },
    ],
  };

  function normalizeText(text) {
    return String(text || "").trim();
  }

  function hasAny(text, patterns) {
    return patterns.some(function (pattern) {
      return pattern.test(text);
    });
  }

  function detectGroup(text, overrideGroup) {
    if (overrideGroup && GROUPS[overrideGroup]) return overrideGroup;
    if (hasAny(text, [/孩子|小孩|娃|儿子|女儿|亲子|老婆孩子|老公孩子/])) return "familyKids";
    if (hasAny(text, [/女朋友|男朋友|对象|约会|情侣|伴侣|老婆|老公|爱人|纪念日/])) return "couple";
    if (hasAny(text, [/爸妈|父母|爸爸|妈妈|老人|长辈|亲戚|家人/])) return "familyElders";
    if (hasAny(text, [/朋友|好友|同学|闺蜜|哥们|2\s*男\s*2\s*女|聚会|多人/])) return "friends";
    if (hasAny(text, [/同事|团建|客户|下班后|团队/])) return "coworkers";
    if (hasAny(text, [/自己|一个人|独自|单人|solo/i])) return "solo";
    return null;
  }

  function parseTime(text, overrideTime) {
    if (overrideTime) {
      return makeTimeRange(overrideTime, 4, false);
    }

    const hasTime = /今天|明天|周[一二三四五六日天末]|星期[一二三四五六日天]?|上午|中午|下午|晚上|今晚|\d{1,2}\s*点/.test(text);
    const duration = parseDuration(text);
    if (!hasTime) {
      return {
        missing: true,
        label: "未说明",
        start: "14:00",
        end: minutesToTime(14 * 60 + duration * 60),
        startMinutes: 14 * 60,
        endMinutes: 14 * 60 + duration * 60,
        durationHours: duration,
      };
    }

    let day = "今天";
    if (/明天/.test(text)) day = "明天";
    if (/周末/.test(text)) day = "周末";
    if (/周日|星期日|星期天/.test(text)) day = "周日";
    if (/周六|星期六/.test(text)) day = "周六";

    let startHour = 14;
    if (/上午/.test(text)) startHour = 9;
    if (/中午/.test(text)) startHour = 12;
    if (/晚上|今晚/.test(text)) startHour = 18;
    if (/下午/.test(text)) startHour = 14;

    const hourMatch = text.match(/(?:(上午|下午|晚上|今晚|中午)\s*)?(\d{1,2})\s*点/);
    if (hourMatch) {
      startHour = Number(hourMatch[2]);
      const period = hourMatch[1] || "";
      if ((period === "下午" || period === "晚上" || period === "今晚") && startHour < 12) {
        startHour += 12;
      }
      if (!period && startHour >= 1 && startHour <= 7 && /下午|晚上|今晚/.test(text)) {
        startHour += 12;
      }
    }

    const startMinutes = startHour * 60;
    const endMinutes = startMinutes + duration * 60;
    const part = startHour >= 18 ? "晚上" : startHour >= 12 ? "下午" : "上午";

    return {
      missing: false,
      label: day + " " + part + " " + minutesToTime(startMinutes) + "-" + minutesToTime(endMinutes),
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      startMinutes: startMinutes,
      endMinutes: endMinutes,
      durationHours: duration,
    };
  }

  function makeTimeRange(label, durationHours, missing) {
    const presets = {
      "今天下午": 14 * 60,
      "今天晚上": 18 * 60,
      "周末下午": 14 * 60,
    };
    const startMinutes = presets[label] || 14 * 60;
    return {
      missing: Boolean(missing),
      label: label + " " + minutesToTime(startMinutes) + "-" + minutesToTime(startMinutes + durationHours * 60),
      start: minutesToTime(startMinutes),
      end: minutesToTime(startMinutes + durationHours * 60),
      startMinutes: startMinutes,
      endMinutes: startMinutes + durationHours * 60,
      durationHours: durationHours,
    };
  }

  function makeMissingTimeRange(text) {
    const duration = parseDuration(text);
    return {
      missing: true,
      label: "未说明",
      start: "14:00",
      end: minutesToTime(14 * 60 + duration * 60),
      startMinutes: 14 * 60,
      endMinutes: 14 * 60 + duration * 60,
      durationHours: duration,
    };
  }

  function parseDuration(text) {
    const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-到至~]\s*(\d+(?:\.\d+)?)\s*个?\s*小时/);
    if (rangeMatch) {
      return (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2;
    }
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*个?\s*小时/);
    if (hourMatch) return Number(hourMatch[1]);
    if (/半天/.test(text)) return 4;
    if (/一会儿|一阵|短暂|很短/.test(text)) return 1.5;
    return 4;
  }

  function parsePartySize(text, groupType) {
    const genderMatch = text.match(/(\d+)\s*男\s*(\d+)\s*女/);
    if (genderMatch) return Number(genderMatch[1]) + Number(genderMatch[2]);

    const totalMatch = text.match(/(?:总共|一共|共)\s*(\d+)\s*(?:个|位)?人/);
    if (totalMatch) return Number(totalMatch[1]);

    const friendMatch = text.match(/和\s*(\d+)\s*(?:个|位)?朋友/);
    if (friendMatch) return Number(friendMatch[1]) + 1;

    const peopleMatch = text.match(/(\d+)\s*(?:个|位)?人/);
    if (peopleMatch) return Number(peopleMatch[1]);

    if (/爸妈|父母/.test(text)) return 3;
    if (/老婆孩子|老公孩子|一家三口/.test(text)) return 3;
    if (/孩子/.test(text) && /老婆|老公|伴侣/.test(text)) return 3;
    if (/孩子/.test(text)) return 2;

    return groupType ? GROUPS[groupType].defaultPartySize : null;
  }

  function parsePreferences(text) {
    const prefs = [];
    if (/别太远|不要太远|不远|附近|近一点|离家近/.test(text)) prefs.push({ key: "near", label: "距离不要太远", maxKm: 5 });
    if (/不想太累|别太累|不要太累|轻松|舒服/.test(text)) prefs.push({ key: "relaxed", label: "节奏轻松" });
    if (/减肥|健康|轻食|低卡|少油|低负担/.test(text)) prefs.push({ key: "healthy", label: "餐饮低负担" });
    if (/不要排队|不排队|少排队|避免排队/.test(text)) prefs.push({ key: "noQueue", label: "减少排队" });
    if (/拍照|好看|出片|仪式感/.test(text)) prefs.push({ key: "photo", label: "有氛围/适合拍照" });
    if (/室内|不要户外|别户外/.test(text)) prefs.push({ key: "indoor", label: "优先室内" });
    if (/citywalk|散步|走走|公园|户外/.test(text)) prefs.push({ key: "outdoor", label: "可接受户外轻活动" });
    const budgetMatch = text.match(/预算\s*(?:不超过|控制在|大概|约)?\s*(\d{2,4})/);
    if (budgetMatch) {
      prefs.push({ key: "budget", label: "预算约 " + budgetMatch[1] + " 元/人", maxPerPerson: Number(budgetMatch[1]) });
    } else if (/预算中等|别太贵|不要太贵|省钱/.test(text)) {
      prefs.push({ key: "budget", label: "预算中等" });
    }
    if (/吃饭|晚饭|晚餐|聚餐|餐厅/.test(text)) prefs.push({ key: "meal", label: "需要餐饮安排" });
    if (/很远|远一点|远方|跨城/.test(text)) prefs.push({ key: "far", label: "想去较远地点" });
    return prefs;
  }

  function makePreferenceFromKey(key, meta) {
    const labels = {
      near: "距离不要太远",
      relaxed: "节奏轻松",
      healthy: "餐饮低负担",
      noQueue: "减少排队",
      photo: "有氛围/适合拍照",
      indoor: "优先室内",
      outdoor: "可接受户外轻活动",
      meal: "需要餐饮安排",
      budget: meta && meta.maxPerPerson ? "预算约 " + meta.maxPerPerson + " 元/人" : "预算中等",
    };
    if (!labels[key]) return null;
    const pref = { key: key, label: labels[key] };
    if (key === "near") pref.maxKm = 5;
    if (key === "budget" && meta && meta.maxPerPerson) pref.maxPerPerson = meta.maxPerPerson;
    return pref;
  }

  function mergePreferenceOverride(preferences, keys, budgetPerPerson) {
    const merged = preferences.slice();
    (keys || []).forEach(function (key) {
      if (merged.some(function (pref) { return pref.key === key; })) return;
      const pref = makePreferenceFromKey(key, { maxPerPerson: key === "budget" ? budgetPerPerson : null });
      if (pref) merged.push(pref);
    });
    if (budgetPerPerson && !merged.some(function (pref) { return pref.key === "budget"; })) {
      const pref = makePreferenceFromKey("budget", { maxPerPerson: budgetPerPerson });
      if (pref) merged.push(pref);
    }
    return merged;
  }

  function parseRequest(input, overrides) {
    const text = normalizeText(input);
    const opts = overrides || {};
    const forcedMissing = opts.missingFields || [];
    const groupType = forcedMissing.indexOf("groupType") >= 0 ? null : detectGroup(text, opts.groupType);
    const timeRange = forcedMissing.indexOf("timePreset") >= 0
      ? makeMissingTimeRange(text)
      : parseTime(text, opts.timePreset);
    const preferences = mergePreferenceOverride(parsePreferences(text), opts.preferences, opts.budgetPerPerson);
    let partySize = opts.partySize || parsePartySize(text, groupType);
    const childAgeMatch = text.match(/孩子\s*(\d+)\s*岁|(\d+)\s*岁\s*孩子/);
    const childAge = opts.childAge || (childAgeMatch ? Number(childAgeMatch[1] || childAgeMatch[2]) : null);
    const hasFarPreference = preferences.some(function (pref) { return pref.key === "far"; });
    const hasNearPreference = preferences.some(function (pref) { return pref.key === "near"; });
    const replanEvent = opts.replanEvent || null;
    const weatherConcern = /下雨|雨天|暴雨|天气不好|天气不太好|大风|太晒|高温/.test(text) || replanEvent === "rain";
    if (replanEvent === "rain" && !preferences.some(function (pref) { return pref.key === "indoor"; })) {
      preferences.push({ key: "indoor", label: "突发下雨，优先室内" });
    }
    if (replanEvent === "tired_child" && !preferences.some(function (pref) { return pref.key === "relaxed"; })) {
      preferences.push({ key: "relaxed", label: "孩子累了，降低体力消耗" });
    }
    if (replanEvent === "budget_high" && !preferences.some(function (pref) { return pref.key === "budget"; })) {
      preferences.push({ key: "budget", label: "预算太高，优先低价套餐" });
    }
    if (replanEvent === "party_changed" && groupType) {
      partySize = Math.max(2, (partySize || GROUPS[groupType].defaultPartySize) + 1);
    }

    const assumptions = [];
    if (!/从|出发|家|公司|附近|定位/.test(text)) assumptions.push("出发点按“家附近”处理");
    if (!preferences.some(function (pref) { return pref.key === "budget"; })) assumptions.push("预算按中等处理");
    if (!/打车|开车|地铁|步行|公交/.test(text)) assumptions.push("交通方式按步行 + 短途打车优先");
    if (partySize && !/\d/.test(text) && groupType) assumptions.push("人数按" + GROUPS[groupType].label + "默认值处理");
    if (replanEvent === "party_changed") assumptions.push("突发人数变化：已按 " + partySize + " 人重新检查票量、座位和预算");
    if (opts.intentSource === "llm") assumptions.push("自然语言理解由真实 LLM 提供，生活服务工具仍使用 Mock 兜底");
    if (opts.intentFallbackReason) assumptions.push("LLM 未接管：" + opts.intentFallbackReason);

    const warnings = [];
    if (timeRange.durationHours <= 1.5 && hasFarPreference) {
      warnings.push("“只能玩 1 小时”和“去很远地方吃饭”存在冲突，系统会优先给出近距离替代方案。");
    }
    if (hasFarPreference && hasNearPreference) {
      warnings.push("同时出现“别太远”和“很远”偏好，系统会优先保证不折腾。");
    }

    return {
      rawText: text,
      groupType: groupType,
      groupLabel: groupType ? GROUPS[groupType].label : "未确认",
      groupSummary: groupType ? GROUPS[groupType].summary : "需要先确认同行关系",
      partySize: partySize,
      timeRange: timeRange,
      preferences: preferences,
      preferenceLabels: preferences.map(function (pref) { return pref.label; }),
      childAge: childAge,
      location: opts.location || "家附近",
      weatherConcern: weatherConcern,
      replanEvent: replanEvent,
      assumptions: assumptions,
      warnings: warnings,
      requiresNearFallback: timeRange.durationHours <= 1.5 && hasFarPreference,
      intentSource: opts.intentSource || "local_rules",
      intentConfidence: typeof opts.intentConfidence === "number" ? opts.intentConfidence : null,
      intentReasoningSummary: opts.intentReasoningSummary || "",
      lessonsUsed: opts.lessonsUsed || [],
    };
  }

  function getClarification(parsed) {
    if (!parsed.groupType) {
      return {
        key: "groupType",
        question: "这次主要是和谁一起？确认同行关系后，我再继续规划。",
        options: [
          { label: "和朋友", value: "friends" },
          { label: "和家人/长辈", value: "familyElders" },
          { label: "和伴侣", value: "couple" },
          { label: "和孩子家人", value: "familyKids" },
          { label: "自己出门", value: "solo" },
          { label: "和同事", value: "coworkers" },
        ],
      };
    }
    if (parsed.timeRange.missing) {
      return {
        key: "timePreset",
        question: "这次大概什么时候出门？我需要一个时间范围来安排路线和预约。",
        options: [
          { label: "今天下午", value: "今天下午" },
          { label: "今天晚上", value: "今天晚上" },
          { label: "周末下午", value: "周末下午" },
        ],
      };
    }
    return null;
  }

  function planRequest(input, overrides) {
    const parsed = parseRequest(input, overrides || {});
    const clarification = getClarification(parsed);

    if (clarification) {
      return {
        needsClarification: true,
        parsed: parsed,
        clarification: clarification,
        toolCalls: [],
        plans: [],
        recommendedPlanId: null,
        executionQueue: [],
        agentLoopTrace: buildAgentLoopTrace(parsed, clarification, [], [], null),
      };
    }

    const toolCalls = [];
    const weather = callTool(toolCalls, "get_weather", {
      location: parsed.location,
      time_range: parsed.timeRange.label,
    }, function () {
      return getWeather(parsed.location, parsed.timeRange, parsed);
    });

    const activities = callTool(toolCalls, "search_activities", {
      location: parsed.location,
      time_range: parsed.timeRange.label,
      group_profile: parsed.groupLabel,
      preferences: parsed.preferenceLabels,
    }, function () {
      return searchActivities(parsed, weather);
    });

    const restaurants = callTool(toolCalls, "search_restaurants", {
      location: parsed.location,
      party_size: parsed.partySize,
      group_profile: parsed.groupLabel,
      preferences: parsed.preferenceLabels,
    }, function () {
      return searchRestaurants(parsed);
    });

    const plans = buildPlans(parsed, activities, restaurants, toolCalls, weather);
    const recommended = plans[0] || null;

    return {
      needsClarification: false,
      parsed: parsed,
      toolCalls: toolCalls,
      plans: plans,
      recommendedPlanId: recommended ? recommended.id : null,
      executionQueue: recommended ? createExecutionQueue(recommended, parsed) : [],
      agentLoopTrace: buildAgentLoopTrace(parsed, null, toolCalls, plans, recommended),
    };
  }

  function buildAgentLoopTrace(parsed, clarification, toolCalls, plans, recommended) {
    const hasClarification = Boolean(clarification);
    const hasPlans = Boolean(plans && plans.length);
    const activeReplan = parsed.replanEvent
      ? REPLAN_EVENTS.find(function (event) { return event.id === parsed.replanEvent; })
      : null;

    return {
      mode: "single_orchestrator_with_mock_research_lanes",
      description: parsed.intentSource === "llm"
        ? "单 Orchestrator 接入真实 LLM 做意图识别，生活服务工具仍为稳定 Mock，并保留本地规则兜底。"
        : "单 Orchestrator 编排稳定 Mock Tools，并按逻辑研究通道展示；不是重型多 Agent 并发，也不接真实平台 API。",
      stages: [
        makeLoopStage(
          "understand",
          "Understand",
          "done",
          parsed.intentSource === "llm"
            ? "已使用真实 LLM 解析自然语言，并把结果交给本地校验器。"
            : "使用本地规则解析自然语言；若后端或 LLM 不可用，会保持此兜底路径。",
          buildUnderstandFindings(parsed)
        ),
        makeLoopStage(
          "planner",
          "Ask / Planner",
          hasClarification ? "active" : "done",
          hasClarification
            ? "已理解部分目标，但缺少继续规划所需的关键信息。"
            : "已解析用户目标、同行关系、时间窗、偏好和限制。",
          buildPlannerFindings(parsed, clarification)
        ),
        makeLoopStage(
          "researchers",
          "Subquestion Researchers",
          hasClarification ? "pending" : "done",
          hasClarification
            ? "等待补充信息后再启动逻辑并行研究通道。"
            : "天气路线、活动、餐厅、订座排队和团购通道已完成查证。",
          hasClarification ? [] : buildResearchFindings(toolCalls),
          hasClarification ? [] : buildResearchLanes(parsed, toolCalls, plans)
        ),
        makeLoopStage(
          "merger",
          "Merger",
          hasClarification ? "pending" : "done",
          hasPlans
            ? "已将研究结果合成为 " + plans.length + " 个可执行服务包，并选出推荐方案。"
            : "等待研究结果后合成候选服务包。",
          hasClarification ? [] : buildMergerFindings(plans, recommended)
        ),
        makeLoopStage(
          "verifier",
          "Verifier",
          hasClarification ? "pending" : "done",
          hasPlans
            ? "已检查时间、距离、预算、同行适配、预约可用性和高影响动作确认。"
            : "等待候选服务包后进行可执行性校验。",
          hasClarification ? [] : buildVerifierFindings(parsed, recommended || plans[0])
        ),
        makeLoopStage(
          "revise",
          "Revise",
          hasClarification ? "pending" : (activeReplan ? "done" : "ready"),
          activeReplan
            ? "已应用「" + activeReplan.label + "」重排： " + activeReplan.description + "。"
            : "已准备下雨、餐厅满座、活动无票、人数变化、孩子累了、预算太高六类重排入口。",
          hasClarification ? [] : buildReviseFindings(parsed, recommended || plans[0], activeReplan)
        ),
        makeLoopStage(
          "reflect",
          "Reflect",
          hasClarification ? "pending" : "ready",
          "用户纠错、方案不满意或工具失败可写入 SQLite 复盘记忆，下次规划时作为上下文参考。",
          buildReflectFindings(parsed)
        ),
      ],
    };
  }

  function makeLoopStage(id, label, status, summary, findings, lanes) {
    return {
      id: id,
      label: label,
      status: status,
      summary: summary,
      findings: findings || [],
      lanes: lanes || [],
    };
  }

  function makeLoopFinding(key, label, summary, status) {
    return {
      key: key,
      label: label,
      summary: summary,
      status: status || "done",
    };
  }

  function buildUnderstandFindings(parsed) {
    const findings = [
      makeLoopFinding(
        "source",
        "理解来源",
        parsed.intentSource === "llm" ? "真实 LLM 识别 + 本地 schema 校验" : "本地关键词/正则规则兜底",
        parsed.intentSource === "llm" ? "done" : "ready"
      ),
    ];
    if (typeof parsed.intentConfidence === "number") {
      findings.push(makeLoopFinding("confidence", "置信度", Math.round(parsed.intentConfidence * 100) + "%", parsed.intentConfidence >= 0.72 ? "done" : "warn"));
    }
    if (parsed.intentReasoningSummary) {
      findings.push(makeLoopFinding("summary", "理解摘要", parsed.intentReasoningSummary, "done"));
    }
    if (parsed.lessonsUsed && parsed.lessonsUsed.length) {
      findings.push(makeLoopFinding("memory", "参考经验", "已参考 " + parsed.lessonsUsed.length + " 条历史复盘经验。", "done"));
    }
    return findings;
  }

  function buildPlannerFindings(parsed, clarification) {
    const findings = [
      makeLoopFinding("group", "同行关系", parsed.groupLabel + "，" + parsed.groupSummary, parsed.groupType ? "done" : "missing"),
      makeLoopFinding("time", "时间窗", parsed.timeRange.label, "done"),
      makeLoopFinding("party", "人数", parsed.partySize ? parsed.partySize + " 人" : "待确认", parsed.partySize ? "done" : "missing"),
      makeLoopFinding("preferences", "偏好约束", parsed.preferenceLabels.length ? parsed.preferenceLabels.join(" / ") : "按轻松、中等预算处理", "done"),
    ];
    if (parsed.warnings.length) {
      findings.push(makeLoopFinding("constraints", "冲突约束", parsed.warnings.join("；"), "warn"));
    }
    if (clarification) {
      findings.push(makeLoopFinding("clarification", "需要追问", clarification.question, "active"));
    }
    return findings;
  }

  function buildReflectFindings(parsed) {
    const findings = [
      makeLoopFinding("memory_store", "记忆写入", "反馈会写入本地 SQLite，不写入前端代码或密钥。", "ready"),
      makeLoopFinding("scope", "复盘边界", "复盘只用于下次参考和降低重复错误概率，不自动改代码。", "ready"),
    ];
    if (parsed.lessonsUsed && parsed.lessonsUsed.length) {
      findings.push(makeLoopFinding("lessons_used", "本次参考", parsed.lessonsUsed.map(function (lesson) { return lesson.lesson; }).slice(0, 2).join("；"), "done"));
    }
    return findings;
  }

  function buildResearchFindings(toolCalls) {
    const weatherCall = findToolCall(toolCalls, "get_weather");
    const activityCall = findToolCall(toolCalls, "search_activities");
    const restaurantCall = findToolCall(toolCalls, "search_restaurants");
    const routeCalls = filterToolCalls(toolCalls, "check_route");
    const availabilityCalls = filterToolCalls(toolCalls, "check_availability");
    const unavailableCount = availabilityCalls.filter(function (call) {
      return call.output && call.output.available === false;
    }).length;

    return [
      makeLoopFinding(
        "weather_route",
        "路线天气研究通道",
        weatherCall
          ? weatherCall.output.weather + "；已计算 " + routeCalls.length + " 段路线。"
          : "等待天气与路线工具结果。",
        "done"
      ),
      makeLoopFinding(
        "activities",
        "活动研究通道",
        activityCall ? "找到 " + activityCall.output.length + " 个可组合活动候选。" : "等待活动候选。",
        "done"
      ),
      makeLoopFinding(
        "restaurants",
        "餐厅研究通道",
        restaurantCall ? "找到 " + restaurantCall.output.length + " 个餐厅和套餐候选。" : "等待餐厅候选。",
        "done"
      ),
      makeLoopFinding(
        "availability",
        "订座排队团购通道",
        "完成 " + availabilityCalls.length + " 次可用性检查" + (unavailableCount ? "，发现 " + unavailableCount + " 个需替换/人工确认项。" : "，当前推荐链路可进入确认。"),
        unavailableCount ? "warn" : "done"
      ),
    ];
  }

  function buildResearchLanes(parsed, toolCalls, plans) {
    const weatherCall = findToolCall(toolCalls, "get_weather");
    const activityCall = findToolCall(toolCalls, "search_activities");
    const restaurantCall = findToolCall(toolCalls, "search_restaurants");
    const routeCalls = filterToolCalls(toolCalls, "check_route");
    const availabilityCalls = filterToolCalls(toolCalls, "check_availability");
    const unavailableCalls = availabilityCalls.filter(function (call) {
      return call.output && call.output.available === false;
    });
    const recommended = plans && plans[0];
    const actionCount = recommended && recommended.servicePackage
      ? recommended.servicePackage.meituanActions.length
      : 0;

    return [
      makeResearchLane(
        "weather_route",
        "天气/路线",
        weatherCall ? "done" : "pending",
        520 + routeCalls.length * 80,
        weatherCall ? weatherCall.output.weather + "；路线计算 " + routeCalls.length + " 段" : "等待天气和路线",
        Boolean(weatherCall && weatherCall.output && weatherCall.output.outdoor_ok === false)
      ),
      makeResearchLane(
        "activity_ticketing",
        "活动/票务",
        activityCall ? "done" : "pending",
        680 + availabilityCalls.length * 60,
        activityCall ? "候选活动 " + activityCall.output.length + " 个；按 " + parsed.partySize + " 人查票" : "等待活动召回",
        Boolean(recommended && recommended.issueNotices.some(function (notice) { return /活动已替换|活动需人工/.test(notice.title); }))
      ),
      makeResearchLane(
        "restaurant_booking",
        "餐厅/订座",
        restaurantCall ? "done" : "pending",
        740 + availabilityCalls.length * 70,
        restaurantCall ? "候选餐厅 " + restaurantCall.output.length + " 个；完成订座可用性校验" : "等待餐厅召回",
        Boolean(recommended && recommended.issueNotices.some(function (notice) { return /餐厅已替换|餐厅需人工|人数已变化/.test(notice.title); }))
      ),
      makeResearchLane(
        "deals_addons",
        "团购/加购",
        recommended ? "done" : "pending",
        430,
        recommended && recommended.servicePackage
          ? "团购优惠约 " + recommended.servicePackage.businessMetrics.couponSavings + " 元，动作 " + actionCount + " 个"
          : "等待服务包合成",
        Boolean(parsed.replanEvent === "budget_high")
      ),
      makeResearchLane(
        "notification",
        "通知/提醒",
        recommended ? "done" : "pending",
        260,
        recommended ? "已生成分享卡片和出发提醒草案" : "等待确认后生成",
        false
      ),
    ].map(function (lane) {
      if (unavailableCalls.length && (lane.id === "activity_ticketing" || lane.id === "restaurant_booking")) {
        return Object.assign({}, lane, { fallbackUsed: true });
      }
      return lane;
    });
  }

  function makeResearchLane(id, label, status, mockLatencyMs, resultSummary, fallbackUsed) {
    return {
      id: id,
      label: label,
      status: status,
      mockLatencyMs: mockLatencyMs,
      resultSummary: resultSummary,
      fallbackUsed: Boolean(fallbackUsed),
    };
  }

  function buildMergerFindings(plans, recommended) {
    if (!plans || !plans.length) return [];
    const findings = plans.slice(0, 3).map(function (plan) {
      return makeLoopFinding(
        plan.id,
        plan.recommended ? "推荐服务包" : "候选服务包",
        plan.name + "，" + plan.totalDuration + "，" + plan.budget + "，评分 " + plan.score + "。",
        plan.recommended ? "recommended" : "done"
      );
    });
    if (recommended) {
      findings.unshift(makeLoopFinding("selected", "推荐选择", "优先展示「" + recommended.name + "」，因为它综合分最高且执行风险更低。", "recommended"));
    }
    return findings;
  }

  function buildVerifierFindings(parsed, plan) {
    if (!plan) return [];
    const queue = createExecutionQueue(plan, parsed);
    const highImpactCount = queue.filter(function (action) { return action.requiresConfirmation; }).length;
    const reservationReady = Boolean(plan.restaurant.canReserve);
    const activityReady = Boolean(!plan.activity.needsBooking || plan.activity.canBook);
    const budget = plan.servicePackage && plan.servicePackage.businessMetrics
      ? plan.servicePackage.businessMetrics.totalBudget + " 元"
      : plan.budget;

    return [
      makeLoopFinding("time", "时间检查", "行程约 " + plan.totalDuration + "，从 " + plan.timeline[0].time + " 到 " + plan.timeline[plan.timeline.length - 1].time + "。", "pass"),
      makeLoopFinding("distance", "距离检查", plan.route.join("；"), plan.route.some(function (item) { return /超出/.test(item); }) ? "warn" : "pass"),
      makeLoopFinding("budget", "预算检查", "服务包预算约 " + budget + "，含活动、餐厅团购和可选加购。", "pass"),
      makeLoopFinding("reservation", "预约检查", activityReady && reservationReady ? "活动/餐厅可进入确认或无需预约。" : "存在无法自动锁定的活动或餐厅，需要人工确认。", activityReady && reservationReady ? "pass" : "warn"),
      makeLoopFinding("confirmation", "确认检查", highImpactCount + " 个高影响动作必须用户确认后才模拟执行。", highImpactCount ? "pass" : "warn"),
    ];
  }

  function buildReviseFindings(parsed, plan, activeReplan) {
    const events = plan && plan.servicePackage ? plan.servicePackage.replanEvents : REPLAN_EVENTS;
    const findings = events.map(function (event) {
      const isActive = Boolean(event.active || (activeReplan && activeReplan.id === event.id));
      return makeLoopFinding(
        event.id,
        event.label,
        isActive ? "已应用：" + event.description : event.description,
        isActive ? "applied" : "ready"
      );
    });

    if (activeReplan && plan) {
      const notice = (plan.issueNotices || []).find(function (item) {
        return /替换|重排|满座|天气|预算|体力|活动|人数/.test(item.title + item.text);
      });
      if (notice) {
        findings.unshift(makeLoopFinding("revise_reason", "重排依据", notice.title + "：" + notice.text, "applied"));
      } else if (parsed.replanEvent === "restaurant_full") {
        findings.unshift(makeLoopFinding("revise_reason", "重排依据", "餐厅满座后触发替换餐厅，并保留团购/排队动作解释。", "applied"));
      }
    }
    return findings;
  }

  function findToolCall(toolCalls, name) {
    return toolCalls.find(function (call) { return call.name === name; }) || null;
  }

  function filterToolCalls(toolCalls, name) {
    return toolCalls.filter(function (call) { return call.name === name; });
  }

  function callTool(toolCalls, name, input, executor) {
    const output = executor();
    toolCalls.push({
      id: name + "-" + String(toolCalls.length + 1).padStart(2, "0"),
      name: name,
      input: input,
      output: output,
      status: "success",
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    });
    return output;
  }

  function getWeather(location, timeRange, parsed) {
    const isEvening = timeRange.startMinutes >= 18 * 60;
    if (parsed && parsed.weatherConcern) {
      return {
        location: location,
        weather: isEvening ? "小雨，夜间湿滑" : "阵雨，户外体验不稳定",
        temperature: isEvening ? "21-24C" : "23-26C",
        outdoor_ok: false,
        risk: "不适合把户外活动作为主方案，优先选择室内或可快速替换的安排",
      };
    }
    return {
      location: location,
      weather: isEvening ? "多云，夜间微风" : "多云转晴",
      temperature: isEvening ? "22-25C" : "24-28C",
      outdoor_ok: true,
      risk: isEvening ? "夜间户外注意返程时间" : "适合短途户外，注意防晒和补水",
    };
  }

  function searchActivities(parsed, weather) {
    return MOCK_ACTIVITIES
      .map(function (activity) {
        const score = scoreActivity(activity, parsed, weather);
        return Object.assign({}, activity, { matchScore: score });
      })
      .filter(function (activity) {
        return activity.matchScore >= 35;
      })
      .sort(function (a, b) {
        return b.matchScore - a.matchScore;
      })
      .slice(0, 8);
  }

  function searchRestaurants(parsed) {
    return MOCK_RESTAURANTS
      .map(function (restaurant) {
        const score = scoreRestaurant(restaurant, parsed);
        return Object.assign({}, restaurant, { matchScore: score });
      })
      .filter(function (restaurant) {
        return restaurant.matchScore >= 30;
      })
      .sort(function (a, b) {
        return b.matchScore - a.matchScore;
      })
      .slice(0, 8);
  }

  function scoreActivity(activity, parsed, weather) {
    let score = 40;
    if (activity.groups.indexOf(parsed.groupType) >= 0) score += 28;
    if (parsed.preferences.some(function (pref) { return pref.key === "near"; }) && activity.distanceKm <= 3) score += 12;
    if (parsed.preferences.some(function (pref) { return pref.key === "relaxed"; }) && activity.tags.indexOf("relaxed") >= 0) score += 10;
    if (parsed.preferences.some(function (pref) { return pref.key === "indoor"; }) && activity.tags.indexOf("indoor") >= 0) score += 10;
    if (parsed.preferences.some(function (pref) { return pref.key === "photo"; }) && activity.tags.indexOf("photo") >= 0) score += 8;
    if (parsed.groupType === "familyKids" && activity.kidsFriendly) score += 16;
    if (parsed.groupType === "familyElders" && activity.eldersFriendly) score += 16;
    if ((parsed.groupType === "friends" || parsed.groupType === "coworkers") && activity.socialFriendly) score += 10;
    if (!weather.outdoor_ok && activity.tags.indexOf("outdoor") >= 0) score -= 25;
    if (parsed.requiresNearFallback && activity.distanceKm > 2) score -= 20;
    if (parsed.replanEvent === "tired_child" && activity.distanceKm > 2) score -= 18;
    if (parsed.replanEvent === "budget_high" && activity.price > 80) score -= 18;
    return score;
  }

  function scoreRestaurant(restaurant, parsed) {
    let score = 38;
    if (restaurant.groups.indexOf(parsed.groupType) >= 0) score += 26;
    if (parsed.preferences.some(function (pref) { return pref.key === "healthy"; }) && restaurant.healthy) score += 18;
    if (parsed.preferences.some(function (pref) { return pref.key === "near"; }) && restaurant.distanceKm <= 2) score += 12;
    if (parsed.preferences.some(function (pref) { return pref.key === "noQueue"; }) && restaurant.waitMinutes <= 10) score += 12;
    if (parsed.preferences.some(function (pref) { return pref.key === "budget"; })) {
      score += restaurant.pricePerPerson <= 100 ? 10 : -8;
    }
    if (parsed.groupType === "familyKids" && restaurant.kidsFriendly) score += 14;
    if (parsed.groupType === "familyElders" && restaurant.eldersFriendly) score += 14;
    if ((parsed.groupType === "friends" || parsed.groupType === "coworkers") && restaurant.chatFriendly) score += 10;
    if (parsed.groupType === "couple" && restaurant.tags.indexOf("date") >= 0) score += 14;
    if (restaurant.availableSlots.length === 0) score -= 12;
    if (parsed.requiresNearFallback && restaurant.distanceKm > 2) score -= 20;
    if (parsed.replanEvent === "budget_high" && restaurant.pricePerPerson > 100) score -= 18;
    return score;
  }

  function buildPlans(parsed, activities, restaurants, toolCalls, weather) {
    const strategies = parsed.requiresNearFallback
      ? [{ name: "现实替代：近距离轻安排", tags: ["near", "relaxed", "quiet", "indoor"], restaurantTags: ["near", "quiet", "healthy"] }]
      : STRATEGIES[parsed.groupType];
    const usedActivities = {};
    const plans = strategies.map(function (strategy, index) {
      let activity = pickByStrategy(activities, strategy.tags, usedActivities) || activities[index % activities.length];
      if (activity) usedActivities[activity.id] = true;

      let activityReplacement = null;
      if (parsed.replanEvent === "activity_sold_out" && index === 0 && activity) {
        const probeArrival = minutesToTime(parsed.timeRange.startMinutes + estimateRoute(activity.distanceKm).minutes);
        const soldOutAvailability = callTool(toolCalls, "check_availability", {
          target_id: activity.id,
          time: probeArrival,
          party_size: parsed.partySize,
        }, function () {
          return makeUnavailableAvailability(activity, probeArrival, parsed.partySize, "活动突发无票/限流，无法自动锁定原计划");
        });
        const fallbackActivity = pickActivityFallback(activities, strategy.tags, usedActivities, activity, parsed);
        if (fallbackActivity) {
          usedActivities[fallbackActivity.id] = true;
          activityReplacement = {
            from: activity.name,
            to: fallbackActivity.name,
            reason: soldOutAvailability.reason + "，已替换为同人群、同半径备选",
          };
          activity = fallbackActivity;
        }
      }

      let routeToActivity = callTool(toolCalls, "check_route", {
        origin: parsed.location,
        destination: activity.name,
        transport_mode: activity.distanceKm <= 1.8 ? "步行" : "短途打车",
      }, function () {
        return checkRoute(parsed.location, activity.name, activity.distanceKm);
      });

      const projectedActivityArrival = minutesToTime(parsed.timeRange.startMinutes + routeToActivity.minutes);
      let activityAvailability = activity.needsBooking
        ? callTool(toolCalls, "check_availability", {
          target_id: activity.id,
          time: projectedActivityArrival,
          party_size: parsed.partySize,
        }, function () {
          return checkAvailability(activity, projectedActivityArrival, parsed.partySize);
        })
        : makeOpenAccessAvailability(projectedActivityArrival, parsed.partySize);
      const activityStartTime = activityAvailability.available && activityAvailability.selected_slot
        ? activityAvailability.selected_slot
        : projectedActivityArrival;

      const restaurantPick = pickRestaurantWithFallback(restaurants, strategy.restaurantTags, parsed, toolCalls, activity, activityStartTime);
      const restaurant = restaurantPick.restaurant;

      const routeToRestaurant = callTool(toolCalls, "check_route", {
        origin: activity.name,
        destination: restaurant.name,
        transport_mode: restaurant.distanceKm <= 1.8 ? "步行" : "短途打车",
      }, function () {
        return checkRoute(activity.name, restaurant.name, Math.max(0.8, Math.abs(activity.distanceKm - restaurant.distanceKm) + 0.8));
      });

      const timeline = buildTimeline(parsed, activity, restaurant, routeToActivity, routeToRestaurant, activityAvailability, restaurantPick.availability);
      const scoring = scorePlan(parsed, activity, restaurant, routeToActivity, routeToRestaurant, restaurantPick.replaced, activityAvailability, restaurantPick.availability, weather);
      const activityInfo = formatActivity(activity, activityAvailability);
      const restaurantInfo = formatRestaurant(restaurant, restaurantPick.availability);
      const risks = buildRisks(parsed, activity, restaurant, restaurantPick, activityAvailability, weather, activityReplacement);
      const plan = {
        id: "plan-" + (index + 1),
        name: strategy.name,
        fit: parsed.groupLabel,
        totalDuration: timeline.totalDurationLabel,
        timeline: timeline.items,
        activity: activityInfo,
        restaurant: restaurantInfo,
        route: [
          routeToActivity.summary,
          routeToRestaurant.summary,
        ],
        budget: estimateBudget(activity, restaurant, parsed.partySize),
        reason: buildReason(parsed, activity, restaurant, restaurantPick.replaced, activityAvailability, restaurantPick.availability, activityReplacement),
        risks: risks,
        issueNotices: buildIssueNotices(parsed, activity, restaurantPick, activityAvailability, restaurantPick.availability, weather, activityReplacement),
        score: scoring.total,
        scoreDetails: scoring.details,
        recommendationReasons: buildRecommendationReasons(parsed, activity, restaurant, restaurantPick.replaced, activityAvailability, restaurantPick.availability, weather, risks, activityReplacement),
      };
      plan.servicePackage = buildServicePackage(parsed, plan, activity, restaurant, routeToActivity, routeToRestaurant, activityAvailability, restaurantPick, weather, activityReplacement);
      plan.actionsPreview = previewActions(activityInfo, restaurantInfo, parsed, plan.servicePackage);
      return plan;
    });

    return plans
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .map(function (plan, index) {
        return Object.assign({}, plan, { recommended: index === 0 });
      });
  }

  function pickByStrategy(items, tags, usedMap) {
    const sorted = items
      .filter(function (item) { return !usedMap[item.id]; })
      .map(function (item) {
        const tagScore = tags.reduce(function (sum, tag) {
          return sum + (item.tags.indexOf(tag) >= 0 ? 1 : 0);
        }, 0);
        return Object.assign({}, item, { strategyScore: item.matchScore + tagScore * 13 });
      })
      .sort(function (a, b) {
        return b.strategyScore - a.strategyScore;
      });
    return sorted[0] || items[0];
  }

  function pickActivityFallback(items, tags, usedMap, originalActivity, parsed) {
    const fallbackTags = tags.concat(["indoor", "near", "relaxed"]);
    const sorted = items
      .filter(function (item) {
        const groupFit = item.groups.indexOf(parsed.groupType) >= 0 ||
          (parsed.groupType === "familyKids" && item.kidsFriendly) ||
          (parsed.groupType === "familyElders" && item.eldersFriendly);
        return item.id !== originalActivity.id && !usedMap[item.id] && groupFit;
      })
      .map(function (item) {
        let score = fallbackTags.reduce(function (sum, tag) {
          return sum + (item.tags.indexOf(tag) >= 0 ? 2 : 0);
        }, 0);
        if (Math.abs(item.distanceKm - originalActivity.distanceKm) <= 2) score += 6;
        if (!item.needsBooking) score += 5;
        if (item.needsBooking && item.availableSlots && item.availableSlots.length) score += 3;
        if (parsed.groupType === "familyKids" && item.kidsFriendly) score += 5;
        if (parsed.groupType === "familyElders" && item.eldersFriendly) score += 5;
        return { item: item, score: score };
      })
      .sort(function (a, b) {
        return b.score - a.score || a.item.distanceKm - b.item.distanceKm;
      });
    return sorted.length ? sorted[0].item : null;
  }

  function pickRestaurantWithFallback(restaurants, tags, parsed, toolCalls, activity, activityStartTime) {
    const sorted = restaurants
      .map(function (item) {
        const tagScore = tags.reduce(function (sum, tag) {
          return sum + (item.tags.indexOf(tag) >= 0 ? 1 : 0);
        }, 0);
        return Object.assign({}, item, { strategyScore: item.matchScore + tagScore * 14 });
      })
      .sort(function (a, b) {
        return b.strategyScore - a.strategyScore;
      });

    let firstUnavailable = null;
    for (let index = 0; index < sorted.length; index += 1) {
      const candidate = sorted[index];
      const requestedTime = estimateRestaurantRequestTime(parsed, activity, activityStartTime, candidate);
      const availability = callTool(toolCalls, "check_availability", {
        target_id: candidate.id,
        time: requestedTime,
        party_size: parsed.partySize,
      }, function () {
        if (parsed.replanEvent === "restaurant_full" && index === 0) {
          return {
            available: false,
            requested_time: requestedTime,
            available_slots: [],
            reason: "突发满座，已触发美团候补餐厅重排",
          };
        }
        return checkAvailability(candidate, requestedTime, parsed.partySize);
      });

      if (availability.available) {
        return {
          restaurant: candidate,
          availability: availability,
          replaced: firstUnavailable
            ? { from: firstUnavailable.restaurant.name, to: candidate.name, reason: firstUnavailable.availability.reason || "目标时间段无可预约座位" }
            : null,
        };
      }

      if (!firstUnavailable) {
        firstUnavailable = { restaurant: candidate, availability: availability };
      }
    }

    return {
      restaurant: firstUnavailable.restaurant,
      availability: firstUnavailable.availability,
      replaced: null,
      allUnavailable: true,
    };
  }

  function checkRoute(origin, destination, distanceKm) {
    const estimate = estimateRoute(distanceKm);
    return {
      origin: origin,
      destination: destination,
      distance_km: Number(distanceKm.toFixed(1)),
      minutes: estimate.minutes,
      transport_mode: estimate.mode,
      over_limit: distanceKm > 5,
      summary: origin + " -> " + destination + "，" + estimate.mode + "约 " + estimate.minutes + " 分钟",
    };
  }

  function checkAvailability(target, time, partySize) {
    const slots = (target.availableSlots || ["14:30", "15:00", "16:00"]).slice().sort(function (a, b) {
      return timeToMinutes(a) - timeToMinutes(b);
    });
    const requestedMinutes = timeToMinutes(time);
    if (!Number.isFinite(requestedMinutes)) {
      return {
        available: false,
        requested_time: time,
        available_slots: slots,
        reason: "请求时间无效，无法自动预约",
      };
    }
    if (target.ticketInventory && partySize > target.ticketInventory) {
      return {
        available: false,
        requested_time: time,
        available_slots: slots,
        party_size: partySize,
        reason: "剩余票量不足，当前仅能锁定 " + target.ticketInventory + " 个名额",
      };
    }
    if (target.seatCapacity && partySize > target.seatCapacity) {
      return {
        available: false,
        requested_time: time,
        available_slots: slots,
        party_size: partySize,
        reason: "当前可订桌型最多容纳 " + target.seatCapacity + " 人，需要替换餐厅或人工确认",
      };
    }
    const matchingSlots = slots.filter(function (slot) {
      const diff = timeToMinutes(slot) - requestedMinutes;
      return diff >= 0 && diff <= 30;
    });
    if (!matchingSlots.length) {
      return {
        available: false,
        requested_time: time,
        available_slots: slots,
        reason: time + " 后 30 分钟内无可预约时段",
      };
    }
    const slot = matchingSlots[0];
    return {
      available: true,
      requested_time: time,
      available_slots: slots,
      selected_slot: slot,
      party_size: partySize,
      note: "可预约 " + slot,
    };
  }

  function estimateRoute(distanceKm) {
    const mode = distanceKm <= 1.8 ? "步行" : "短途打车";
    const minutes = mode === "步行"
      ? Math.max(10, Math.round(distanceKm * 14))
      : Math.max(12, Math.round(distanceKm * 7 + 8));
    return { mode: mode, minutes: minutes };
  }

  function estimateRestaurantRequestTime(parsed, activity, activityStartTime, restaurant) {
    const activityEndMinutes = timeToMinutes(activityStartTime) + Math.round(activity.durationHours * 60);
    const distanceKm = Math.max(0.8, Math.abs(activity.distanceKm - restaurant.distanceKm) + 0.8);
    const routeMinutes = estimateRoute(distanceKm).minutes;
    const projectedArrival = activityEndMinutes + routeMinutes;
    return minutesToTime(Math.max(projectedArrival, timeToMinutes(pickDinnerTime(parsed))));
  }

  function makeOpenAccessAvailability(time, partySize) {
    return {
      available: true,
      open_access: true,
      requested_time: time,
      selected_slot: time,
      available_slots: [time],
      party_size: partySize,
      note: "无需预约，按预计到达时间入场",
    };
  }

  function makeUnavailableAvailability(target, time, partySize, reason) {
    return {
      available: false,
      requested_time: time,
      available_slots: target.availableSlots || [],
      party_size: partySize,
      reason: reason,
    };
  }

  function pickDinnerTime(parsed) {
    if (parsed.timeRange.startMinutes >= 18 * 60) return "19:00";
    if (parsed.timeRange.durationHours <= 2) return minutesToTime(parsed.timeRange.startMinutes + 70);
    if (parsed.groupType === "familyKids" || parsed.groupType === "familyElders") return "17:30";
    return "19:30";
  }

  function buildTimeline(parsed, activity, restaurant, routeToActivity, routeToRestaurant, activityAvailability, restaurantAvailability) {
    const start = parsed.timeRange.startMinutes;
    const depart = start;
    const projectedActivityArrival = depart + routeToActivity.minutes;
    const arriveActivity = activityAvailability.available && activityAvailability.selected_slot
      ? timeToMinutes(activityAvailability.selected_slot)
      : projectedActivityArrival;
    const activityEnd = arriveActivity + Math.round(activity.durationHours * 60);
    const projectedRestaurantArrival = activityEnd + routeToRestaurant.minutes;
    const arriveRestaurant = restaurantAvailability.available && restaurantAvailability.selected_slot
      ? timeToMinutes(restaurantAvailability.selected_slot)
      : projectedRestaurantArrival;
    const dinnerMinutes = parsed.requiresNearFallback ? 35 : 80;
    const end = arriveRestaurant + dinnerMinutes;

    const items = [
      { time: minutesToTime(depart), title: "出发", detail: routeToActivity.summary },
      { time: minutesToTime(arriveActivity), title: activity.name, detail: activity.type + "，预计 " + formatHours(activity.durationHours) + bookingNote(activityAvailability, activity.needsBooking) },
      { time: minutesToTime(activityEnd), title: "转场", detail: routeToRestaurant.summary },
      { time: minutesToTime(arriveRestaurant), title: restaurant.name, detail: restaurant.cuisine + "，预计用餐 " + dinnerMinutes + " 分钟" + bookingNote(restaurantAvailability, true) },
      { time: minutesToTime(end), title: "结束/返程", detail: "形成最终行程摘要和提醒" },
    ];

    const totalMinutes = end - start;
    return {
      items: items,
      totalDurationLabel: Math.round(totalMinutes / 6) / 10 + " 小时",
    };
  }

  function bookingNote(availability, needsBooking) {
    if (!needsBooking) return "，无需预约";
    if (availability.available && availability.selected_slot) return "，可预约 " + availability.selected_slot;
    return "，暂无可自动预约时段";
  }

  function scorePlan(parsed, activity, restaurant, routeToActivity, routeToRestaurant, replaced, activityAvailability, restaurantAvailability, weather) {
    const details = [];
    const totalDistance = routeToActivity.distance_km + routeToRestaurant.distance_km;
    const travelMinutes = routeToActivity.minutes + routeToRestaurant.minutes;

    let distanceScore = 20 - Math.round(totalDistance * 2.4);
    if (hasPreference(parsed, "near") && routeToActivity.distance_km <= 3) distanceScore += 3;
    if (parsed.requiresNearFallback && routeToActivity.distance_km <= 2) distanceScore += 4;
    if (routeToActivity.over_limit || routeToRestaurant.over_limit) distanceScore -= 8;
    details.push(makeScoreDetail("distance", "距离", distanceScore, 20, "全程转场约 " + totalDistance.toFixed(1) + " km"));

    let groupScore = 8;
    if (activity.groups.indexOf(parsed.groupType) >= 0) groupScore += 5;
    if (restaurant.groups.indexOf(parsed.groupType) >= 0) groupScore += 4;
    if (parsed.groupType === "familyKids" && activity.kidsFriendly && restaurant.kidsFriendly) groupScore += 3;
    if (parsed.groupType === "familyElders" && activity.eldersFriendly && restaurant.eldersFriendly) groupScore += 3;
    if ((parsed.groupType === "friends" || parsed.groupType === "coworkers") && activity.socialFriendly && restaurant.chatFriendly) groupScore += 3;
    details.push(makeScoreDetail("group", "同行适配", groupScore, 20, GROUPS[parsed.groupType].summary));

    let preferenceScore = 7;
    if (hasPreference(parsed, "near")) preferenceScore += activity.distanceKm <= 3 && restaurant.distanceKm <= 3 ? 3 : -3;
    if (hasPreference(parsed, "relaxed")) preferenceScore += activity.tags.indexOf("relaxed") >= 0 || activity.durationHours <= 1.5 ? 3 : -2;
    if (hasPreference(parsed, "healthy")) preferenceScore += restaurant.healthy ? 4 : -3;
    if (hasPreference(parsed, "noQueue")) preferenceScore += restaurant.waitMinutes <= 10 ? 3 : -3;
    if (hasPreference(parsed, "indoor")) preferenceScore += activity.tags.indexOf("indoor") >= 0 ? 3 : -3;
    if (!hasPreference(parsed, "outdoor") && activity.tags.indexOf("outdoor") >= 0 && hasPreference(parsed, "relaxed")) preferenceScore -= 6;
    if (weather && !weather.outdoor_ok && activity.tags.indexOf("outdoor") >= 0) preferenceScore -= 5;
    details.push(makeScoreDetail("preference", "偏好匹配", preferenceScore, 18, summarizePreferences(parsed)));

    let reservationScore = 7;
    reservationScore += activity.needsBooking ? (activityAvailability.available ? 4 : -4) : 4;
    reservationScore += restaurantAvailability.available ? 5 : -6;
    reservationScore += restaurant.waitMinutes <= 15 ? 2 : restaurant.waitMinutes > 30 ? -4 : 0;
    if (replaced) reservationScore -= 1;
    details.push(makeScoreDetail("reservation", "预约稳定性", reservationScore, 18, reservationSummary(activity, restaurant, replaced, activityAvailability, restaurantAvailability)));

    let effortScore = 14 - Math.round(travelMinutes / 9);
    if (hasPreference(parsed, "relaxed") && activity.durationHours <= 1.5) effortScore += 2;
    if (parsed.timeRange.durationHours <= 2 && activity.durationHours > 1.8) effortScore -= 3;
    details.push(makeScoreDetail("effort", "节奏负担", effortScore, 14, "路上约 " + travelMinutes + " 分钟，活动约 " + formatHours(activity.durationHours)));

    let budgetScore = 8;
    if (restaurant.pricePerPerson <= 90) budgetScore += 3;
    if (restaurant.pricePerPerson > 140) budgetScore -= 4;
    if (activity.price <= 50) budgetScore += 1;
    if (activity.price > 120) budgetScore -= 2;
    if (hasPreference(parsed, "budget")) budgetScore += restaurant.pricePerPerson <= 100 ? 2 : -3;
    details.push(makeScoreDetail("budget", "预算", budgetScore, 12, "活动 " + formatPrice(activity.price) + "，餐厅人均 " + restaurant.pricePerPerson + " 元"));

    let riskPenalty = 0;
    if (parsed.warnings.length) riskPenalty += 4;
    if (replaced) riskPenalty += restaurantAvailability.available ? 1 : 3;
    if (weather && !weather.outdoor_ok && activity.tags.indexOf("outdoor") >= 0) riskPenalty += 5;
    if (activity.needsBooking && !activityAvailability.available) riskPenalty += 4;
    if (!restaurantAvailability.available) riskPenalty += 5;
    if (routeToActivity.over_limit || routeToRestaurant.over_limit) riskPenalty += 6;
    if (riskPenalty) {
      details.push({
        key: "risk",
        label: "风险扣分",
        score: -riskPenalty,
        max: 0,
        summary: "存在需解释或人工接管的风险",
      });
    }

    const total = clampScore(details.reduce(function (sum, item) {
      return sum + item.score;
    }, 0), 0, 96);

    return {
      total: total,
      details: details,
    };
  }

  function makeScoreDetail(key, label, score, max, summary) {
    return {
      key: key,
      label: label,
      score: clampScore(score, 0, max),
      max: max,
      summary: summary,
    };
  }

  function clampScore(score, min, max) {
    return Math.max(min, Math.min(max, Math.round(score)));
  }

  function hasPreference(parsed, key) {
    return parsed.preferences.some(function (pref) {
      return pref.key === key;
    });
  }

  function summarizePreferences(parsed) {
    return parsed.preferenceLabels.length ? parsed.preferenceLabels.slice(0, 3).join(" / ") : "按中等预算、轻松节奏处理";
  }

  function reservationSummary(activity, restaurant, replaced, activityAvailability, restaurantAvailability) {
    const parts = [];
    parts.push(activity.needsBooking ? (activityAvailability.available ? "活动可订" : "活动需人工确认") : "活动免预约");
    parts.push(restaurantAvailability.available ? "餐厅可订" : "餐厅需人工确认");
    if (replaced) parts.push("已替换无座餐厅");
    parts.push("排队 " + restaurant.waitMinutes + " 分钟");
    return parts.join("，");
  }

  function formatPrice(price) {
    return price === 0 ? "免费" : price + " 元/人";
  }

  function formatActivity(activity, availability) {
    return {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      distance: activity.distanceKm + " km",
      open: activity.open,
      duration: formatHours(activity.durationHours),
      price: activity.price === 0 ? "免费" : "约 " + activity.price + " 元/人",
      needsBooking: activity.needsBooking,
      canBook: activity.needsBooking ? Boolean(availability.available && availability.selected_slot) : false,
      requestedTime: activity.needsBooking ? availability.requested_time : null,
      selectedSlot: activity.needsBooking && availability.available ? availability.selected_slot : null,
      availableSlots: availability.available_slots || [],
      unavailableReason: activity.needsBooking && !availability.available ? availability.reason : null,
      tags: [
        activity.kidsFriendly ? "儿童友好" : null,
        activity.eldersFriendly ? "长辈友好" : null,
        activity.socialFriendly ? "适合聊天" : null,
        activity.tags.indexOf("indoor") >= 0 ? "室内" : null,
      ].filter(Boolean),
    };
  }

  function formatRestaurant(restaurant, availability) {
    return {
      id: restaurant.id,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      distance: restaurant.distanceKm + " km",
      price: "人均约 " + restaurant.pricePerPerson + " 元",
      wait: restaurant.waitMinutes + " 分钟",
      canReserve: Boolean(availability.available && availability.selected_slot),
      requestedTime: availability.requested_time,
      selectedSlot: availability.available ? availability.selected_slot : null,
      availableSlots: availability.available_slots || [],
      unavailableReason: availability.available ? null : availability.reason,
      tags: [
        restaurant.kidsFriendly ? "儿童友好" : null,
        restaurant.eldersFriendly ? "长辈友好" : null,
        restaurant.healthy ? "低负担" : null,
        restaurant.chatFriendly ? "适合聊天" : null,
      ].filter(Boolean),
    };
  }

  function estimateBudget(activity, restaurant, partySize) {
    const total = Math.round((activity.price + restaurant.pricePerPerson) * partySize);
    return "约 " + total + " 元 / " + partySize + " 人";
  }

  function buildReason(parsed, activity, restaurant, replaced, activityAvailability, restaurantAvailability, activityReplacement) {
    const parts = [];
    parts.push("匹配" + parsed.groupLabel + "，" + GROUPS[parsed.groupType].summary);
    if (parsed.replanEvent === "party_changed") parts.push("已按 " + parsed.partySize + " 人重新核验票量、座位和预算");
    if (activityReplacement) parts.push("原活动无票/限流，已替换为「" + activityReplacement.to + "」");
    parts.push(activity.name + "距离 " + activity.distanceKm + " km，节奏可控");
    if (activity.needsBooking && activityAvailability.available) parts.push(activity.name + "可预约 " + activityAvailability.selected_slot);
    if (restaurantAvailability.available) parts.push(restaurant.name + "可预约 " + restaurantAvailability.selected_slot);
    if (!restaurantAvailability.available) parts.push("当前餐厅无可自动预约时段，需要人工确认或稍后重查");
    if (restaurant.healthy) parts.push("餐厅满足健康/低负担偏好");
    if (replaced) parts.push("已避开无座餐厅，切换到可预约备选");
    return parts.join("；") + "。";
  }

  function buildRisks(parsed, activity, restaurant, restaurantPick, activityAvailability, weather, activityReplacement) {
    const risks = [];
    parsed.warnings.forEach(function (warning) { risks.push(warning); });
    if (parsed.replanEvent === "party_changed") risks.push("同行人数临时变化，已重新检查票量、座位和预算");
    if (activityReplacement) risks.push(activityReplacement.from + "无票/限流，已替换为「" + activityReplacement.to + "」：" + activityReplacement.reason);
    if (activity.tags.indexOf("outdoor") >= 0 && weather && !weather.outdoor_ok) risks.push("当前天气不适合户外，建议优先保留室内备选或缩短户外停留");
    if (activity.tags.indexOf("outdoor") >= 0 && (!weather || weather.outdoor_ok)) risks.push("户外活动需根据临场天气调整");
    if (restaurant.waitMinutes > 20) risks.push("餐厅排队可能偏长，建议提前预约");
    if (restaurantPick.replaced) risks.push(restaurantPick.replaced.from + "无座，已替换：" + restaurantPick.replaced.reason);
    if (activity.needsBooking && activityAvailability.available) risks.push("活动需要预约，执行前必须确认");
    if (activity.needsBooking && !activityAvailability.available) risks.push("活动当前无可自动预约时段，需要人工确认或替换活动");
    if (!restaurantPick.availability.available) risks.push("当前无可自动预约餐厅，需要人工确认或稍后重查");
    return risks.length ? risks : ["暂无明显风险，执行前确认预约即可"];
  }

  function buildIssueNotices(parsed, activity, restaurantPick, activityAvailability, restaurantAvailability, weather, activityReplacement) {
    const notices = [];
    parsed.warnings.forEach(function (warning) {
      notices.push({ tone: "amber", title: "约束冲突", text: warning });
    });
    if (parsed.replanEvent === "party_changed") {
      notices.push({
        tone: "amber",
        title: "人数已变化",
        text: "已按 " + parsed.partySize + " 人重新检查活动票量、餐厅座位和服务包预算。",
      });
    }
    if (activityReplacement) {
      notices.push({
        tone: "amber",
        title: "活动已替换",
        text: activityReplacement.from + "无票/限流，已切换到「" + activityReplacement.to + "」。",
      });
    }
    if (weather && !weather.outdoor_ok && activity.tags.indexOf("outdoor") >= 0) {
      notices.push({ tone: "red", title: "天气风险", text: weather.risk });
    }
    if (restaurantPick.replaced) {
      notices.push({
        tone: "amber",
        title: "餐厅已替换",
        text: restaurantPick.replaced.from + "无座，已切换到可执行备选。",
      });
    }
    if (activity.needsBooking && !activityAvailability.available) {
      notices.push({
        tone: "amber",
        title: "活动需人工确认",
        text: activityAvailability.reason || "当前无可自动预约时段。",
      });
    }
    if (!restaurantAvailability.available) {
      notices.push({
        tone: "red",
        title: "餐厅需人工接管",
        text: restaurantAvailability.reason || "当前无可自动预约时段。",
      });
    }
    return notices;
  }

  function buildRecommendationReasons(parsed, activity, restaurant, replaced, activityAvailability, restaurantAvailability, weather, risks, activityReplacement) {
    const reasons = [];
    if (parsed.warnings.length) reasons.push("识别到约束冲突，优先生成近距离可执行替代。");
    if (parsed.replanEvent === "party_changed") reasons.push("人数变化后已重新校验座位、票量和预算。");
    if (activityReplacement) reasons.push("原活动无票/限流，已自动替换为同人群备选。");
    if (replaced) reasons.push("首选餐厅无座，已自动切换到可预约备选。");
    if (activity.distanceKm <= 2.5) reasons.push(activity.name + "距离 " + activity.distanceKm + " km，转场负担低。");
    if (parsed.groupType === "familyKids" && activity.kidsFriendly && restaurant.kidsFriendly) reasons.push("活动和餐厅都对孩子友好。");
    if (parsed.groupType === "familyElders" && activity.eldersFriendly && restaurant.eldersFriendly) reasons.push("活动和餐厅都更适合长辈，少折腾。");
    if ((parsed.groupType === "friends" || parsed.groupType === "coworkers") && activity.socialFriendly && restaurant.chatFriendly) reasons.push("活动和餐厅都适合多人聊天。");
    if (hasPreference(parsed, "healthy") && restaurant.healthy) reasons.push("餐厅符合健康/低负担餐饮偏好。");
    if (hasPreference(parsed, "budget") && restaurant.pricePerPerson <= 100) reasons.push("人均预算更可控。");
    if (restaurantAvailability.available) reasons.push("餐厅可预约 " + restaurantAvailability.selected_slot + "，执行确定性更高。");
    if (activity.needsBooking && activityAvailability.available) reasons.push("活动可预约 " + activityAvailability.selected_slot + "。");
    if (weather && !weather.outdoor_ok && activity.tags.indexOf("indoor") >= 0) reasons.push("天气不稳，优先选择室内活动。");
    if (!restaurantAvailability.available || (activity.needsBooking && !activityAvailability.available)) reasons.push("不可自动预约的动作已转为人工确认，不伪造成成功。");
    if (!reasons.length && risks.length) reasons.push(risks[0]);
    return uniqueStrings(reasons).slice(0, 4);
  }

  function uniqueStrings(items) {
    const seen = {};
    return items.filter(function (item) {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  function buildServicePackage(parsed, plan, activity, restaurant, routeToActivity, routeToRestaurant, activityAvailability, restaurantPick, weather, activityReplacement) {
    const deal = buildDeal(parsed, activity, restaurant);
    const addOn = pickAddOn(parsed);
    const diningTime = plan.timeline[3].time;
    const businessMetrics = buildBusinessMetrics(parsed, activity, restaurant, deal, addOn, diningTime);

    return {
      title: "美团闲时服务包",
      itineraryItems: plan.timeline.map(function (item, index) {
        return Object.assign({}, item, {
          type: ["depart", "activity", "transfer", "restaurant", "finish"][index] || "step",
        });
      }),
      meituanActions: buildMeituanActions(parsed, plan, activity, restaurant, activityAvailability, restaurantPick.availability, deal, addOn, activityReplacement, restaurantPick.replaced),
      businessMetrics: businessMetrics,
      replanEvents: REPLAN_EVENTS.map(function (event) {
        return Object.assign({}, event, {
          active: parsed.replanEvent === event.id,
        });
      }),
      deal: deal,
      addOn: addOn,
      offPeakStrategy: {
        diningTime: diningTime,
        isOffPeak: !isPeakTime(diningTime),
        note: isPeakTime(diningTime)
          ? "当前仍接近高峰，建议保留 Plan B"
          : "已避开 12:00-13:30 / 18:00-19:30 高峰窗口",
      },
      routeSummary: {
        toActivity: routeToActivity.summary,
        toRestaurant: routeToRestaurant.summary,
        weather: weather.risk,
      },
    };
  }

  function buildDeal(parsed, activity, restaurant) {
    const partySize = parsed.partySize || GROUPS[parsed.groupType].defaultPartySize;
    const restaurantOriginal = restaurant.pricePerPerson * partySize;
    const baseSaving = Math.max(12, Math.round(restaurantOriginal * 0.12));
    const saving = parsed.replanEvent === "budget_high" ? baseSaving + 20 : baseSaving;
    return {
      id: "deal-" + restaurant.id,
      name: restaurant.name + " " + partySize + " 人闲时团购套餐",
      originalPrice: restaurantOriginal,
      price: Math.max(0, restaurantOriginal - saving),
      saving: saving,
      coupon: "闲时立减 " + saving + " 元",
    };
  }

  function pickAddOn(parsed) {
    return MOCK_ADD_ONS[parsed.groupType] || null;
  }

  function buildBusinessMetrics(parsed, activity, restaurant, deal, addOn, diningTime) {
    const partySize = parsed.partySize || GROUPS[parsed.groupType].defaultPartySize;
    const activityCost = activity.price * partySize;
    const addOnCost = addOn ? addOn.price : 0;
    const addOnSaving = addOn ? addOn.saving : 0;
    const peakWait = restaurant.waitMinutes + (isPeakTime(diningTime) ? 15 : 35);
    const waitSavedMinutes = Math.max(0, peakWait - restaurant.waitMinutes);
    const couponSavings = deal.saving + addOnSaving;
    return {
      waitSavedMinutes: waitSavedMinutes,
      couponSavings: couponSavings,
      totalBudget: activityCost + deal.price + addOnCost,
      originalBudget: activityCost + deal.originalPrice + addOnCost + addOnSaving,
      offPeakScore: isPeakTime(diningTime) ? 68 : 92,
      decisionTimeSavedMinutes: 35 + Math.min(25, partySize * 4),
      conversionActions: 3 + (addOn ? 1 : 0),
      summary: "预计少排队 " + waitSavedMinutes + " 分钟，优惠约 " + couponSavings + " 元，预算约 " + (activityCost + deal.price + addOnCost) + " 元",
    };
  }

  function buildMeituanActions(parsed, plan, activity, restaurant, activityAvailability, restaurantAvailability, deal, addOn, activityReplacement, restaurantReplacement) {
    const actions = [];
    if (parsed.replanEvent || activityReplacement || restaurantReplacement) {
      actions.push({
        id: "replan-check",
        type: "replan_notice",
        title: "重排校验",
        target: getReplanActionTarget(parsed, activityReplacement, restaurantReplacement),
        time: "生成方案时",
        impact: "低影响动作，用于展示异常已被识别并重算服务包",
        requiresConfirmation: false,
        status: "pending",
      });
    }

    if (activity.needsBooking) {
      if (activityAvailability.available && activityAvailability.selected_slot) {
        actions.push({
          id: "book-ticket",
          type: "book_ticket",
          title: "购买活动票",
          target: activity.name,
          time: activityAvailability.selected_slot,
          selectedSlot: activityAvailability.selected_slot,
          impact: "会锁定活动票/预约名额",
          requiresConfirmation: true,
          status: "pending",
        });
      } else {
        actions.push({
          id: "manual-activity-check",
          type: "manual_activity_check",
          title: "人工确认活动票",
          target: activity.name,
          time: activityAvailability.requested_time || plan.timeline[1].time,
          impact: activityAvailability.reason || "当前无可自动预约时段",
          requiresConfirmation: false,
          status: "pending",
        });
      }
    }

    if (restaurantAvailability.available && restaurantAvailability.selected_slot) {
      actions.push({
        id: "reserve-table",
        type: "reserve_table",
        title: "订座",
        target: restaurant.name,
        time: restaurantAvailability.selected_slot,
        selectedSlot: restaurantAvailability.selected_slot,
        impact: "会提交到店人数和时间",
        requiresConfirmation: true,
        status: "pending",
      });
    } else {
      actions.push({
        id: "manual-restaurant-check",
        type: "manual_restaurant_check",
        title: "人工确认餐厅",
        target: restaurant.name,
        time: restaurantAvailability.requested_time || plan.timeline[3].time,
        impact: restaurantAvailability.reason || "当前无可自动预约时段",
        requiresConfirmation: false,
        status: "pending",
      });
    }

    actions.push({
      id: "join-queue",
      type: "join_queue",
      title: "领取排队号",
      target: restaurant.name,
      time: plan.timeline[3].time,
      queueToken: restaurantAvailability.available ? "Q-" + restaurant.id : null,
      impact: "会模拟领取到店排队号，低影响",
      requiresConfirmation: false,
      status: "pending",
    });

    actions.push({
      id: "buy-deal",
      type: "buy_deal",
      title: "购买团购套餐",
      target: deal.name,
      time: "确认后",
      dealId: deal.id,
      price: deal.price,
      impact: "会产生模拟团购券订单",
      requiresConfirmation: true,
      status: "pending",
    });

    if (addOn) {
      actions.push({
        id: "order-addon",
        type: "order_item",
        title: "下单加购",
        target: addOn.name,
        time: addOn.deliveryTime,
        itemId: addOn.id,
        price: addOn.price,
        impact: "会产生模拟闪购/外卖订单",
        requiresConfirmation: true,
        status: "pending",
      });
    }

    if (parsed.groupType !== "solo") {
      const shareCard = buildShareCard(plan, parsed);
      actions.push({
        id: "send-message",
        type: "send_message",
        title: "发送分享卡片",
        target: GROUPS[parsed.groupType].messageTarget,
        time: "现在",
        impact: "会把集合时间、地点和订单状态发给对方",
        requiresConfirmation: true,
        status: "pending",
        content: buildMessage(plan, parsed),
        shareCard: shareCard,
      });
    }

    actions.push({
      id: "set-reminder",
      type: "set_reminder",
      title: "设置出发提醒",
      target: "出发前 20 分钟",
      time: minutesToTime(Math.max(0, timeToMinutes(plan.timeline[0].time) - 20)),
      impact: "低影响动作，只生成提醒建议",
      requiresConfirmation: false,
      status: "pending",
    });

    return actions;
  }

  function isPeakTime(time) {
    const minutes = timeToMinutes(time);
    return (minutes >= 12 * 60 && minutes < 13 * 60 + 30) ||
      (minutes >= 18 * 60 && minutes < 19 * 60 + 30);
  }

  function previewActions(activity, restaurant, parsed, servicePackage) {
    if (servicePackage && servicePackage.meituanActions) {
      return servicePackage.meituanActions.map(function (action) {
        return action.title;
      }).slice(0, 6);
    }
    const actions = [];
    if (activity.canBook) actions.push("预约活动");
    if (activity.needsBooking && !activity.canBook) actions.push("人工确认活动");
    if (restaurant.canReserve) actions.push("预约餐厅");
    if (!restaurant.canReserve) actions.push("人工确认餐厅");
    if (parsed.groupType === "couple") actions.push("可选鲜花/小礼物");
    if (parsed.groupType !== "solo") actions.push("发送集合消息");
    actions.push("设置出发提醒");
    return actions;
  }

  function createExecutionQueue(plan, parsed) {
    if (plan.servicePackage && plan.servicePackage.meituanActions) {
      return plan.servicePackage.meituanActions.map(function (action) {
        return Object.assign({}, action);
      });
    }

    const actions = [];
    if (plan.activity.needsBooking) {
      if (plan.activity.canBook && plan.activity.selectedSlot) {
        actions.push({
          id: "book-activity",
          type: "book_activity",
          title: "预约活动",
          target: plan.activity.name,
          time: plan.activity.selectedSlot,
          selectedSlot: plan.activity.selectedSlot,
          impact: "会占用活动名额",
          requiresConfirmation: true,
          status: "pending",
        });
      } else {
        actions.push({
          id: "manual-activity-check",
          type: "manual_activity_check",
          title: "人工确认活动",
          target: plan.activity.name,
          time: plan.activity.requestedTime || plan.timeline[1].time,
          impact: plan.activity.unavailableReason || "当前无可自动预约时段",
          requiresConfirmation: false,
          status: "pending",
        });
      }
    }

    if (plan.restaurant.canReserve && plan.restaurant.selectedSlot) {
      actions.push({
        id: "reserve-table",
        type: "reserve_table",
        title: "预约餐厅",
        target: plan.restaurant.name,
        time: plan.restaurant.selectedSlot,
        selectedSlot: plan.restaurant.selectedSlot,
        impact: "会提交到店人数和时间",
        requiresConfirmation: true,
        status: "pending",
      });
    } else {
      actions.push({
        id: "manual-restaurant-check",
        type: "manual_restaurant_check",
        title: "人工确认餐厅",
        target: plan.restaurant.name,
        time: plan.restaurant.requestedTime || plan.timeline[3].time,
        impact: plan.restaurant.unavailableReason || "当前无可自动预约时段",
        requiresConfirmation: false,
        status: "pending",
      });
    }

    if (parsed.groupType === "couple") {
      actions.push({
        id: "order-flower",
        type: "order_item",
        title: "下单鲜花",
        target: "小束鲜花送至餐厅前台",
        time: minutesToTime(timeToMinutes(plan.timeline[3].time) - 20),
        impact: "会产生模拟订单",
        requiresConfirmation: true,
        status: "pending",
      });
    }

    if (parsed.groupType !== "solo") {
      actions.push({
        id: "send-message",
        type: "send_message",
        title: "发送集合消息",
        target: GROUPS[parsed.groupType].messageTarget,
        time: "现在",
        impact: "会把集合时间和地点发给对方",
        requiresConfirmation: true,
        status: "pending",
        content: buildMessage(plan, parsed),
      });
    }

    actions.push({
      id: "set-reminder",
      type: "set_reminder",
      title: "设置出发提醒",
      target: "出发前 20 分钟",
      time: minutesToTime(Math.max(0, timeToMinutes(plan.timeline[0].time) - 20)),
      impact: "低影响动作，只生成提醒建议",
      requiresConfirmation: false,
      status: "pending",
    });

    return actions;
  }

  function getReplanActionTarget(parsed, activityReplacement, restaurantReplacement) {
    if (parsed.replanEvent === "party_changed") return "按 " + parsed.partySize + " 人重新校验";
    if (activityReplacement) return activityReplacement.from + " -> " + activityReplacement.to;
    if (restaurantReplacement) return restaurantReplacement.from + " -> " + restaurantReplacement.to;
    const event = REPLAN_EVENTS.find(function (item) { return item.id === parsed.replanEvent; });
    return event ? event.label : "重排事件";
  }

  function buildShareCard(plan, parsed) {
    const facts = [
      plan.timeline[0].time + " 出发",
      "活动：" + plan.activity.name,
      "餐厅：" + plan.restaurant.name,
      "预算：" + plan.budget,
    ];
    if (parsed.groupType === "familyKids") {
      facts.push("孩子友好");
      if (plan.restaurant.tags.indexOf("低负担") >= 0) facts.push("减脂/低负担餐");
      facts.push("距离不远");
    }
    if (parsed.groupType === "friends" || parsed.groupType === "coworkers") {
      facts.push(parsed.partySize + " 人");
      facts.push("适合聊天");
      facts.push("已避开长排队");
    }
    return {
      title: GROUPS[parsed.groupType].label + "安排确认卡",
      recipient: GROUPS[parsed.groupType].messageTarget,
      summary: buildMessage(plan, parsed),
      facts: uniqueStrings(facts).slice(0, 7),
    };
  }

  function buildMessage(plan, parsed) {
    const details = [];
    if (parsed.groupType === "familyKids") {
      details.push("孩子友好");
      if (plan.restaurant.tags.indexOf("低负担") >= 0) details.push("餐厅低负担");
      details.push("距离不远");
    }
    if (parsed.groupType === "friends" || parsed.groupType === "coworkers") {
      details.push(parsed.partySize + " 人");
      details.push("适合聊天拍照");
      details.push("预算可控");
    }
    return "安排好了：" + plan.timeline[0].time + " 出发，先去「" + plan.activity.name + "」，" +
      plan.timeline[3].time + " 到「" + plan.restaurant.name + "」吃饭。整体约 " + plan.totalDuration +
      (details.length ? "，" + details.join("，") : "") + "。";
  }

  function executeActionQueue(actions) {
    return actions.map(function (action, index) {
      const code = String(index + 1).padStart(3, "0");
      if (action.type === "reserve_table") {
        if (!action.selectedSlot) {
          return Object.assign({}, action, {
            status: "skipped",
            result: "未执行预约：缺少有效可预约时段，需要人工确认或稍后重查。",
          });
        }
        return Object.assign({}, action, {
          status: "success",
          result: "预约成功，预约号 RSV-" + code + "，请按时到店。",
        });
      }
      if (action.type === "book_activity" || action.type === "book_ticket") {
        if (!action.selectedSlot) {
          return Object.assign({}, action, {
            status: "skipped",
            result: "未执行活动预约：缺少有效可预约时段，需要人工确认或替换活动。",
          });
        }
        return Object.assign({}, action, {
          status: "success",
          result: "活动票已模拟锁定，凭码 TKT-" + code + " 入场。",
        });
      }
      if (action.type === "join_queue") {
        if (!action.queueToken) {
          return Object.assign({}, action, {
            status: "skipped",
            result: "未领取排队号：当前餐厅状态不稳定，需要人工确认。",
          });
        }
        return Object.assign({}, action, {
          status: "success",
          result: "排队号已生成：" + action.queueToken + "-" + code + "，到店前可刷新等位。",
        });
      }
      if (action.type === "buy_deal") {
        if (!action.dealId) {
          return Object.assign({}, action, {
            status: "skipped",
            result: "未购买团购券：缺少有效套餐，需要人工确认。",
          });
        }
        return Object.assign({}, action, {
          status: "success",
          result: "团购券已模拟购买，券码 DEAL-" + code + "，金额 " + action.price + " 元。",
        });
      }
      if (action.type === "manual_restaurant_check" || action.type === "manual_activity_check") {
        return Object.assign({}, action, {
          status: "skipped",
          result: "未自动执行：" + action.impact,
        });
      }
      if (action.type === "replan_notice") {
        return Object.assign({}, action, {
          status: "success",
          result: "重排校验已记录：" + action.target,
        });
      }
      if (action.type === "order_item") {
        if (!action.itemId && !action.target) {
          return Object.assign({}, action, {
            status: "skipped",
            result: "未创建加购订单：缺少有效商品。",
          });
        }
        return Object.assign({}, action, {
          status: "success",
          result: "模拟订单已创建，订单号 ORD-" + code + "，预计 " + action.time + " 送达。",
        });
      }
      if (action.type === "send_message") {
        return Object.assign({}, action, {
          status: "success",
          result: (action.shareCard ? "分享卡片已模拟发送：" : "消息已模拟发送：") + action.content,
        });
      }
      return Object.assign({}, action, {
        status: "success",
        result: "提醒建议已生成：" + action.time + " 提醒出发。",
      });
    });
  }

  function minutesToTime(minutes) {
    const normalized = Math.max(0, Math.round(minutes));
    const hour = Math.floor(normalized / 60) % 24;
    const minute = normalized % 60;
    return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }

  function timeToMinutes(time) {
    const parts = String(time).split(":").map(Number);
    return parts[0] * 60 + parts[1];
  }

  function formatHours(hours) {
    if (hours < 1) return Math.round(hours * 60) + " 分钟";
    if (Number.isInteger(hours)) return hours + " 小时";
    return Math.round(hours * 10) / 10 + " 小时";
  }

  return {
    GROUPS: GROUPS,
    parseRequest: parseRequest,
    planRequest: planRequest,
    createExecutionQueue: createExecutionQueue,
    executeActionQueue: executeActionQueue,
    mockData: {
      activities: MOCK_ACTIVITIES,
      restaurants: MOCK_RESTAURANTS,
    },
  };
});

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Konfiguratsiya
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || "SaRa_KiNoLaR_Uzz";
console.log(REQUIRED_CHANNEL)
const ADMIN_ID = process.env.ADMIN_ID || "123456789";
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!TOKEN) {
  console.error("❌ Bot tokeni topilmadi! .env faylida TELEGRAM_BOT_TOKEN ni ko'rsating");
  process.exit(1);
}

// Botni yaratish
let bot;
if (WEBHOOK_URL) {
  bot = new TelegramBot(TOKEN);
  bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);
  console.log("🤖 Bot webhook rejimida ishga tushdi...");
} else {
  bot = new TelegramBot(TOKEN, {
    polling: {
      interval: 300,
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  });
  console.log("🤖 Bot polling rejimida ishga tushdi...");
}

// Adminga xabar yuborish
bot.sendMessage(ADMIN_ID, "✅ Bot ishga tushdi, brat!");

// Fayl yo'llari
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MOVIES_FILE = path.join(DATA_DIR, 'movies.json');

// Ma'lumotlar bazasini ishlash
function initDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
}

function loadData(filename, defaultData = {}) {
  initDataDirectory();
  try {
    if (!fs.existsSync(filename)) {
      fs.writeFileSync(filename, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const rawData = fs.readFileSync(filename, 'utf-8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error(`Xato: ${filename} faylni o'qishda`, err);
    return defaultData;
  }
}

function saveData(filename, data) {
  try {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Xato: ${filename} faylni yozishda`, err);
    return false;
  }
}

// Bir martalik kod generatori
function generateUniqueCode() {
  const movies = loadData(MOVIES_FILE);
  const codes = Object.keys(movies).map(Number).filter(n => !isNaN(n));
  return String(codes.length > 0 ? Math.max(...codes) + 1 : 1).padStart(4, '0');
}

// Komandalar ro'yxati
const commands = [
  { command: '/start', description: 'Botni ishga tushirish' },
  { command: '/help', description: 'Yordam olish' },
  { command: '/search', description: 'Kino qidirish' },
  { command: '/addmovie', description: 'Yangi kino qo\'shish (admin)' },
  { command: '/stats', description: 'Bot statistikasi (admin)' },
  { command: '/reklama', description: 'Reklama yuborish (admin)' }
];

bot.setMyCommands(commands);

// Foydalanuvchilarni kuzatish
function trackUser(chatId, userInfo) {
  const users = loadData(USERS_FILE);
  if (!users[chatId]) {
    users[chatId] = {
      ...userInfo,
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isSubscribed: false,
      searchCount: 0
    };
    saveData(USERS_FILE, users);
  } else {
    users[chatId].lastActive = new Date().toISOString();
    saveData(USERS_FILE, users);
  }
  return users[chatId];
}

// Kanalga obuna tekshirish
async function checkSubscription(chatId) {
  try {
    const member = await bot.getChatMember(`@${REQUIRED_CHANNEL}`, chatId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (err) {
    console.error('Obunani tekshirishda xato:', err);
    return false;
  }
}

// Asosiy menyu
function showMainMenu(chatId) {
  const options = {
    reply_markup: {
      keyboard: [
        ["🎥 Kino izlash"],
        ["ℹ️ Yordam"],
        ["📊 Mening statistikam"]
      ],
      resize_keyboard: true
    }
  };
  bot.sendMessage(chatId, "🎬 Asosiy menyu. Quyidagi tugmalardan birini tanlang:", options);
}

// Start komandasi
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = trackUser(chatId, {
    username: msg.from.username || '',
    firstName: msg.from.first_name || '',
    lastName: msg.from.last_name || '',
    languageCode: msg.from.language_code || 'uz'
  });

  const isSubscribed = await checkSubscription(chatId);
  if (!isSubscribed) {
    const subscribeKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{
            text: "📢 Kanalga obuna bo'lish",
            url: `https://t.me/${REQUIRED_CHANNEL}`
          }],
          [{
            text: "✅ Obuna bo'ldim",
            callback_data: 'check_subscription'
          }]
        ]
      }
    };
    bot.sendMessage(chatId, `🎬 Xush kelibsiz ${msg.from.first_name}! Botdan foydalanish uchun quyidagi kanalga obuna bo'ling:`, subscribeKeyboard);
  } else {
    const users = loadData(USERS_FILE);
    users[chatId].isSubscribed = true;
    saveData(USERS_FILE, users);
    showMainMenu(chatId);
  }
});

// Callback query
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  
  if (query.data === 'check_subscription') {
    const isSubscribed = await checkSubscription(chatId);
    if (isSubscribed) {
      const users = loadData(USERS_FILE);
      users[chatId].isSubscribed = true;
      saveData(USERS_FILE, users);
      bot.deleteMessage(chatId, messageId);
      showMainMenu(chatId);
    } else {
      bot.answerCallbackQuery(query.id, { 
        text: "❌ Siz hali kanalga obuna bo'lmagansiz! Iltimos, avval obuna bo'ling.", 
        show_alert: true 
      });
    }
  }
});

// Kino izlash
bot.onText(/🎥 Kino izlash|\/search/, (msg) => {
  const chatId = msg.chat.id;
  const users = loadData(USERS_FILE);
  
  if (!users[chatId]?.isSubscribed) {
    return bot.sendMessage(chatId, "❌ Botdan foydalanish uchun kanalga obuna bo'lishingiz kerak!");
  }
  
  bot.sendMessage(chatId, "🔍 Kino kodini kiriting (masalan: 0001):", {
    reply_markup: {
      force_reply: true
    }
  });
});

// Kino kodiga javob
bot.onText(/^[0-9]{4}$/, async (msg) => {
  const chatId = msg.chat.id;
  const code = msg.text;
  const users = loadData(USERS_FILE);
  
  if (!users[chatId]?.isSubscribed) {
    return bot.sendMessage(chatId, "❌ Botdan foydalanish uchun kanalga obuna bo'lishingiz kerak!");
  }
  
  const movies = loadData(MOVIES_FILE);
  const movie = movies[code];
  
  if (movie?.file_id) {
    // Statistikani yangilash
    users[chatId].searchCount = (users[chatId].searchCount || 0) + 1;
    saveData(USERS_FILE, users);
    
    try {
      await bot.sendVideo(chatId, movie.file_id, {
        caption: `🎥 ${movie.title}\n📹 Kodi: ${code}\n📅 Qo'shilgan sana: ${new Date(movie.added_at).toLocaleDateString()}`
      });
    } catch (err) {
      console.error('Video yuborishda xato:', err);
      bot.sendMessage(chatId, "❌ Video yuborishda xatolik. Iltimos, keyinroq urinib ko'ring.");
    }
  } else {
    bot.sendMessage(chatId, "❌ Bunday kino topilmadi. Kodni tekshirib qayta kiriting.");
  }
});

// Mening statistikam
bot.onText(/📊 Mening statistikam/, (msg) => {
  const chatId = msg.chat.id;
  const users = loadData(USERS_FILE);
  const user = users[chatId];
  
  if (!user) return bot.sendMessage(chatId, "❌ Siz hali botdan foydalanmadingiz!");
  
  const stats = `
📊 Sizning statistikangiz:

🔍 Qidiruvlar soni: ${user.searchCount || 0}
📅 Ro'yxatdan o'tgan sana: ${new Date(user.joinedAt).toLocaleDateString()}
🕒 So'ngi faollik: ${new Date(user.lastActive).toLocaleString()}
  `;
  
  bot.sendMessage(chatId, stats);
});

// Admin komandalari
const adminStates = {};

// Kino qo'shish rejimi
bot.onText(/\/addmovie/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  adminStates[chatId] = { mode: 'addMovie' };
  bot.sendMessage(chatId, "🎬 Yangi kino qo'shish rejimi:\n\n1. Video faylni yuboring\n2. Keyin kino nomini yuboring", {
    reply_markup: {
      force_reply: true
    }
  });
});

// Video qabul qilish (admin uchun)
bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  if (adminStates[chatId]?.mode === 'addMovie') {
    const video = msg.video;
    if (!video?.file_id) {
      return bot.sendMessage(chatId, "❌ Video faylini tanishda xatolik.");
    }
    
    adminStates[chatId].file_id = video.file_id;
    adminStates[chatId].mode = 'waitingForTitle';
    
    bot.sendMessage(chatId, "✅ Video qabul qilindi! Endi kino nomini yuboring:", {
      reply_markup: {
        force_reply: true
      }
    });
  }
});

// Kino nomini qabul qilish
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  if (adminStates[chatId]?.mode === 'waitingForTitle') {
    const title = msg.text;
    const file_id = adminStates[chatId].file_id;
    
    const movies = loadData(MOVIES_FILE);
    const code = generateUniqueCode();
    
    movies[code] = {
      file_id: file_id,
      title: title,
      added_at: new Date().toISOString(),
      added_by: ADMIN_ID
    };
    
    if (saveData(MOVIES_FILE, movies)) {
      bot.sendMessage(chatId, `✅ Kino muvaffaqiyatli qo'shildi!\n\n🎥 Kodi: ${code}\n📹 Nomi: ${title}`);
    } else {
      bot.sendMessage(chatId, "❌ Kino qo'shishda xatolik yuz berdi!");
    }
    
    delete adminStates[chatId];
  }
});

// Admin statistikasi
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  const users = loadData(USERS_FILE);
  const movies = loadData(MOVIES_FILE);
  
  const activeUsers = Object.values(users).filter(u => u.isSubscribed);
  const topUsers = [...activeUsers]
    .sort((a, b) => (b.searchCount || 0) - (a.searchCount || 0))
    .slice(0, 5)
    .map(u => `${u.firstName} (${u.searchCount || 0})`)
    .join('\n');
  
  const stats = `
📊 Bot statistikasi:

👥 Jami foydalanuvchilar: ${Object.keys(users).length}
✅ Faol obunachilar: ${activeUsers.length}
🎥 Kinolar soni: ${Object.keys(movies).length}

🔝 Top 5 foydalanuvchilar:
${topUsers}

🔄 Oxirgi yangilanish: ${new Date().toLocaleString()}
  `;
  
  bot.sendMessage(chatId, stats);
});

// Reklama rejimi
bot.onText(/\/reklama/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  adminStates[chatId] = { mode: 'advertising' };
  bot.sendMessage(chatId, "📢 Reklama matnini yuboring yoki media (rasm/video) bilan birga:", {
    reply_markup: {
      force_reply: true
    }
  });
});

// Reklama yuborish
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!adminStates[chatId] || adminStates[chatId].mode !== 'advertising') return;
  
  delete adminStates[chatId];
  
  const users = Object.entries(loadData(USERS_FILE))
    .filter(([id, user]) => id !== String(ADMIN_ID) && user.isSubscribed);
  
  let success = 0, fail = 0;
  const startTime = Date.now();
  
  // Progress xabarini yuborish
  const progressMsg = await bot.sendMessage(chatId, `📢 Reklama yuborilmoqda...\n\n0/${users.length}`, {
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: 'cancel_ad' }]]
    }
  });
  
  // Bekor qilish uchun
  const cancelAd = (query) => {
    if (query.data === 'cancel_ad' && String(query.from.id) === String(ADMIN_ID)) {
      bot.answerCallbackQuery(query.id, { text: "Reklama bekor qilindi!" });
      bot.editMessageText("❌ Reklama bekor qilindi!", {
        chat_id: progressMsg.chat.id,
        message_id: progressMsg.message_id
      });
      return true;
    }
    return false;
  };
  
  bot.on('callback_query', cancelAd);
  
  for (const [i, [userId]] of users.entries()) {
    try {
      if (msg.photo) {
        await bot.sendPhoto(userId, msg.photo[msg.photo.length - 1].file_id, {
          caption: msg.caption || ''
        });
      } else if (msg.video) {
        await bot.sendVideo(userId, msg.video.file_id, {
          caption: msg.caption || ''
        });
      } else {
        await bot.sendMessage(userId, msg.text || '📢 Yangilik!');
      }
      success++;
      
      // Har 10ta yuborilganda progress yangilash
      if (i % 10 === 0 || i === users.length - 1) {
        try {
          await bot.editMessageText(`📢 Reklama yuborilmoqda...\n\n${i+1}/${users.length}`, {
            chat_id: progressMsg.chat.id,
            message_id: progressMsg.message_id
          });
        } catch (e) {}
      }
      
      await new Promise(resolve => setTimeout(resolve, 200)); // Limitdan qochish
    } catch (err) {
      console.error(`Xato: ${userId} ga yuborishda`, err);
      fail++;
    }
  }
  
  bot.removeListener('callback_query', cancelAd);
  
  const timeSpent = ((Date.now() - startTime) / 1000).toFixed(1);
  const result = `✅ Reklama yuborildi!\n\n⏱ Sarflangan vaqt: ${timeSpent}s\n✔️ Muvaffaqiyatli: ${success}\n❌ Xatolar: ${fail}`;
  
  bot.editMessageText(result, {
    chat_id: progressMsg.chat.id,
    message_id: progressMsg.message_id,
    reply_markup: { inline_keyboard: [] }
  });
});

// Yordam
// Yordam
bot.onText(/\/help|ℹ️ Yordam/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `
  🎬 <b>Kino Bot Yordam</b>
  
  Bu bot orqali siz turli kinolarni kod orqali topib ko'rishingiz mumkin.
  
  🔍 <b>Kino qidirish</b>:
  1. "🎥 Kino izlash" tugmasini bosing
  2. 4 xonali kodni kiriting (masalan: 0001)
  
  📢 <b>Eslatma</b>: Botdan foydalanish uchun kanalimizga obuna bo'lishingiz kerak.
  
  👨‍💻 <b>Admin komandalari</b>:
  - /addmovie - Yangi kino qo'shish
  - /stats - Bot statistikasi
  - /reklama - Reklama yuborish
  
  Savollar bo'lsa <a href="https://t.me/Amirjon_Karimov">@Amirjon_Karimov</a> ga murojaat qiling.
    `;
    
    bot.sendMessage(chatId, helpText, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  });

// Xatoliklar uchun
bot.on('polling_error', (error) => {
  console.error(`Polling xato: ${error.code} - ${error.message}`);
  bot.sendMessage(ADMIN_ID, `⚠️ Botda polling xato: ${error.message}`);
});

bot.on('webhook_error', (error) => {
  console.error(`Webhook xato: ${error.code} - ${error.message}`);
  bot.sendMessage(ADMIN_ID, `⚠️ Botda webhook xato: ${error.message}`);
});

// Server ishga tushganda
console.log("✅ Bot muvaffaqiyatli ishga tushdi!");
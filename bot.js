require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Konfiguratsiya
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || "SaRa_KiNoLaR_Uzz";
const ADMIN_ID = process.env.ADMIN_ID || "123456789";

if (!TOKEN) {
  console.error("❌ Bot tokeni topilmadi! .env faylida TELEGRAM_BOT_TOKEN ni ko'rsating");
  process.exit(1);
}

// Botni yaratish
const bot = new TelegramBot(TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});
console.log("🤖 Bot polling rejimida ishga tushdi...");

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

// Kino ID generatori
function generateMovieId() {
  const movies = loadData(MOVIES_FILE);
  const ids = Object.keys(movies).map(Number).filter(n => !isNaN(n));
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

// Video ma'lumotlarini to'liq saqlash
function saveVideoInfo(fileId, fileInfo, title = "") {
  const movies = loadData(MOVIES_FILE);
  const id = generateMovieId();
  
  movies[id] = {
    file_id: fileId,
    file_unique_id: fileInfo.file_unique_id,
    width: fileInfo.width,
    height: fileInfo.height,
    duration: fileInfo.duration,
    mime_type: fileInfo.mime_type,
    file_size: fileInfo.file_size,
    title: title,
    added_at: new Date().toISOString(),
    added_by: ADMIN_ID
  };
  
  saveData(MOVIES_FILE, movies);
  return id;
}

// Video yuborish funksiyasi
async function sendMovie(chatId, movieId) {
  const movies = loadData(MOVIES_FILE);
  const movie = movies[movieId];
  
  if (!movie) {
    return { success: false, error: "Kino topilmadi" };
  }

  try {
    await bot.sendVideo(chatId, movie.file_id, {
      caption: `🎥 ${movie.title || "Nomsiz kino"}\n📅 Qo'shilgan sana: ${new Date(movie.added_at).toLocaleDateString()}`
    });
    return { success: true };
  } catch (err) {
    console.error('Video yuborishda xato:', err);
    return { success: false, error: err.message };
  }
}

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

// Asosiy menyu (O'ZGARTIRILGAN)
function showMainMenu(chatId) {
  const isAdmin = String(chatId) === String(ADMIN_ID);
  
  const keyboard = [
    ["🎥 Kino izlash"],
    ["ℹ️ Yordam"],
    ["📊 Mening statistikam"],
    ["8"] // Rasmdagi 8-raqamli tugma
  ];
  
  if (isAdmin) {
    keyboard.push(["👨‍💻 Admin panel"]);
  }
  
  const options = {
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true,
      one_time_keyboard: false // Tugmalar doimiy qolishi uchun
    }
  };
  
  bot.sendMessage(chatId, "🎬 Asosiy menyu. Quyidagi tugmalardan birini tanlang:", options);
}

// Admin panel menyusi
function showAdminMenu(chatId) {
  const options = {
    reply_markup: {
      keyboard: [
        ["🎥 Kino qo'shish"],
        ["🗑 Kino o'chirish"],
        ["📊 Bot statistikasi"],
        ["📢 Reklama yuborish"],
        ["🔙 Asosiy menyu"]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  bot.sendMessage(chatId, "👨‍💻 Admin panel. Quyidagi amallardan birini tanlang:", options);
}

// Komandalar menyusini o'rnatish
bot.setMyCommands([
  { command: '/start', description: 'Botni ishga tushirish' },
  { command: '/help', description: 'Yordam haqida ma\'lumot' }
], { scope: { type: 'all_private_chats' } });

// Faqat admin uchun komandalar
if (ADMIN_ID) {
  bot.setMyCommands([
    { command: '/addmovie', description: 'Kino qo\'shish' },
    { command: '/deletemovie', description: 'Kino o\'chirish' },
    { command: '/stats', description: 'Statistikani ko\'rish' },
    { command: '/reklama', description: 'Reklama yuborish' }
  ], { scope: { type: 'chat', chat_id: ADMIN_ID } });
}

// Start komandasi (O'ZGARTIRILGAN)
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

// 8-raqamli tugma uchun handler
bot.onText(/8/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "8-raqamli tugma bosildi. Bu sizning maxsus tugmangiz!");
});

// Qolgan kodlar...
// (Yuqoridagi barcha funksiyalar va handlerlar shu joyga qo'shiladi)
// ...

console.log("✅ Bot yangilangan holatda ishga tushdi!");
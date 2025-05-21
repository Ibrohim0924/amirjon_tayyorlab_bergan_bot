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

// Asosiy menyu (O'ZGARTIRILGAN - ADMIN uchun alohida menyu)
function showMainMenu(chatId) {
  const isAdmin = String(chatId) === String(ADMIN_ID);
  
  const keyboard = [
    ["🎥 Kino izlash"],
    ["ℹ️ Yordam"],
    ["📊 Mening statistikam"]
  ];
  
  if (isAdmin) {
    keyboard.push(["👨‍💻 Admin panel"]);
  }
  
  const options = {
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true
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
      resize_keyboard: true
    }
  };
  bot.sendMessage(chatId, "👨‍💻 Admin panel. Quyidagi amallardan birini tanlang:", options);
}

// Komandalar menyusini o'rnatish (O'ZGARTIRILGAN - Admin komandalari faqat admin uchun)
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

// Admin panelni ochish
bot.onText(/👨‍💻 Admin panel/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) === String(ADMIN_ID)) {
    showAdminMenu(chatId);
  }
});

// Asosiy menyuga qaytish
bot.onText(/🔙 Asosiy menyu/, (msg) => {
  showMainMenu(msg.chat.id);
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
  
  // Kino tanlash uchun callback
  if (query.data.startsWith('movie_')) {
    const movieId = query.data.split('_')[1];
    const users = loadData(USERS_FILE);
    
    users[chatId].searchCount = (users[chatId].searchCount || 0) + 1;
    saveData(USERS_FILE, users);
    
    const result = await sendMovie(chatId, movieId);
    if (result.success) {
      await bot.deleteMessage(chatId, query.message.message_id);
    } else {
      bot.sendMessage(chatId, `❌ Video yuborishda xatolik: ${result.error}`);
    }
  }
  
  // Kino o'chirish uchun callback
  if (query.data.startsWith('confirm_delete_')) {
    if (String(chatId) !== String(ADMIN_ID)) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Sizda bunday huquq yo'q!", show_alert: true });
    }
    
    const movieId = query.data.split('_')[2];
    const movies = loadData(MOVIES_FILE);
    
    if (!movies[movieId]) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Kino topilmadi!", show_alert: true });
    }
    
    const movieTitle = movies[movieId].title || "Nomsiz kino";
    delete movies[movieId];
    saveData(MOVIES_FILE, movies);
    
    bot.answerCallbackQuery(query.id, { text: "✅ Kino o'chirildi!", show_alert: true });
    bot.editMessageText(`🗑 "${movieTitle}" (ID: ${movieId}) kinosi muvaffaqiyatli o'chirildi.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    });
  }
  
  if (query.data === 'cancel_delete') {
    bot.answerCallbackQuery(query.id, { text: "❌ Kino o'chirish bekor qilindi!", show_alert: true });
    bot.deleteMessage(query.message.chat.id, query.message.message_id);
  }
});

// Kino izlash
bot.onText(/🎥 Kino izlash|\/search/, (msg) => {
  const chatId = msg.chat.id;
  const users = loadData(USERS_FILE);
  
  if (!users[chatId]?.isSubscribed) {
    return bot.sendMessage(chatId, "❌ Botdan foydalanish uchun kanalga obuna bo'lishingiz kerak!");
  }
  
  bot.sendMessage(chatId, "🔍 Kino nomini yoki ID sini kiriting (to'liq yoki qismini):", {
    reply_markup: {
      force_reply: true
    }
  });
});

// Kino qidirish
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!msg.reply_to_message || !msg.reply_to_message.text.includes("Kino nomini yoki ID sini kiriting")) {
    return;
  }
  
  const users = loadData(USERS_FILE);
  if (!users[chatId]?.isSubscribed) return;
  
  const movies = loadData(MOVIES_FILE);
  const searchTerm = text.toLowerCase().trim();

  // ID bo'yicha qidirish
  if (/^\d+$/.test(searchTerm)) {
    const movieId = searchTerm;
    if (movies[movieId]) {
      users[chatId].searchCount = (users[chatId].searchCount || 0) + 1;
      saveData(USERS_FILE, users);
      
      const result = await sendMovie(chatId, movieId);
      if (!result.success) {
        bot.sendMessage(chatId, `❌ Video yuborishda xatolik: ${result.error}`);
      }
      return;
    } else {
      bot.sendMessage(chatId, `❌ ID ${movieId} bo'yicha kino topilmadi. Iltimos, boshqa nom yoki ID bilan qayta urinib ko'ring.`);
      return;
    }
  }

  // Kino nomi bo'yicha qidirish
  const foundMovies = Object.entries(movies)
    .filter(([id, movie]) => movie.title.toLowerCase().includes(searchTerm))
    .slice(0, 10);

  if (foundMovies.length === 0) {
    return bot.sendMessage(chatId, "❌ Hech qanday kino topilmadi. Boshqa nom bilan qayta urinib ko'ring.");
  }
  
  if (foundMovies.length === 1) {
    const [id, movie] = foundMovies[0];
    users[chatId].searchCount = (users[chatId].searchCount || 0) + 1;
    saveData(USERS_FILE, users);
    
    const result = await sendMovie(chatId, id);
    if (!result.success) {
      bot.sendMessage(chatId, `❌ Video yuborishda xatolik: ${result.error}`);
    }
    return;
  }
  
  const keyboard = foundMovies.map(([id, movie]) => {
    return [{ text: `${movie.title} (ID: ${id})`, callback_data: `movie_${id}` }];
  });
  
  bot.sendMessage(chatId, `🔍 Topilgan kinolar (${foundMovies.length} ta):`, {
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
});

// Mening statistikam
bot.onText(/📊 Mening statistikam|\/mystats/, (msg) => {
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
bot.onText(/\/addmovie|🎥 Kino qo'shish/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  adminStates[chatId] = { 
    mode: 'addMovie',
    step: 'waiting_video'
  };
  
  bot.sendMessage(chatId, "🎬 Yangi kino qo'shish rejimi:\n\n1. Iltimos, video faylni yuboring (fayl sifatida emas, Telegram video sifatida)", {
    reply_markup: {
      force_reply: true
    }
  });
});

// Kino o'chirish rejimi
bot.onText(/\/deletemovie|🗑 Kino o'chirish/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  adminStates[chatId] = { 
    mode: 'deleteMovie',
    step: 'waiting_movie_id'
  };
  
  bot.sendMessage(chatId, "🗑 Kino o'chirish rejimi:\n\nIltimos, o'chirmoqchi bo'lgan kino ID sini yuboring:", {
    reply_markup: {
      force_reply: true
    }
  });
});

// Video qabul qilish
bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  if (adminStates[chatId]?.mode === 'addMovie' && adminStates[chatId].step === 'waiting_video') {
    const video = msg.video;
    if (!video?.file_id) {
      return bot.sendMessage(chatId, "❌ Video faylini tanishda xatolik.");
    }
    
    adminStates[chatId].file_id = video.file_id;
    adminStates[chatId].file_info = {
      file_unique_id: video.file_unique_id,
      width: video.width,
      height: video.height,
      duration: video.duration,
      mime_type: video.mime_type,
      file_size: video.file_size
    };
    adminStates[chatId].step = 'waiting_title';
    
    bot.sendMessage(chatId, "✅ Video qabul qilindi!\n\nEndi kino nomini yuboring:", {
      reply_markup: {
        force_reply: true
      }
    });
  }
});

// Kino nomini yoki ID sini qabul qilish
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  // Kino qo'shish uchun nom qabul qilish
  if (adminStates[chatId]?.mode === 'addMovie' && adminStates[chatId].step === 'waiting_title') {
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, "❌ Kino nomi juda qisqa. Iltimos, qayta urinib ko'ring.");
    }
    
    const movieId = saveVideoInfo(
      adminStates[chatId].file_id,
      adminStates[chatId].file_info,
      text
    );
    
    // Test qilib ko'rish
    const testResult = await sendMovie(chatId, movieId);
    
    if (testResult.success) {
      bot.sendMessage(chatId, `✅ Kino muvaffaqiyatli qo'shildi va test qilindi!\n\n🎥 ID: ${movieId}\n📹 Nomi: ${text}`);
    } else {
      bot.sendMessage(chatId, `⚠️ Kino qo'shildi, lekin test qilishda xatolik:\n${testResult.error}\n\n🎥 ID: ${movieId}`);
    }
    
    delete adminStates[chatId];
  }
  
  // Kino o'chirish uchun ID qabul qilish
  if (adminStates[chatId]?.mode === 'deleteMovie' && adminStates[chatId].step === 'waiting_movie_id') {
    const movieId = text;
    const movies = loadData(MOVIES_FILE);
    
    if (!movieId || !movies[movieId]) {
      return bot.sendMessage(chatId, "❌ Noto'g'ri kino ID si yoki bunday ID dagi kino mavjud emas!");
    }
    
    // Kino ma'lumotlarini olish
    const movieTitle = movies[movieId].title || "Nomsiz kino";
    
    // Tasdiqlash tugmasi
    const confirmKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Ha, o'chirish", callback_data: `confirm_delete_${movieId}` }],
          [{ text: "❌ Bekor qilish", callback_data: 'cancel_delete' }]
        ]
      }
    };
    
    bot.sendMessage(chatId, `⚠️ Rostan ham "${movieTitle}" (ID: ${movieId}) kinosini o'chirmoqchimisiz?`, confirmKeyboard);
    delete adminStates[chatId];
  }
});

// Admin statistikasi
bot.onText(/\/stats|📊 Bot statistikasi/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  const users = loadData(USERS_FILE);
  const movies = loadData(MOVIES_FILE);
  
  const activeUsers = Object.values(users).filter(u => u.isSubscribed);
  const topUsers = [...activeUsers]
    .sort((a, b) => (b.searchCount || 0) - (a.searchCount || 0))
    .slice(0, 5)
    .map((u, i) => `${i+1}. ${u.firstName} (${u.searchCount || 0} qidiruv)`)
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
bot.onText(/\/reklama|📢 Reklama yuborish/, (msg) => {
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
      
      // Progress yangilash
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
bot.onText(/\/help|ℹ️ Yordam/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `
🎬 <b>Kino Bot Yordam</b>

Bu bot orqali siz turli kinolarni nomi yoki ID si bo'yicha qidirib topishingiz mumkin.

🔍 <b>Kino qidirish</b>:
1. "🎥 Kino izlash" tugmasini bosing
2. Kino nomini yoki ID sini kiriting (to'liq yoki qismini)

📢 <b>Eslatma</b>: Botdan foydalanish uchun kanalimizga obuna bo'lishingiz kerak.

👨‍💻 <b>Admin komandalari</b>:
- /addmovie - Yangi kino qo'shish
- /deletemovie - Kino o'chirish
- /stats - Bot statistikasi
- /reklama - Reklama yuborish

Savollar bo'lsa @ibrohimjon_0924 ga murojaat qiling.
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

bot.on('error', (error) => {
  console.error(`Bot xato: ${error.message}`);
  bot.sendMessage(ADMIN_ID, `⚠️ Botda xato: ${error.message}`);
});

// Server ishga tushganda
bot.sendMessage(ADMIN_ID, "✅ Bot yangilangan holatda ishga tushdi!");
console.log("✅ Bot yangilangan holatda ishga tushdi!");

process.on('uncaughtException', (err) => {
  console.error('Tutib olinmagan istisno:', err);
  bot.sendMessage(ADMIN_ID, `⚠️ Botda jiddiy xato: ${err.message}`);
});
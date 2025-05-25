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
const VIEWS_FILE = path.join(DATA_DIR, 'views.json');

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

// Kino/Serial ID generatori
function generateMovieId() {
  const movies = loadData(MOVIES_FILE);
  const ids = Object.keys(movies).map(Number).filter(n => !isNaN(n));
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

// Video ma'lumotlarini to'liq saqlash
function saveVideoInfo(fileId, fileInfo, title = "", isSeries = false, seriesId = null, episodeNumber = null) {
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
    added_by: ADMIN_ID,
    views: 0,
    isSeries: isSeries,
    seriesId: seriesId,
    episodeNumber: episodeNumber
  };
  
  saveData(MOVIES_FILE, movies);
  return id;
}

// Kino ko'rishlar sonini yangilash
function incrementMovieViews(movieId) {
  const movies = loadData(MOVIES_FILE);
  if (movies[movieId]) {
    movies[movieId].views = (movies[movieId].views || 0) + 1;
    saveData(MOVIES_FILE, movies);
  }
}

// Video yuborish funksiyasi
async function sendMovie(chatId, movieId) {
  const movies = loadData(MOVIES_FILE);
  const movie = movies[movieId];
  
  if (!movie) {
    return { success: false, error: "Kino yoki serial topilmadi" };
  }

  try {
    await bot.sendVideo(chatId, movie.file_id, {
      caption: `🎥 ${movie.title || "Nomsiz kino"}${movie.isSeries ? ` - ${movie.episodeNumber}-qism` : ""}\n👁 Ko'rishlar: ${movie.views || 0}\n📅 Qo'shilgan sana: ${new Date(movie.added_at).toLocaleDateString()}`
    });
    
    incrementMovieViews(movieId);
    
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
      searchCount: 0,
      viewedMovies: []
    };
    saveData(USERS_FILE, users);
  } else {
    users[chatId].lastActive = new Date().toISOString();
    saveData(USERS_FILE, users);
  }
  return users[chatId];
}

// Foydalanuvchi ko'rgan kinoni qo'shish
function addUserViewedMovie(chatId, movieId) {
  const users = loadData(USERS_FILE);
  if (users[chatId]) {
    if (!users[chatId].viewedMovies) {
      users[chatId].viewedMovies = [];
    }
    
    if (!users[chatId].viewedMovies.includes(movieId)) {
      users[chatId].viewedMovies.push(movieId);
      saveData(USERS_FILE, users);
    }
  }
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
  const isAdmin = String(chatId) === String(ADMIN_ID);
  
  const keyboard = [
    ["🎥 Kino izlash"],
    ["ℹ️ Yordam"],
    ["📊 Mening statistikam"]
  ];
  
  if (isAdmin) {
    keyboard.push(["👨‍💻 Admin panel"]);
    keyboard.push(["🎬 Mening kinolarim"]);
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
        ["📺 Qismli seriallar joylash"],
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

// Komandalar menyusini o'rnatish
bot.setMyCommands([
  { command: '/start', description: 'Botni ishga tushirish' },
  { command: '/help', description: 'Yordam haqida ma\'lumot' }
], { scope: { type: 'all_private_chats' } });

// Faqat admin uchun komandalar
if (ADMIN_ID) {
  bot.setMyCommands([
    { command: '/addmovie', description: 'Kino qo\'shish' },
    { command: '/addseries', description: 'Qismli serial qo\'shish' },
    { command: '/deletemovie', description: 'Kino o\'chirish' },
    { command: '/stats', description: 'Statistikani ko\'rish' },
    { command: '/reklama', description: 'Reklama yuborish' },
    { command: '/mymovies', description: 'Mening kinolarim/seriallarimni ko\'rish' }
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
 kindness_data: 'check_subscription'
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

// Mening kinolarim
bot.onText(/\/mymovies|🎬 Mening kinolarim/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) {
    return bot.sendMessage(chatId, "❌ Bu funksiya faqat admin uchun mavjud!");
  }

  const movies = loadData(MOVIES_FILE);
  const myMovies = Object.entries(movies)
    .filter(([id, movie]) => String(movie.added_by) === String(ADMIN_ID))
    .sort((a, b) => new Date(b[1].added_at) - new Date(a[1].added_at));

  if (myMovies.length === 0) {
    return bot.sendMessage(chatId, "❌ Siz hali hech qanday kino yoki serial qo'shmagansiz!");
  }

  const groupedBySeries = {};
  myMovies.forEach(([id, movie]) => {
    if (movie.isSeries) {
      if (!groupedBySeries[movie.seriesId]) {
        groupedBySeries[movie.seriesId] = {
          title: movie.title.split(' - ')[0],
          episodes: []
        };
      }
      groupedBySeries[movie.seriesId].episodes.push({ id, movie });
    } else {
      groupedBySeries[id] = { title: movie.title, episodes: [{ id, movie }] };
    }
  });

  const keyboard = Object.entries(groupedBySeries).map(([seriesId, series]) => {
    if (series.episodes.length === 1 && !series.episodes[0].movie.isSeries) {
      const movie = series.episodes[0].movie;
      return [{
        text: `${movie.title} (👁 ${movie.views || 0})`,
        callback_data: `movie_${series.episodes[0].id}`
      }];
    } else {
      return [{
        text: `${series.title} (${series.episodes.length} qism)`,
        callback_data: `series_${seriesId}`
      }];
    }
  });

  bot.sendMessage(chatId, `🎬 Sizning kinolar va seriallaringiz (${myMovies.length} ta):`, {
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
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
  
  // Kino/serial tanlash uchun callback
  if (query.data.startsWith('movie_')) {
    const movieId = query.data.split('_')[1];
    const users = loadData(USERS_FILE);
    
    users[chatId].searchCount = (users[chatId].searchCount || 0) + 1;
    saveData(USERS_FILE, users);
    
    addUserViewedMovie(chatId, movieId);
    
    const result = await sendMovie(chatId, movieId);
    if (result.success) {
      await bot.deleteMessage(chatId, query.message.message_id);
    } else {
      bot.sendMessage(chatId, `❌ Video yuborishda xatolik: ${result.error}`);
    }
  }
  
  // Serial qismlarini ko'rsatish
  if (query.data.startsWith('series_')) {
    const seriesId = query.data.split('_')[1];
    const movies = loadData(MOVIES_FILE);
    const seriesEpisodes = Object.entries(movies)
      .filter(([id, movie]) => movie.isSeries && movie.seriesId === seriesId)
      .sort((a, b) => a[1].episodeNumber - b[1].episodeNumber);
    
    if (seriesEpisodes.length === 0) {
      return bot.sendMessage(chatId, "❌ Serial topilmadi!");
    }

    const keyboard = seriesEpisodes.map(([id, movie]) => {
      return [{
        text: `${movie.title} - ${movie.episodeNumber}-qism (👁 ${movie.views || 0})`,
        callback_data: `movie_${id}`
      }];
    });

    bot.editMessageText(`📺 "${seriesEpisodes[0][1].title.split(' - ')[0]}" serialining qismlari:`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  }
  
  // Kino o'chirish uchun callback
  if (query.data.startsWith('confirm_delete_')) {
    if (String(chatId) !== String(ADMIN_ID)) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Sizda bunday huquq yo'q!", show_alert: true });
    }
    
    const movieId = query.data.split('_')[2];
    const movies = loadData(MOVIES_FILE);
    
    if (!movies[movieId]) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Kino/serial topilmadi!", show_alert: true });
    }
    
    const movieTitle = movies[movieId].title || "Nomsiz kino";
    delete movies[movieId];
    saveData(MOVIES_FILE, movies);
    
    bot.answerCallbackQuery(query.id, { text: "✅ Kino/serial o'chirildi!", show_alert: true });
    bot.editMessageText(`🗑 "${movieTitle}" (ID: ${movieId}) muvaffaqiyatli o'chirildi.`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    });
  }
  
  if (query.data === 'cancel_delete') {
    bot.answerCallbackQuery(query.id, { text: "❌ O'chirish bekor qilindi!", show_alert: true });
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
  
  bot.sendMessage(chatId, "🔍 Kino yoki serial nomini yoki ID sini kiriting (to'liq yoki qismini):", {
    reply_markup: {
      force_reply: true
    }
  });
});

// Kino/serial qidirish
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!msg.reply_to_message || !msg.reply_to_message.text.includes("Kino yoki serial nomini yoki ID sini kiriting")) {
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
      
      addUserViewedMovie(chatId, movieId);
      
      if (movies[movieId].isSeries) {
        const seriesId = movies[movieId].seriesId;
        const seriesEpisodes = Object.entries(movies)
          .filter(([id, movie]) => movie.isSeries && movie.seriesId === seriesId)
          .sort((a, b) => a[1].episodeNumber - b[1].episodeNumber);
        
        const keyboard = seriesEpisodes.map(([id, movie]) => {
          return [{ 
            text: `${movie.title} - ${movie.episodeNumber}-qism (👁 ${movie.views || 0})`, 
            callback_data: `movie_${id}` 
          }];
        });
        
        bot.sendMessage(chatId, `📺 "${movies[movieId].title.split(' - ')[0]}" serialining qismlari:`, {
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
      } else {
        const result = await sendMovie(chatId, movieId);
        if (!result.success) {
          bot.sendMessage(chatId, `❌ Video yuborishda xatolik: ${result.error}`);
        }
      }
      return;
    } else {
      bot.sendMessage(chatId, `❌ ID ${movieId} bo'yicha kino/serial topilmadi. Iltimos, boshqa nom yoki ID bilan qayta urinib ko'ring.`);
      return;
    }
  }

  // Nom bo'yicha qidirish
  const foundMovies = Object.entries(movies)
    .filter(([id, movie]) => movie.title.toLowerCase().includes(searchTerm))
    .slice(0, 10);

  if (foundMovies.length === 0) {
    return bot.sendMessage(chatId, "❌ Hech qanday kino yoki serial topilmadi. Boshqa nom bilan qayta urinib ko'ring.");
  }
  
  if (foundMovies.length === 1 && !foundMovies[0][1].isSeries) {
    const [id, movie] = foundMovies[0];
    users[chatId].searchCount = (users[chatId].searchCount || 0) + 1;
    saveData(USERS_FILE, users);
    
    addUserViewedMovie(chatId, id);
    
    const result = await sendMovie(chatId, id);
    if (!result.success) {
      bot.sendMessage(chatId, `❌ Video yuborishda xatolik: ${result.error}`);
    }
    return;
  }
  
  const keyboard = foundMovies.map(([id, movie]) => {
    return [{ 
      text: `${movie.title}${movie.isSeries ? ` - ${movie.episodeNumber}-qism` : ""} (👁 ${movie.views || 0})`, 
      callback_data: `movie_${id}` 
    }];
  });
  
  bot.sendMessage(chatId, `🔍 Topilgan kinolar/seriallar (${foundMovies.length} ta):`, {
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
🎥 Ko'rgan kinolar/seriallar soni: ${user.viewedMovies?.length || 0}
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

// Qismli seriallar joylash rejimi
bot.onText(/\/addseries|📺 Qismli seriallar joylash/, (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;
  
  adminStates[chatId] = { 
    mode: 'addSeries',
    step: 'waiting_series_title'
  };
  
  bot.sendMessage(chatId, "📺 Yangi serial qo'shish rejimi:\n\n1. Iltimos, serialning umumiy nomini yuboring:", {
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
  
  bot.sendMessage(chatId, "🗑 Kino/serial o'chirish rejimi:\n\nIltimos, o'chirmoqchi bo'lgan kino/serial ID sini yuboring:", {
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
  } else if (adminStates[chatId]?.mode === 'addSeries' && adminStates[chatId].step === 'waiting_episode_video') {
    const video = msg.video;
    if (!video?.file_id) {
      return bot.sendMessage(chatId, "❌ Video faylini tanishda xatolik.");
    }
    
    adminStates[chatId].episodes = adminStates[chatId].episodes || [];
    adminStates[chatId].episodes.push({
      file_id: video.file_id,
      file_info: {
        file_unique_id: video.file_unique_id,
        width: video.width,
        height: video.height,
        duration: video.duration,
        mime_type: video.mime_type,
        file_size: video.file_size
      }
    });
    
    bot.sendMessage(chatId, `✅ ${adminStates[chatId].episodes.length}-qism qabul qilindi!\n\nYana qism qo'shmoqchimisiz? (Ha/Yo'q)`, {
      reply_markup: {
        force_reply: true
      }
    });
    adminStates[chatId].step = 'waiting_more_episodes';
  }
});

// Kino/serial nomini yoki ID sini qabul qilish
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
    
    const testResult = await sendMovie(chatId, movieId);
    
    if (testResult.success) {
      bot.sendMessage(chatId, `✅ Kino muvaffaqiyatli qo'shildi va test qilindi!\n\n🎥 ID: ${movieId}\n📹 Nomi: ${text}`);
    } else {
      bot.sendMessage(chatId, `⚠️ Kino qo'shildi, lekin test qilishda xatolik:\n${testResult.error}\n\n🎥 ID: ${movieId}`);
    }
    
    delete adminStates[chatId];
  }
  
  // Serial qo'shish uchun nom qabul qilish
  if (adminStates[chatId]?.mode === 'addSeries' && adminStates[chatId].step === 'waiting_series_title') {
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, "❌ Serial nomi juda qisqa. Iltimos, qayta urinib ko'ring.");
    }
    
    adminStates[chatId].seriesTitle = text;
    adminStates[chatId].seriesId = generateMovieId().toString();
    adminStates[chatId].step = 'waiting_episode_video';
    
    bot.sendMessage(chatId, `✅ Serial nomi: "${text}" saqlandi.\n\nEndi birinchi qism videosini yuboring:`, {
      reply_markup: {
        force_reply: true
      }
    });
  }
  
  // Yana qism qo'shish yoki yakunlash
  if (adminStates[chatId]?.mode === 'addSeries' && adminStates[chatId].step === 'waiting_more_episodes') {
    if (text.toLowerCase() === 'yo\'q') {
      const episodes = adminStates[chatId].episodes || [];
      const seriesTitle = adminStates[chatId].seriesTitle;
      const seriesId = adminStates[chatId].seriesId;
      
      const movieIds = [];
      for (let i = 0; i < episodes.length; i++) {
        const episodeNumber = i + 1;
        const movieId = saveVideoInfo(
          episodes[i].file_id,
          episodes[i].file_info,
          `${seriesTitle} - ${episodeNumber}-qism`,
          true,
          seriesId,
          episodeNumber
        );
        movieIds.push(movieId);
      }
      
      let message = `✅ "${seriesTitle}" seriali ${episodes.length} ta qism bilan qo'shildi!\n\nQismlar IDlari:\n`;
      movieIds.forEach((id, index) => {
        message += `${index + 1}-qism: ID ${id}\n`;
      });
      
      bot.sendMessage(chatId, message);
      delete adminStates[chatId];
    } else if (text.toLowerCase() === 'ha') {
      adminStates[chatId].step = 'waiting_episode_video';
      bot.sendMessage(chatId, `📺 Keyingi qism videosini yuboring:`, {
        reply_markup: {
          force_reply: true
        }
      });
    } else {
      bot.sendMessage(chatId, `❌ Iltimos, faqat "Ha" yoki "Yo'q" deb javob bering.`);
    }
  }
  
  // Kino/serial o'chirish uchun ID qabul qilish
  if (adminStates[chatId]?.mode === 'deleteMovie' && adminStates[chatId].step === 'waiting_movie_id') {
    const movieId = text;
    const movies = loadData(MOVIES_FILE);
    
    if (!movieId || !movies[movieId]) {
      return bot.sendMessage(chatId, "❌ Noto'g'ri kino/serial ID si yoki bunday ID dagi kino/serial mavjud emas!");
    }
    
    const movieTitle = movies[movieId].title || "Nomsiz kino";
    const movieViews = movies[movieId].views || 0;
    
    const confirmKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Ha, o'chirish", callback_data: `confirm_delete_${movieId}` }],
          [{ text: "❌ Bekor qilish", callback_data: 'cancel_delete' }]
        ]
      }
    };
    
    bot.sendMessage(chatId, `⚠️ Rostan ham "${movieTitle}" (ID: ${movieId}, 👁 ${movieViews}) kino/serialini o'chirmoqchimisiz?`, confirmKeyboard);
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
  const totalViews = Object.values(movies).reduce((sum, movie) => sum + (movie.views || 0), 0);
  
  const topMovies = Object.entries(movies)
    .sort((a, b) => (b[1].views || 0) - (a[1].views || 0))
    .slice(0, 5)
    .map(([id, movie], i) => `${i+1}. ${movie.title}${movie.isSeries ? ` - ${movie.episodeNumber}-qism` : ""} (👁 ${movie.views || 0})`)
    .join('\n');
  
  const topUsers = [...activeUsers]
    .sort((a, b) => (b.searchCount || 0) - (a.searchCount || 0))
    .slice(0, 5)
    .map((u, i) => `${i+1}. ${u.firstName} (${u.searchCount || 0} qidiruv, ${u.viewedMovies?.length || 0} kino/serial)`)
    .join('\n');
  
  const stats = `
📊 Bot statistikasi:

👥 Jami foydalanuvchilar: ${Object.keys(users).length}
✅ Faol obunachilar: ${activeUsers.length}
🎥 Kinolar/seriallar soni: ${Object.keys(movies).length}
👁 Jami ko'rishlar: ${totalViews}

🏆 Eng ko'p ko'rilgan kinolar/seriallar:
${topMovies}

🏆 Eng faol foydalanuvchilar:
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
  
  const progressMsg = await bot.sendMessage(chatId, `📢 Reklama yuborilmoqda...\n\n0/${users.length}`, {
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: 'cancel_ad' }]]
    }
  });
  
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
      
      if (i % 10 === 0 || i === users.length - 1) {
        try {
          await bot.editMessageText(`📢 Reklama yuborilmoqda...\n\n${i+1}/${users.length}`, {
            chat_id: progressMsg.chat.id,
            message_id: progressMsg.message_id
          });
        } catch (e) {}
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
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

Bu bot orqali siz turli kinolar va seriallarni nomi yoki ID si bo'yicha qidirib topishingiz mumkin.

🔍 <b>Kino/serial qidirish</b>:
1. "🎥 Kino izlash" tugmasini bosing
2. Kino yoki serial nomini yoki ID sini kiriting (to'liq yoki qismini)
3. Serial ID si kiritilsa, barcha qismlar ro'yxati chiqadi

📢 <b>Eslatma</b>: Botdan foydalanish uchun kanalimizga obuna bo'lishingiz kerak.

👨‍💻 <b>Admin komandalari</b>:
- /addmovie - Yangi kino qo'shish
- /addseries - Qismli serial qo'shish
- /deletemovie - Kino/serial o'chirish
- /stats - Bot statistikasi
- /reklama - Reklama yuborish
- /mymovies - Siz qo'shgan kinolar/seriallar ro'yxati

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
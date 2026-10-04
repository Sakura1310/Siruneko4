import express from 'express';
import session from 'express-session';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5500', // 必要に応じてフロントエンドのURLに変更
  credentials: true
}));

app.use(session({
  secret: 'shironeko-secret-key-1210',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 有効期限：1日
  }
}));

// 管理者アカウント情報
const ADMIN_USER = {
  username: "さくら1210",
  password: "kokoa1310"
};

// 登録済みユーザーを保持するメモリデータベース
const registeredUsers = new Map();
// 初期登録として管理者アカウントを保持
registeredUsers.set(ADMIN_USER.username, { password: ADMIN_USER.password, isAdmin: true });

// 送信制限用マップ
const lastSentTimes = new Map();
const COOLDOWN_TIME = 10000; // 10秒制限


// ==========================================
// API 1: 新規アカウント作成 (新規登録)
// ==========================================
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'おなまえとパスワードを入力してね🐱' });
  }

  // 既に登録されているか確認
  if (registeredUsers.has(username)) {
    return res.status(400).json({ success: false, message: 'そのおなまえはすでに使われているにゃ！別のなまえにしてね🐱' });
  }

  // 新規ユーザーを登録
  registeredUsers.set(username, { password: password, isAdmin: false });

  // 登録完了と同時にログイン状態にする
  req.session.user = { username: username, isAdmin: false };

  return res.json({
    success: true,
    message: `ようこそ、${username}先生！アカウントができたにゃ🐾`,
    user: req.session.user
  });
});


// ==========================================
// API 2: ログイン処理
// ==========================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'おなまえとパスワードを入力してね🐱' });
  }

  // 1. 管理者チェック
  if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
    req.session.user = { username, isAdmin: true };
    return res.json({
      success: true,
      message: '管理者としてログインしました！👑',
      user: req.session.user
    });
  }

  // 2. 一般ユーザーの照合
  const userRecord = registeredUsers.get(username);
  if (userRecord && userRecord.password === password) {
    req.session.user = { username, isAdmin: userRecord.isAdmin };
    return res.json({
      success: true,
      message: `おかえりなさい、${username}先生！🐾`,
      user: req.session.user
    });
  }

  return res.status(401).json({
    success: false,
    message: 'おなまえかパスワードがちがうみたいだにゃ…確認してね🐱'
  });
});


// ==========================================
// API 3: ログイン状態確認
// ==========================================
app.get('/api/me', (req, res) => {
  if (req.session.user) {
    res.json({ isLoggedIn: true, user: req.session.user });
  } else {
    res.json({ isLoggedIn: false, user: null });
  }
});


// ==========================================
// API 4: メッセージ送信 (管理者権限で制限解除)
// ==========================================
app.post('/api/send-message', (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ success: false, message: 'ログインが必要だにゃ！' });
  }

  const currentTime = Date.now();

  // 管理者以外は制限チェック
  if (!user.isAdmin) {
    const lastSent = lastSentTimes.get(user.username) || 0;
    const timePassed = currentTime - lastSent;

    if (timePassed < COOLDOWN_TIME) {
      const remainingSeconds = Math.ceil((COOLDOWN_TIME - timePassed) / 1000);
      return res.status(429).json({
        success: false,
        message: `【制限中】あと ${remainingSeconds} 秒待ってから送信してね🐱`
      });
    }
  }

  lastSentTimes.set(user.username, currentTime);

  res.json({
    success: true,
    message: user.isAdmin 
      ? '👑 管理者権限で制限なし送信しました！' 
      : '✅ メッセージを送信しました！'
  });
});


// ==========================================
// API 5: ログアウト
// ==========================================
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'ログアウトに失敗しました' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'ログアウトしました🐾' });
  });
});

app.listen(PORT, () => {
  console.log(`🐱 サーバーが起動しました: http://localhost:${PORT}`);
});

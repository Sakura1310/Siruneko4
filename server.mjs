
// server.mjs
import express from 'express';
import session from 'express-session';
import cors from 'cors';

const app = express();
const PORT = 3000;

// 1. JSONデータの読み込み設定とCORS設定
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5500', // フロントエンドのURL（必要に応じて変更）
  credentials: true // Cookie（セッション情報）のやり取りを許可
}));

// 2. セッション管理の設定（サーバー側でログイン情報を保持）
app.use(session({
  secret: 'shironeko-secret-key-1210', // セッションの暗号化キー
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // JavaScriptからの悪意ある読み取りを防止
    maxAge: 24 * 60 * 60 * 1000 // ログイン有効期限：1日
  }
}));

// --- 管理者情報およびユーザーデータベース（メモリ上またはDB） ---
const ADMIN_USER = {
  username: "さくら1210",
  password: "1310"
};

// 最終送信時間を記録するマップ（送信制限用）
const lastSentTimes = new Map();
const COOLDOWN_TIME = 10000; // 一般ユーザーの制限時間（10秒）


// ==========================================
// API 1: ログイン処理
// ==========================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'おなまえとパスワードを入力してね' });
  }

  // 管理者チェック
  if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
    // セッションに管理者情報を保存
    req.session.user = {
      username: username,
      isAdmin: true
    };
    return res.json({
      success: true,
      message: '管理者としてログインしました！👑',
      user: { username: username, isAdmin: true }
    });
  }

  // 一般ユーザーチェック（例: パスワード判定など。試作として任意の入力でログイン可とする場合）
  // 実際にはDBで確認します
  req.session.user = {
    username: username,
    isAdmin: false
  };

  return res.json({
    success: true,
    message: 'ログインしました！🐾',
    user: { username: username, isAdmin: false }
  });
});


// ==========================================
// API 2: 現在ログインしている人の情報を取得
// ==========================================
app.get('/api/me', (req, res) => {
  if (req.session.user) {
    // ログイン中の場合、ユーザー情報を返す
    res.json({ isLoggedIn: true, user: req.session.user });
  } else {
    // 未ログインの場合
    res.json({ isLoggedIn: false, user: null });
  }
});


// ==========================================
// API 3: メッセージ送信（管理者権限で制限解除）
// ==========================================
app.post('/api/send-message', (req, res) => {
  const user = req.session.user;

  // 未ログインチェック
  if (!user) {
    return res.status(401).json({ success: false, message: 'ログインが必要だにゃ！' });
  }

  const { message } = req.body;
  const currentTime = Date.now();

  // ★ 管理者判定：管理者の場合は送信制限をスキップ
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

  // 送信成功処理
  lastSentTimes.set(user.username, currentTime);

  res.json({
    success: true,
    message: user.isAdmin 
      ? '👑 管理者権限で制限なし送信しました！' 
      : '✅ メッセージを送信しました！'
  });
});


// ==========================================
// API 4: ログアウト処理
// ==========================================
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'ログアウトに失敗しました' });
    }
    res.clearCookie('connect.sid'); // セッションCookieの削除
    res.json({ success: true, message: 'ログアウトしました🐾' });
  });
});


// サーバー起動
app.listen(PORT, () => {
  console.log(`🐱 サーバーが起動しました: http://localhost:${PORT}`);
});

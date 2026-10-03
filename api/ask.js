// 【① 混雑・モデル廃止時に自動で控えモデルへ切り替える通信関数】
async function fetchWithFallback(models, apiKey, payload) {
  let lastError = null;

  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status === 503 || response.status === 404) {
        console.warn(`モデル ${modelName} で ${response.status} が発生。控えモデルへ試行します...`);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("利用可能なモデルで応答を取得できませんでした。");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "環境変数 GEMINI_API_KEY が設定されていません。" });
  }

  // 安定して動作する最新モデル一覧
  const MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro"];

  try {
    const { mode, topic, explanation, history } = req.body;

    /* =====================================
       AI生徒との授業 (mode === "student")
    ===================================== */
    if (mode === "student") {
      // 会話履歴を Gemini API の形式に変換
      const contents = (history || []).map(item => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      }));

      // contents が空の場合は初期メッセージを入れる
      if (contents.length === 0 && explanation) {
        contents.push({
          role: "user",
          parts: [{ text: `【学習テーマ】${topic}\n${explanation}` }]
        });
      }

      const response = await fetchWithFallback(MODELS, apiKey, {
        systemInstruction: {
          parts: [{
            text: `あなたは「しるねこ」という学習アプリのAI生徒です。
現在学びたいテーマは【 ${topic || "指定されたテーマ"} 】です。利用者の先生からこのテーマについて教えてもらいます。

【あなたの設定・キャラクター】
・あなたは「${topic}」についての予備知識がゼロの子猫生徒です。
・自分が今から学ぶテーマが「${topic}」であることを知っています。「テーマってなに？」と聞き返してはいけません。
・語尾に「にゃ」をつけて子猫らしくかわいく返答してください。

【会話のルール】
・「${topic}」について先生（利用者）が教えてくれるので、素直に耳を傾け、気になったことや分からないことを1度に1つだけ質問してください。
・いきなり自分で正解を長く解説しないでください。
・利用者の説明を勝手に添削しないでください。
・十分に理解できたら「CLEAR」と返してください。`
          }]
        },
        contents: contents
      });

      const geminiData = await response.json();

      if (!response.ok) {
        console.error("Gemini API Error:", geminiData);
        return res.status(500).json({
          error: geminiData.error?.message || "Gemini APIとの通信に失敗しました。"
        });
      }

      const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

      return res.status(200).json({
        reply: replyText || "うーん……もう少し教えてほしいにゃ🐱"
      });
    }

    return res.status(400).json({ error: "modeが指定されていません。" });

  } catch (error) {
    console.error("サーバーエラー:", error);
    return res.status(500).json({ error: "AIとの接続処理でエラーが発生しました。" });
  }
}

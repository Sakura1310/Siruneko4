// 【① エラー発生時に自動で稼働中の控えモデルへ切り替える通信関数】
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

      // 200 OK（成功）の場合のみ正常応答として返す
      if (response.ok) {
        return response;
      }

      // 失敗時はGoogleからのエラー詳細ログを出力して次のモデルへ
      const errJson = await response.json().catch(() => ({}));
      console.warn(`モデル ${modelName} でエラーが発生 (${response.status}):`, errJson?.error?.message || errJson);
      lastError = new Error(`モデル ${modelName} がエラー (${response.status}) を返しました。`);

    } catch (err) {
      console.warn(`モデル ${modelName} 通信例外:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error("すべてのモデルで応答を取得できませんでした。");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "環境変数 GEMINI_API_KEY が設定されていません。" });
  }

  // 現在正式に提供されている最新モデルのリスト
  const MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash"
  ];

  try {
    const { mode, topic, explanation, history } = req.body;

    /* =====================================
       ① 学習プラン生成 (mode === "plan")
    ===================================== */
    if (mode === "plan") {
      const prompt = `あなたは「しるねこ」という学習アプリの学習設計AIです。
学びたいテーマ：「${topic}」

このテーマについて、初心者が理解を深めていくためのおすすめ学習ステップを4つ、そして【「${topic}」という分野そのものに関する重要な基礎知識・重要ポイント】を3つ作ってください。

必ず以下のJSON形式のみで出力してください：
{
  "steps": ["ステップ1", "ステップ2", "ステップ3", "ステップ4"],
  "points": ["ポイント1", "ポイント2", "ポイント3"]
}`;

      const response = await fetchWithFallback(MODELS, apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const geminiData = await response.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      const result = JSON.parse(rawText);

      return res.status(200).json({
        steps: result.steps || [],
        points: result.points || []
      });
    }

    /* =====================================
       ② AI生徒との授業 (mode === "student")
    ===================================== */
    if (mode === "student") {
      const contents = (history || []).map(item => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      }));

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
      const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

      return res.status(200).json({
        reply: replyText || "うーん……もう少し教えてほしいにゃ🐱"
      });
    }

    /* =====================================
       ③ 会話の自動要約 (mode === "summarize")
    ===================================== */
    if (mode === "summarize") {
      const prompt = `あなたは学習アプリ「しるねこ」の要約AIです。
以下の「${topic}」に関する授業の会話履歴を読み、ユーザーが学んだ要点と子猫生徒の成長をわかりやすくまとめてください。

会話履歴：
${JSON.stringify(history || [])}

必ず以下のJSON形式のみで出力してください：
{
  "summary": "今回の授業で学んだ内容のわかりやすい要約（2〜3文）",
  "keyTakeaways": ["学んだ重要ポイント1", "学んだ重要ポイント2", "学んだ重要ポイント3"],
  "catComment": "子猫生徒からの感謝と感想メッセージ（語尾は「にゃ」）"
}`;

      const response = await fetchWithFallback(MODELS, apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const geminiData = await response.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      const result = JSON.parse(rawText);

      return res.status(200).json({
        summary: result.summary || "授業の要約を作成しました。",
        keyTakeaways: result.keyTakeaways || [],
        catComment: result.catComment || "先生、教えてくれてありがとうにゃ！"
      });
    }

    return res.status(400).json({ error: "modeが指定されていません。" });

  } catch (error) {
    console.error("サーバーエラー:", error);
    return res.status(500).json({ error: "AIとの接続処理でエラーが発生しました。" });
  }
}

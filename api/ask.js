// 【① 503混雑や404エラー時にモデルを変えて自動再試行する通信関数】
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

      // 503（混雑中）や404（モデル廃止/非対応）の場合は次のモデルへ切り替えて試す
      if (response.status === 503 || response.status === 404) {
        console.warn(`モデル ${modelName} でステータス ${response.status} が発生したため、控えモデルへ切り替えます...`);
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

  // 最新モデル（3.8）をメインにし、控えに長期安定版（1.5-latest）を配置
  const MODELS = ["gemini-3.8-flash", "gemini-1.5-flash-latest"];

  try {
    const { mode, topic, level, explanation, history } = req.body;

    /* =====================================
       ① 学習プラン生成 (mode === "plan")
    ===================================== */
    if (mode === "plan") {
      const prompt = `あなたは「しるねこ」という学習アプリの学習設計AIです。
学びたいテーマ：「${topic}」

このテーマについて、初心者が理解を深めていくためのおすすめ学習ステップを4つ、そして【「${topic}」という分野そのものに関する重要な基礎知識・重要ポイント】を3つ作ってください。

【ルール】
・学習ステップは初心者が「何を理解すればいいか」が順を追って分かる文章にする
・重要ポイントは「毎日勉強する」といった学習方法のコツではなく、「${topic}」という分野自体の具体的な知識・概念・キーポイントにする
・専門用語だけを並べず、初心者にも分かりやすく解説する

必ず以下のJSON形式のみで出力してください：
{
  "steps": [
    "学習ステップ1",
    "学習ステップ2",
    "学習ステップ3",
    "学習ステップ4"
  ],
  "points": [
    "重要ポイント1（${topic}の具体知識）",
    "重要ポイント2（${topic}の具体知識）",
    "重要ポイント3（${topic}の具体知識）"
  ]
}`;

      const response = await fetchWithFallback(MODELS, apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const geminiData = await response.json();

      if (!response.ok) {
        console.error("Gemini API Error:", geminiData);
        return res.status(500).json({
          error: geminiData.error?.message || "Gemini APIとの通信に失敗しました。"
        });
      }

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

      const userMessage = explanation 
        ? `【今回教える内容】\n${explanation}`
        : `【先生からの最初の挨拶】\n今から「${topic}」について勉強を始めるよ！よろしくね！`;

      contents.push({
        role: "user",
        parts: [{ text: userMessage }]
      });

      const response = await fetchWithFallback(MODELS, apiKey, {
        systemInstruction: {
          parts: [{
            text: `あなたは「しるねこ」という学習アプリのAI生徒です。
現在学びたいテーマは【 ${topic || "指定されたテーマ"} 】です。あなたは今からこの「${topic || "指定されたテーマ"}」について、利用者の先生から教えてもらいます。

【あなたの設定・キャラクター】
・あなたは「${topic}」についての予備知識がゼロの子猫生徒です。
・自分が今から学ぶテーマが「${topic}」であることをしっかり知っています。そのため「テーマってなに？」と聞き返してはいけません。
・利用者が先生、あなたが生徒です。
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
  "keyTakeaways": [
    "学んだ重要ポイント1",
    "学んだ重要ポイント2",
    "学んだ重要ポイント3"
  ],
  "catComment": "子猫生徒からの感謝と感想メッセージ（語尾は「にゃ」）"
}`;

      const response = await fetchWithFallback(MODELS, apiKey, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const geminiData = await response.json();

      if (!response.ok) {
        console.error("Gemini API Error:", geminiData);
        return res.status(500).json({
          error: geminiData.error?.message || "Gemini APIとの通信に失敗しました。"
        });
      }

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

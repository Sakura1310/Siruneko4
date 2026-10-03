// 【エラー原因を隠さず詳細ログとして返却する処理】
async function fetchWithFallback(models, apiKey, payload) {
  let lastDetails = [];

  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return { ok: true, text: data.candidates[0].content.parts[0].text };
      }

      // エラーの詳細メッセージを記録
      const errMsg = data.error?.message || `HTTP ${response.status}`;
      console.warn(`モデル ${modelName} 失敗: ${errMsg}`);
      lastDetails.push(`[${modelName}]: ${errMsg}`);

    } catch (err) {
      lastDetails.push(`[${modelName}]: ${err.message}`);
    }
  }

  return { ok: false, errorDetail: lastDetails.join(" / ") };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "環境変数 GEMINI_API_KEY がVercelに設定されていません。" });
  }

  // 試行するモデル候補
  const MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
  ];

  try {
    const { mode, topic, explanation, history } = req.body;

    if (mode === "student") {
      let formattedHistory = (history || []).map(item => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      }));

      // 先頭が model の場合は取り除く
      while (formattedHistory.length > 0 && formattedHistory[0].role === "model") {
        formattedHistory.shift();
      }

      if (formattedHistory.length === 0 && explanation) {
        formattedHistory.push({
          role: "user",
          parts: [{ text: `【学習テーマ: ${topic}】\n${explanation}` }]
        });
      }

      const result = await fetchWithFallback(MODELS, apiKey, {
        systemInstruction: {
          parts: [{
            text: `あなたは学習アプリのAI生徒です。テーマ「${topic}」について予備知識ゼロの子猫生徒として語尾に「にゃ」をつけて短く返答・質問してください。`
          }]
        },
        contents: formattedHistory
      });

      if (result.ok) {
        return res.status(200).json({ reply: result.text });
      } else {
        // エラー詳細をそのままフロントに返す
        return res.status(500).json({ error: result.errorDetail });
      }
    }

    return res.status(400).json({ error: "modeが不適切です。" });

  } catch (error) {
    return res.status(500).json({ error: `サーバー処理例外: ${error.message}` });
  }
}

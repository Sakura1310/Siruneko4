// 【① エラー発生時に自動で稼働中の控えモデルへ切り替える通信関数】
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

      if (response.ok && data.candidates?.[0]) {
        return { ok: true, data: data, model: modelName };
      }

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

      // 先頭が model の場合は取り除く（Geminiのルール対策）
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
        // candidates の parts 配列の中から 'text' を持っている要素を確実に抽出
        const parts = result.data.candidates?.[0]?.content?.parts || [];
        const replyPart = parts.find(p => p.text && typeof p.text === 'string');
        const replyText = replyPart ? replyPart.text : null;

        if (replyText) {
          return res.status(200).json({ reply: replyText });
        } else {
          // テキストが見つからない場合は生のデータ構造を出力
          console.error("テキスト抽出失敗:", JSON.stringify(result.data));
          return res.status(500).json({ 
            error: `AI応答解析エラー (モデル: ${result.model}): ${JSON.stringify(result.data.candidates?.[0] || result.data)}` 
          });
        }
      } else {
        return res.status(500).json({ error: result.errorDetail });
      }
    }

    return res.status(400).json({ error: "modeが不適切です。" });

  } catch (error) {
    return res.status(500).json({ error: `サーバー処理例外: ${error.message}` });
  }
}

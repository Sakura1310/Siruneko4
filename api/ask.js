export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "環境変数 GEMINI_API_KEY がVercelに設定されていません。" });
  }

  const { topic, history } = req.body;

  // 現在確実に利用可能なモデルの候補（上から順に試行されます）
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro"
  ];
  let errorLogs = [];

  // 履歴の整形（先頭を必ず user にする）
  let contents = (history || []).map(item => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }]
  }));

  while (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
  }

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `あなたは学習アプリのAI生徒です。テーマ「${topic || '指定なし'}」について予備知識ゼロの子猫生徒として語尾に「にゃ」をつけて短く回答してください。` }]
          },
          contents: contents
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.candidates?.[0]?.content?.parts) {
        const textPart = data.candidates[0].content.parts.find(p => p.text);
        if (textPart && textPart.text) {
          return res.status(200).json({ reply: textPart.text });
        }
      }

      const msg = data.error?.message || `HTTP ${response.status}`;
      errorLogs.push(`[${model}]: ${msg}`);

    } catch (err) {
      errorLogs.push(`[${model} 例外]: ${err.message}`);
    }
  }

  return res.status(500).json({ error: errorLogs.join(" / ") });
}

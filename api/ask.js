export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "環境変数 GEMINI_API_KEY が設定されていません。" });
  }

  try {
    const { mode, topic, level, explanation, history } = req.body;

    /* =====================================
       ① 学習プラン生成 (mode === "plan")
    ===================================== */
    if (mode === "plan") {
      const prompt = `あなたは「しるねこ」という学習アプリの学習設計AIです。
学びたいテーマ：「${topic}」

このテーマについて、初心者が理解を深めていくためのおすすめ学習ステップを4つ、特に重要なポイントを3つ作ってください。

【ルール】
・テーマが何であっても対応する
・初心者でも理解しやすい順番にする
・専門用語だけを並べない
・学習ステップは「何を理解するか」が分かる文章にする
・重要ポイントは短く具体的にする

必ず以下のJSON形式のみで出力してください：
{
  "steps": [
    "学習ステップ1",
    "学習ステップ2",
    "学習ステップ3",
    "学習ステップ4"
  ],
  "points": [
    "重要ポイント1",
    "重要ポイント2",
    "重要ポイント3"
  ]
}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        }
      );

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
      // 会話履歴をGeminiの形式（user / model）に変換
      const contents = (history || []).map(item => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }]
      }));

      // 今回の説明を追加
      contents.push({
        role: "user",
        parts: [{ text: `学習テーマ：${topic}\nこれまでの説明を踏まえた今回の説明：${explanation || "まだ説明はありません"}` }]
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `あなたは「しるねこ」という学習アプリのAI生徒です。利用者が先生、あなたが予備知識ゼロの子猫生徒です。

【重要なルール】
・いきなり正解を長く説明しない
・利用者の説明を勝手に添削しない
・質問は一度に1つだけ
・初心者の生徒として自然に質問する
・語尾に「にゃ」をつけて子猫らしくかわいく返答する
・十分に理解できたら「CLEAR」と返す`
              }]
            },
            contents: contents
          })
        }
      );

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

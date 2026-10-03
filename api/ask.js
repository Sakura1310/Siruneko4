import OpenAI from "openai";

// GeminiのOpenAI互換エンドポイントを設定
const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { mode, topic, level, explanation, history } = req.body;

    /*
    =====================================
    ① 学習テーマから学習ステップ＋重要ポイントを作る
    =====================================
    */
    if (mode === "plan") {
      const response = await client.chat.completions.create({
        model: "gemini-1.5-flash",
        messages: [
          {
            role: "system",
            content: `あなたは「しるねこ」という学習アプリの学習設計AIです。
利用者がこれから学びたいテーマを入力します。
そのテーマについて、初心者が理解を深めていくための「おすすめ学習ステップ」を4つ、「特に重要なポイント」を3つ作ってください。

重要なルール：
・テーマが何であっても対応する
・初心者でも理解しやすい順番にする
・専門用語だけを並べない
・学習ステップは「何を理解するか」が分かる文章にする
・重要ポイントは短く具体的にする
・返答は必ず以下のJSON形式のみを出力してください。`
          },
          {
            role: "user",
            content: `学びたいテーマ：\n${topic}\n\n以下のJSON形式のみで返してください：\n{\n  "steps": ["ステップ1", "ステップ2", "ステップ3", "ステップ4"],\n  "points": ["ポイント1", "ポイント2", "ポイント3"]\n}`
          }
        ],
        response_format: { type: "json_object" }
      });

      let result;
      try {
        result = JSON.parse(response.choices[0].message.content);
      } catch {
        return res.status(500).json({
          error: "学習プランの解析に失敗しました。",
        });
      }

      return res.status(200).json({
        steps: result.steps || [],
        points: result.points || [],
      });
    }

    /*
    =====================================
    ② AI生徒との授業
    =====================================
    */
    if (mode === "student") {
      const response = await client.chat.completions.create({
        model: "gemini-1.5-flash",
        messages: [
          {
            role: "system",
            content: `あなたは「しるねこ」という学習アプリのAI生徒です。
あなたは先生ではありません。利用者が先生、あなたが予備知識ゼロの子猫生徒です。

重要なルール：
・いきなり正解を長く説明しない
・利用者の説明を勝手に添削しない
・質問は一度に1つだけ
・初心者の生徒として自然に質問する
・利用者の説明から質問を作る
・難しい言葉を使いすぎない
・十分に理解できたら「CLEAR」と返す`
          },
          {
            role: "user",
            content: `学習テーマ：${topic}
利用者の知識レベル：${level || "まだ分からない"}
これまでの会話：${JSON.stringify(history || [])}
今回の利用者の説明：${explanation || "まだ説明はありません"}

子猫生徒として自然に返答してください。`
          }
        ]
      });

      return res.status(200).json({
        reply: response.choices[0].message.content,
      });
    }

    return res.status(400).json({
      error: "modeが指定されていません。",
    });

  } catch (error) {
    console.error("API実行エラー:", error);
    return res.status(500).json({
      error: "AIとの接続に失敗しました。",
    });
  }
}

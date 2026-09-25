
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { topic, level, explanation } = req.body;

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      instructions: `
あなたは「しるねこ」という学習アプリのAI生徒です。

あなたは先生ではありません。
利用者が先生、あなたが生徒です。

利用者の説明を読んで、
・分からないところ
・もっと知りたいところ
・説明を聞いて疑問に思ったこと
を、生徒らしく質問してください。

利用者の説明を勝手に添削したり、
いきなり正解を長く説明したりしないでください。

会話を続け、あなたが十分に理解できたら
最後に「CLEAR」と返してください。
      `,
      input: `
学習テーマ：${topic}
利用者の知識レベル：${level}

利用者の説明：
${explanation || "まだ説明はありません"}

生徒として自然に返答してください。
      `,
    });

    return res.status(200).json({
      reply: response.output_text,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "AIとの接続に失敗しました。",
    });
  }
}

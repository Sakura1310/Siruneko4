import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only",
    });
  }

  try {
    const {
      mode,
      topic,
      level,
      explanation,
      history,
    } = req.body;


    /*
    =====================================
    ① 学習テーマから
       学習ステップ＋重要ポイントを作る
    =====================================
    */

    if (mode === "plan") {

      const response = await client.responses.create({

        model: "gpt-5.6-luna",

        instructions: `
あなたは「しるねこ」という学習アプリの学習設計AIです。

利用者がこれから学びたいテーマを入力します。

そのテーマについて、
初心者が理解を深めていくための
おすすめ学習ステップを4つ作ってください。

さらに、そのテーマを理解するうえで
特に重要なポイントを3つ作ってください。

重要なルール：

・テーマが何であっても対応する
・登録販売者など特定の分野だけに限定しない
・初心者でも理解しやすい順番にする
・専門用語だけを並べない
・学習ステップは「何を理解するか」が分かる文章にする
・重要ポイントは短く具体的にする
`,

        input: `
学びたいテーマ：
${topic}

以下のJSONだけを返してください。

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
}
`,
      });


      let result;

      try {

        result =
          JSON.parse(response.output_text);

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

      const response =
        await client.responses.create({

          model: "gpt-5.6-luna",

          instructions: `
あなたは「しるねこ」という
学習アプリのAI生徒です。

あなたは先生ではありません。

利用者が先生、
あなたが予備知識ゼロの子猫生徒です。

テーマについて利用者が説明します。

あなたはその説明を聞いて、

・分からないところ
・もっと知りたいところ
・説明を聞いて疑問に思ったこと

を、子猫生徒らしく質問してください。

重要なルール：

・いきなり正解を長く説明しない
・利用者の説明を勝手に添削しない
・質問は一度に1つだけ
・初心者の生徒として自然に質問する
・利用者の説明から質問を作る
・難しい言葉を使いすぎない
・十分に理解できたら「CLEAR」と返す
`,

          input: `
学習テーマ：
${topic}

利用者の知識レベル：
${level || "まだ分からない"}

これまでの会話：
${JSON.stringify(history || [])}

今回の利用者の説明：
${explanation || "まだ説明はありません"}

子猫生徒として自然に返答してください。
`,
        });


      return res.status(200).json({
        reply: response.output_text,
      });
    }


    return res.status(400).json({
      error: "modeが指定されていません。",
    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "AIとの接続に失敗しました。",
    });
  }
}

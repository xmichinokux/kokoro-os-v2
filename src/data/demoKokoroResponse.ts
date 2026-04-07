import type { KokoroResponse } from "@/types/kokoroOutput";

export const demoKokoroResponse: KokoroResponse = {
  mode: "core",
  headline: "今は無理に決めなくていい。でも「何が引っかかっているか」だけは言葉にしておくと、次の一歩が見えやすくなる。",
  personas: [
    {
      persona: "canon",
      weight: 0.35,
      tone: "high",
      summary: "迷いの中にこそ、まだ言葉になっていない大切な何かがある。",
    },
    {
      persona: "shin",
      weight: 0.30,
      tone: "high",
      summary: "選択肢を並べて、それぞれのリスクとリターンを整理しよう。",
    },
    {
      persona: "gnome",
      weight: 0.20,
      tone: "mid",
      summary: "焦って決めると、あとで後悔しやすいから気をつけて。",
    },
    {
      persona: "dig",
      weight: 0.15,
      tone: "low",
      summary: "正解なんてないんだから、とりあえず動いてみれば？",
    },
  ],
  conflict: {
    axes: ["安全 vs 変化", "慎重さ vs 行動力"],
  },
  convergence: {
    conclusion: "まず「何がモヤモヤしているか」を紙に書き出してみる。決断は明日でもいい。",
    action: [
      "今日：モヤモヤを3つ書き出す",
      "今週：信頼できる人に1つだけ話してみる",
    ],
    trueFeeling: "本当は、もう答えは出ているのに、それを認めるのが怖いだけかもしれない。",
  },
};

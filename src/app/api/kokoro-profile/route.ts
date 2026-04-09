import { NextRequest, NextResponse } from 'next/server';

const SYSTEM = `あなたはKokoro OSのプロフィール分析AIです。
ユーザーのNote履歴を読んで、その人の特徴・好み・ライフスタイルを分析し、プロフィールとして構造化してください。

以下のJSONのみを返してください（確証がない項目は空文字にしてください）：
{
  "p_name": "呼び名（分かれば）",
  "p_age": "10代/20代前半/20代後半/30代前半/30代後半/40代前半/40代後半/50代/60代以上 のいずれか",
  "p_gender": "男性/女性/ノンバイナリー/回答しない のいずれか",
  "p_location": "居住地（分かれば）",
  "p_style": "好みのファッションスタイル",
  "p_brands": "よく使うブランド（分かれば）",
  "p_colors": "好きな色・NGな色",
  "p_budget": "〜3,000円/3,000〜8,000円/8,000〜15,000円/15,000〜30,000円/30,000円〜 のいずれか",
  "p_usage": "服の主な用途",
  "p_fashion_memo": "ファッションに関するその他の傾向・こだわり",
  "p_family_size": "1人/2人/3人/4人/5人以上 のいずれか",
  "p_cook_skill": "ほぼしない/簡単なものだけ/普通/得意/凝ったものも作る のいずれか",
  "p_allergy": "アレルギー・NG食材",
  "p_diet": "食の制限",
  "p_food_pref": "好きな料理・よく食べるもの",
  "p_recipe_memo": "料理環境・その他メモ",
  "p_work": "会社員（出社）/会社員（リモート）/フリーランス/学生/自営業/その他 のいずれか",
  "p_living": "一人暮らし/パートナーと同居/家族と同居/シェアハウス のいずれか",
  "p_hobbies": "趣味・興味",
  "p_memo": "その他の特徴・気質・傾向",
  "summary": "この人物の全体的な特徴を2〜3文で（フォームには入らない分析コメント）"
}`;

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSONのパースに失敗しました');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const { notesText } = await req.json();

    if (!notesText || typeof notesText !== 'string' || !notesText.trim()) {
      return NextResponse.json({ error: 'Note がありません' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    // 8000文字までに制限
    const trimmed = notesText.length > 8000 ? notesText.slice(0, 8000) + '...(省略)' : notesText;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM,
        messages: [
          { role: 'user', content: `以下はユーザーのNote履歴です：\n\n${trimmed}` },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;
    const parsed = safeParseJSON(raw);

    return NextResponse.json({ profile: parsed });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

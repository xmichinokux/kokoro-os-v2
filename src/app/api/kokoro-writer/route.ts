import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import { createServerSupabase } from '@/lib/supabase/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

const LITE_SYSTEM = `あなたはKokoro OSのWriterエンジン（Liteモード）です。
入力された文章を**一切リライトせず**、Medium風の美しいレイアウトに整形してください。

【ルール】
・文章の内容・表現・語尾は一切変更しない
・見出し・段落・リード文などの構造をつけてレイアウトする
・余白が美しさをつくる。詰め込まない
・装飾よりタイポグラフィで階層を表現
・Medium や note.com のような洗練された読み物スタイル

【禁止】
・リライト・言い換え・内容の追加/削除
・語尾の変更
・文章構造の意味的な変更

以下のHTMLクラスを使ってレイアウトしてください：
タイトル：      <h1 class="wt">タイトルテキスト</h1>
リード文：      <p class="wlead">冒頭のリード文</p>
大見出し：      <h2 class="wh2">見出しテキスト</h2>
小見出し：      <h3 class="wh3">小見出しテキスト</h3>
通常段落：      <p class="wp">本文テキスト</p>
センタリング：  <p class="wcenter">中央揃えのテキスト</p>
右寄せ：        <p class="wright">右寄せのテキスト</p>
強調テキスト：  <strong class="wstrong">重要な言葉</strong>
箇条書き：      <ul class="wul"><li>項目</li></ul>
番号リスト：    <ol class="wol"><li>手順</li></ol>
区切り線：      <hr class="whr">
引用・抜粋：    <blockquote class="wbq">引用テキスト</blockquote>
キャプション：  <p class="wcaption">注釈・補足</p>

以下のXMLフォーマットのみで返答してください：

<edited>
<!-- HTMLをここに -->
</edited>
<memos>
レイアウトの意図を簡潔に
</memos>
<suggestion>
改善提案（任意）
</suggestion>`;

const CORE_SYSTEM = `あなたはKokoro OSの「Writerエンジン」です。
4つの人格（ノーム・シン・カノン・ディグ）が協力して、
文章をモダンでスタイリッシュな読み物としてレイアウトします。

【各人格の役割】
- ノーム：読みやすさ・温かみ・共感的な言い換え
- シン：論理構造・見出し設計・情報の優先順位
- カノン（メイン）：文体統一・全体構成・ビジュアルレイアウト
- ディグ：表現の豊かさ・比喩・独自性のある切り口

【デザイン哲学】
・余白が美しさをつくる。詰め込まない
・装飾よりタイポグラフィ。ボーダーや色より文字の大きさと間隔で階層を表現
・読んでいて心地よいリズムを作る
・Medium や note.com のような洗練された読み物スタイルを目指す

【絶対ルール】
・元の文章の意図・個性・トーンを壊さない
・内容を勝手に大幅追加しない
・一人称・固有名詞は変えない
・HTMLタグは安全なもののみ使用（スクリプト不可）

【HTMLレイアウト仕様】
以下のHTMLクラスを使ってレイアウトしてください：

タイトル：      <h1 class="wt">タイトルテキスト</h1>
リード文：      <p class="wlead">冒頭のリード文（大きめ・インパクト）</p>
大見出し：      <h2 class="wh2">見出しテキスト</h2>
小見出し：      <h3 class="wh3">小見出しテキスト</h3>
通常段落：      <p class="wp">本文テキスト</p>
センタリング：  <p class="wcenter">中央揃えのテキスト</p>
右寄せ：        <p class="wright">右寄せのテキスト（日付・署名など）</p>
強調テキスト：  <strong class="wstrong">重要な言葉</strong>
箇条書き：      <ul class="wul"><li>項目</li></ul>
番号リスト：    <ol class="wol"><li>手順</li></ol>
区切り線：      <hr class="whr">
引用・抜粋：    <blockquote class="wbq">引用テキスト</blockquote>
キャプション：  <p class="wcaption">注釈・補足</p>

以下のXMLフォーマットのみで返答してください：

<edited>
<!-- HTMLをここに -->
</edited>
<memos>
【ノームより】内容
【シンより】内容
【カノンより】内容
【ディグより】内容
</memos>
<suggestion>
改善提案（任意）
</suggestion>`;

type SparkFormat = 'default' | 'poem' | 'story' | 'email_formal' | 'email_casual' | 'sns' | 'pitch_lead' | 'self_intro' | 'speech' | 'ad_copy' | 'review' | 'letter';

const SPARK_FORMAT_INSTRUCTIONS: Record<SparkFormat, string> = {
  default: '一つの読み物として、自然な長さで展開する。',
  poem: '詩として展開する。余白と行間に意味を持たせ、リズムを大切にする。装飾を削ぎ落とし、言葉そのものを光らせる。',
  story: '短いストーリーとして展開する。主人公の一視点で、情景描写と内面の往復で進める。',
  email_formal: 'ビジネスメールとして展開する。件名・宛名・本文・結び・署名の構造を持たせ、敬語で簡潔に。タイトル（h1 class="wt"）は件名、段落で宛名・本文・結びを分ける。',
  email_casual: 'カジュアルなメール・メッセージとして展開する。親しみのある文体、でも気遣いは残す。',
  sns: 'SNS 投稿として 140〜280 文字程度に凝縮する。一息で読める短さに、核となる一言を込める。',
  pitch_lead: '企画書のリード文として展開する。コンセプトを簡潔に伝え、読み手の関心を引く。タイトル + リード段落 + 3 つの要点の構造。',
  self_intro: '自己紹介文として展開する。読み手に伝わる温度で、経歴の羅列ではなく「何を大事にしているか」が見える文章に。',
  speech: 'プレゼン台本として展開する。話し言葉で、聞き手の注意を引く掴み → 本題 → 結びの流れで。句読点は話すリズムに合わせる。',
  ad_copy: '広告コピーとして展開する。短く強い言葉で心を動かす。キャッチコピー（h1）+ ボディコピー（リード）+ タグライン（右寄せ）の構造。',
  review: '感想文として展開する。主観的な視点で率直に。「私にとって」を軸にした温度のある文章に。',
  letter: '手紙として展開する。受け手への敬意を込めた文体で、季節の挨拶 → 本文 → 結びの伝統的構造で。',
};

const SPARK_SYSTEM_BASE = `あなたはKokoro OSのWriterエンジン（Sparkモード）です。
入力されたキーワード・断片・メモを、一つの文章として展開してください。

【ルール】
・入力はキーワードの羅列・箇条書き・断片的なメモでOK
・それらを繋いで、一つの可能性ある文章を生成する
・正解の文章である必要はない。AIの解釈による「一つの解釈」でよい
・読んだ人が「あ、こういう意味だったのか」という発見を生む文章を目指す
・元のキーワードの意味・雰囲気を尊重する
・長さは入力量に応じて自然な長さに

【禁止】
・入力にない概念の大量追加
・説明的・説教的な文章
・箇条書きのまま返すこと

Deepモードと同じHTMLレイアウト形式で返してください。
以下のXMLフォーマットのみで返答してください：

<edited>
<!-- HTMLをここに -->
</edited>
<memos>
展開の意図を簡潔に
</memos>
<suggestion>
改善提案（任意）
</suggestion>

HTMLクラス：
タイトル：      <h1 class="wt">タイトル</h1>
リード文：      <p class="wlead">リード文</p>
大見出し：      <h2 class="wh2">見出し</h2>
小見出し：      <h3 class="wh3">小見出し</h3>
通常段落：      <p class="wp">本文</p>
強調：          <strong class="wstrong">重要</strong>
箇条書き：      <ul class="wul"><li>項目</li></ul>
番号リスト：    <ol class="wol"><li>手順</li></ol>
区切り線：      <hr class="whr">
引用：          <blockquote class="wbq">引用</blockquote>`;

const MICHI_SYSTEM = `以下はこのユーザーの文体・思想・センスの分析です。

{driveContext}

---

この分析をもとに、以下の文章を「このユーザーが書いたら書くような文章」にレイアウト・整形してください。

ルール：
・感性キャッシュに含まれる固有の造語・専門用語・特殊単語は使わない
・文体・リズム・思想の傾向のみを反映する
・余計な装飾を避けてシンプルに
・ユーザーのリズム・改行の癖を反映する
・元の文章の意図を保ちながらユーザーらしさを加える

以下のHTMLクラスを使ってレイアウトしてください：
タイトル：<h1 class="wt">
リード文：<p class="wlead">
大見出し：<h2 class="wh2">
小見出し：<h3 class="wh3">
通常段落：<p class="wp">
強調：<strong class="wstrong">
箇条書き：<ul class="wul"><li>
区切り線：<hr class="whr">
引用：<blockquote class="wbq">

以下のXMLフォーマットのみで返答してください：

<edited>
<!-- HTMLをここに -->
</edited>
<memos>
感性モードとしての意図を簡潔に
</memos>
<suggestion>
改善提案（任意）
</suggestion>`;

const TRIP_SYSTEM = `以下はある存在のトリップした文章の分析です：

{tripCache}

---

あなたはKokoro OSのWriterエンジン（Tripモード）です。
上記のトリップ文章の文体・語彙・飛躍・熱量を完全に再現して
入力された文章を変換してください。

ルール：
・独自の造語・概念を積極的に使う
・論理の飛躍を恐れない
・熱量を最大まで上げる
・「受肉」「SYNC」「兆確定」的な表現を使う
・普通の文章を宇宙的・哲学的なスケールに昇華する
・でも元の文章の意図は保持する

以下のHTMLクラスを使ってレイアウトしてください：
タイトル：<h1 class="wt">
リード文：<p class="wlead">
大見出し：<h2 class="wh2">
小見出し：<h3 class="wh3">
通常段落：<p class="wp">
強調：<strong class="wstrong">
箇条書き：<ul class="wul"><li>
区切り線：<hr class="whr">
引用：<blockquote class="wbq">

以下のXMLフォーマットのみで返答してください：

<edited>
<!-- HTMLをここに -->
</edited>
<memos>
トリップモードとしての意図を簡潔に
</memos>
<suggestion>
改善提案（任意）
</suggestion>`;

async function loadDriveContext(accessToken: string): Promise<{ context: string; files: string[] }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  // zineフォルダを検索
  const folderRes = await drive.files.list({
    q: "name='zine' and mimeType='application/vnd.google-apps.folder'",
    fields: 'files(id, name)',
  });
  const folder = folderRes.data.files?.[0];
  if (!folder) throw new Error('Googleドライブに「zine」フォルダが見つかりません');

  // フォルダ内のテキスト系ファイルを取得
  const filesRes = await drive.files.list({
    q: `'${folder.id}' in parents and (mimeType='text/plain' or mimeType='application/vnd.google-apps.document')`,
    fields: 'files(id, name, mimeType)',
    pageSize: 10,
  });
  const files = filesRes.data.files || [];

  let driveContext = '';
  const loadedFiles: string[] = [];
  for (const file of files.slice(0, 5)) {
    try {
      if (file.mimeType === 'application/vnd.google-apps.document') {
        const content = await drive.files.export({ fileId: file.id!, mimeType: 'text/plain' });
        driveContext += `\n\n[${file.name}]\n${content.data}`;
      } else {
        const content = await drive.files.get({ fileId: file.id!, alt: 'media' });
        driveContext += `\n\n[${file.name}]\n${content.data}`;
      }
      loadedFiles.push(file.name || 'unknown');
    } catch (e) {
      console.error(`ファイル読み込みエラー: ${file.name}`, e);
    }
  }

  if (driveContext.length > 8000) {
    driveContext = driveContext.slice(0, 8000) + '...(省略)';
  }

  return { context: driveContext, files: loadedFiles };
}

function buildSparkSystem(format: SparkFormat): string {
  const instruction = SPARK_FORMAT_INSTRUCTIONS[format] ?? SPARK_FORMAT_INSTRUCTIONS.default;
  return SPARK_SYSTEM_BASE + `\n\n【今回の出力形式】\n${instruction}`;
}

function buildSystem(mode: string, sparkFormat?: SparkFormat): string {
  if (mode === 'deep') return CORE_SYSTEM;
  if (mode === 'spark') return buildSparkSystem(sparkFormat ?? 'default');
  if (mode === 'core') return CORE_SYSTEM;
  if (mode === 'lite') return LITE_SYSTEM;
  return LITE_SYSTEM;
}

export async function POST(req: NextRequest) {
  const { text, mode, accessToken, sparkFormat } = await req.json() as {
    text: string;
    mode: string;
    accessToken?: string;
    sparkFormat?: SparkFormat;
  };

  // Michiモード: Gemini + Drive（キャッシュ優先）
  if (mode === 'michi') {
    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
      }

      // 感性キャッシュを取得（配合: writing 70% + thought 30%）
      let context = '';
      const loadedFiles: string[] = [];

      try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('sensibility_cache, sensibility_thought_cache')
            .eq('user_id', user.id)
            .single();
          const writing = data?.sensibility_cache || '';
          const thought = data?.sensibility_thought_cache || '';
          if (writing) context += writing;
          if (thought) {
            const thoughtSlice = thought.slice(0, Math.floor(thought.length * 0.43));
            context += '\n\n---\n\n【思想面の補足】\n' + thoughtSlice;
          }
        }
      } catch {
        // キャッシュ取得失敗はフォールバック
      }

      const prompt = MICHI_SYSTEM.replace('{driveContext}', context || '（感性データがありません）') + '\n\n' + text;

      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const geminiResult = await model.generateContent(prompt);
      const result = geminiResult.response.text();

      return NextResponse.json({
        result,
        filesLoaded: loadedFiles,
        contextLength: context.length,
        usedCache: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Tripモード: Gemini + Tripキャッシュ
  if (mode === 'trip') {
    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
      }

      let tripCache = '';
      try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('trip_cache')
            .eq('user_id', user.id)
            .single();
          if (data?.trip_cache) {
            tripCache = data.trip_cache;
          }
        }
      } catch {
        // キャッシュ取得失敗
      }

      if (!tripCache) {
        return NextResponse.json({ error: 'Tripキャッシュがありません。Profileページで「Scan Trip」を実行してください。' }, { status: 400 });
      }

      const prompt = TRIP_SYSTEM.replace('{tripCache}', tripCache) + '\n\n' + text;

      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const geminiResult = await model.generateContent(prompt);
      const result = geminiResult.response.text();

      return NextResponse.json({
        result,
        usedCache: true,
        contextLength: tripCache.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Deepモード: Gemini + 感性マップによるリライト＋レイアウト
  if (mode === 'deep') {
    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
      }

      let context = '';
      try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('sensibility_cache, sensibility_thought_cache')
            .eq('user_id', user.id)
            .single();
          const writing = data?.sensibility_cache || '';
          const thought = data?.sensibility_thought_cache || '';
          if (writing) context += writing;
          if (thought) {
            const thoughtSlice = thought.slice(0, Math.floor(thought.length * 0.43));
            context += '\n\n---\n\n【思想面の補足】\n' + thoughtSlice;
          }
        }
      } catch {
        // キャッシュ取得失敗はフォールバック
      }

      const prompt = MICHI_SYSTEM.replace('{driveContext}', context || '（感性データがありません）') + '\n\n' + text;

      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const geminiResult = await model.generateContent(prompt);
      const result = geminiResult.response.text();

      return NextResponse.json({
        result,
        contextLength: context.length,
        usedCache: !!context,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // 既存モード (lite / spark)
  const baseSystem = buildSystem(mode, sparkFormat);
  const useValueEngine = mode === 'spark';
  const valueInject = useValueEngine ? KokoroValueEngine.forWriterCore() : '';
  const system = (valueInject ? valueInject + '\n\n' : '') + baseSystem;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const result = data.content[0].text as string;

    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

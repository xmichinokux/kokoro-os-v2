import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// フル生成: マスター式から表全体を生成
const GENERATE_SYSTEM = `あなたはKokoro OSの表計算エンジンです。
ユーザーの自然言語の「式」から、構造化されたデータ表を生成します。

ユーザーが求めるデータを正確に計算・調査して表にしてください。
実用的で正確なデータを重視してください。

以下のJSON**のみ**を返してください（説明文やマークダウン不要）:
{
  "title": "表のタイトル",
  "columns": [
    {"id": "col_1", "name": "列名1"},
    {"id": "col_2", "name": "列名2", "formula": "この列のデータの求め方（あれば）"}
  ],
  "rows": [
    ["値1", "値2"],
    ["値1", "値2"]
  ],
  "description": "この表の説明（50文字以内）"
}

・データは5〜15行が目安（ユーザーの要求に応じて調整）
・列は3〜8個が適切
・数値データは正確に。推定の場合は「約」をつける
・列のformulaは「この列がどう計算されるか」の説明（例: "人口÷面積"、"前月比で計算"）`;

// 列追加: 既存データに新しい列を計算して追加
const ADD_COLUMN_SYSTEM = `あなたはKokoro OSの表計算エンジンです。
既存の表に新しい列を追加計算します。

既存の列名とデータ、追加したい列の説明が与えられます。
既存データを参照して新しい列の値を計算してください。

以下のJSON**のみ**を返してください:
{
  "column": {"id": "col_new", "name": "列名", "formula": "計算方法の説明"},
  "values": ["行1の値", "行2の値", ...]
}

・valuesの数は既存の行数と一致させてください
・既存データから論理的に導出できる値を生成してください`;

// 再計算: formula を持つ列だけを現在のデータに基づいて再計算
const RECALCULATE_SYSTEM = `あなたはKokoro OSの表計算エンジンです。
既存の表の中で、計算式(formula)を持つ列の値だけを、現在のデータに基づいて再計算します。

【ルール】
・formula を持たない列（入力列）の値は **絶対に変更しない**
・formula を持つ列（計算列）だけを現在のデータから再計算する
・行数は入力と完全に一致させる
・計算列の順序は入力の順序を保つ（入力と同じ列IDで返す）

以下のJSON**のみ**を返してください:
{
  "updates": [
    {"columnId": "col_3", "values": ["再計算値1", "再計算値2", ...]},
    {"columnId": "col_5", "values": ["再計算値1", "再計算値2", ...]}
  ]
}

・updates に含めるのは formula を持つ列だけ
・各 values の長さは現在の行数と一致させる`;

// 行追加: 既存データのパターンに合わせて行を追加
const ADD_ROWS_SYSTEM = `あなたはKokoro OSの表計算エンジンです。
既存の表にデータ行を追加します。

既存の列構造とデータが与えられます。
ユーザーの指示に従って新しい行を生成してください。

以下のJSON**のみ**を返してください:
{
  "rows": [
    ["値1", "値2", ...],
    ["値1", "値2", ...]
  ]
}

・列数は既存の表と一致させてください
・既存データのパターンと整合性のあるデータを生成してください`;

async function callClaude(system: string, userMessage: string, maxTokens = 2000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  let res: Response | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (res.status !== 529) break;
    await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(1.5, attempt), 10000)));
  }

  if (!res || !res.ok) {
    const err = await res?.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message || `Claude API error (${res?.status})`);
  }

  const data = await res.json();
  return data.content[0].text as string;
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSONの解析に失敗しました');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: string };

    // =====================
    // フル生成
    // =====================
    if (action === 'generate') {
      const { formula } = body as { formula: string };
      if (!formula?.trim()) {
        return NextResponse.json({ error: '式を入力してください' }, { status: 400 });
      }

      const raw = await callClaude(GENERATE_SYSTEM, formula.trim(), 4000);
      const parsed = extractJson(raw) as {
        title: string;
        columns: { id: string; name: string; formula?: string }[];
        rows: string[][];
        description: string;
      };

      // idが無い列にidを付与
      parsed.columns = (parsed.columns || []).map((c, i) => ({
        id: c.id || `col_${i + 1}`,
        name: c.name,
        formula: c.formula,
      }));

      return NextResponse.json({ data: parsed });
    }

    // =====================
    // 列追加
    // =====================
    if (action === 'addColumn') {
      const { columns, rows, columnDescription } = body as {
        columns: { name: string }[];
        rows: string[][];
        columnDescription: string;
      };

      const context = `【既存の表】
列: ${columns.map(c => c.name).join(', ')}
データ:
${rows.slice(0, 20).map(r => r.join('\t')).join('\n')}

【追加したい列】
${columnDescription}`;

      const raw = await callClaude(ADD_COLUMN_SYSTEM, context);
      const parsed = extractJson(raw) as {
        column: { id: string; name: string; formula?: string };
        values: string[];
      };

      return NextResponse.json({ data: parsed });
    }

    // =====================
    // 再計算（formula を持つ列だけを更新）
    // =====================
    if (action === 'recalculate') {
      const { columns, rows } = body as {
        columns: { id: string; name: string; formula?: string }[];
        rows: string[][];
      };

      const formulaColumns = (columns || []).filter(c => c.formula && c.formula.trim());
      if (formulaColumns.length === 0) {
        return NextResponse.json({ data: { updates: [] } });
      }

      const header = columns.map((c, i) => `${i}: ${c.id} = ${c.name}${c.formula ? ` [formula: ${c.formula}]` : ' (入力列)'}`).join('\n');
      const dataRows = rows.map((r, i) => `行${i + 1}: ${r.map((v, j) => `${columns[j]?.name}=${v}`).join(' | ')}`).join('\n');
      const targets = formulaColumns.map(c => `- ${c.id} (${c.name}): ${c.formula}`).join('\n');

      const context = `【列定義】
${header}

【現在のデータ（${rows.length}行）】
${dataRows}

【再計算対象の列】
${targets}

上記の「入力列」の現在値に基づいて、「再計算対象の列」だけを再計算してください。`;

      const raw = await callClaude(RECALCULATE_SYSTEM, context, 4000);
      const parsed = extractJson(raw) as {
        updates: { columnId: string; values: string[] }[];
      };

      return NextResponse.json({ data: parsed });
    }

    // =====================
    // 行追加
    // =====================
    if (action === 'addRows') {
      const { columns, rows, instruction } = body as {
        columns: { name: string }[];
        rows: string[][];
        instruction: string;
      };

      const context = `【既存の表】
列: ${columns.map(c => c.name).join(', ')}
データ（${rows.length}行）:
${rows.slice(0, 10).map(r => r.join('\t')).join('\n')}
${rows.length > 10 ? `...（他${rows.length - 10}行）` : ''}

【追加指示】
${instruction || '同じパターンで3行追加してください'}`;

      const raw = await callClaude(ADD_ROWS_SYSTEM, context);
      const parsed = extractJson(raw) as { rows: string[][] };

      return NextResponse.json({ data: parsed });
    }

    // =====================
    // 旧互換: text → generate
    // =====================
    if (body.text) {
      const raw = await callClaude(GENERATE_SYSTEM, body.text.trim(), 2000);
      const parsed = extractJson(raw);
      return NextResponse.json({ data: parsed });
    }

    return NextResponse.json({ error: '不明なアクションです' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

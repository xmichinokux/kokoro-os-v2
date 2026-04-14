// Kokoro Tuner - HTML Parameter Parser
// Generated HTML からスライダー・カラーピッカー・テキスト入力用のパラメータを抽出

export type ParamCategory = 'balance' | 'design' | 'text';
export type ParamType = 'number' | 'color' | 'text';

export type TunerParam = {
  id: string;
  category: ParamCategory;
  type: ParamType;
  label: string;
  value: number | string;
  originalValue: number | string;  // リセット用
  originalMatch: string;           // HTML内での元の文字列（置換用）
  colorFormat?: 'hex' | 'jshex' | 'rgba';  // 色のフォーマット
  min?: number;
  max?: number;
  step?: number;
};

// メイン解析関数
export function parseHtml(html: string): TunerParam[] {
  const params: TunerParam[] = [];
  const usedIds = new Set<string>();

  const makeId = (base: string): string => {
    let id = base.replace(/[^a-zA-Z0-9_]/g, '_');
    let n = 0;
    while (usedIds.has(id)) { id = `${base}_${++n}`; }
    usedIds.add(id);
    return id;
  };

  // === Pass 1: Config オブジェクト内の数値 ===
  const configRegex = /(?:const|let|var)\s+(\w+)\s*=\s*\{([^}]{10,})\}/g;
  let match;
  while ((match = configRegex.exec(html)) !== null) {
    const objName = match[1];
    const objBody = match[2];
    const kvRegex = /(\w+)\s*:\s*(-?\d+\.?\d*)/g;
    let kv;
    while ((kv = kvRegex.exec(objBody)) !== null) {
      const key = kv[1];
      const val = parseFloat(kv[2]);
      const fullMatch = `${key}: ${kv[2]}`;
      // 意味のないIDっぽいものはスキップ
      if (key === 'a' || key === 'type' || key.length <= 1) continue;

      params.push({
        id: makeId(`${objName}_${key}`),
        category: 'balance',
        type: 'number',
        label: `${objName}.${key}`,
        value: val,
        originalValue: val,
        originalMatch: fullMatch,
        min: val > 0 ? 0 : val * 3,
        max: val > 0 ? val * 3 : 0,
        step: val % 1 !== 0 ? 0.1 : (val >= 100 ? 10 : 1),
      });
    }
  }

  // === Pass 2: スタンドアロン定数（const SPEED = 5） ===
  const standaloneRegex = /(?:const|let|var)\s+([A-Z][A-Z_0-9]{2,})\s*=\s*(-?\d+\.?\d*)\s*;/g;
  while ((match = standaloneRegex.exec(html)) !== null) {
    const key = match[1];
    const val = parseFloat(match[2]);
    const fullMatch = `${key} = ${match[2]}`;

    // Config内で既出ならスキップ
    if (params.some(p => p.originalMatch.includes(key))) continue;

    params.push({
      id: makeId(`const_${key}`),
      category: 'balance',
      type: 'number',
      label: key,
      value: val,
      originalValue: val,
      originalMatch: fullMatch,
      min: val > 0 ? 0 : val * 3,
      max: val > 0 ? val * 3 : 0,
      step: val % 1 !== 0 ? 0.1 : (val >= 100 ? 10 : 1),
    });
  }

  // === Pass 3: JS hex色 (0xff4444) ===
  const jsHexRegex = /0x([0-9a-fA-F]{6})\b/g;
  while ((match = jsHexRegex.exec(html)) !== null) {
    const hex = match[1].toLowerCase();
    // コメント内はスキップ
    const before = html.slice(Math.max(0, match.index - 30), match.index);
    if (before.includes('//') || before.includes('/*')) continue;

    params.push({
      id: makeId(`color_0x${hex}`),
      category: 'design',
      type: 'color',
      label: `0x${hex}`,
      value: `#${hex}`,
      originalValue: `#${hex}`,
      originalMatch: `0x${match[1]}`,
      colorFormat: 'jshex',
    });
  }

  // === Pass 4: CSS hex色 (#ff4444) ===
  const cssHexRegex = /#([0-9a-fA-F]{6})\b/g;
  while ((match = cssHexRegex.exec(html)) !== null) {
    const hex = match[1].toLowerCase();
    // 重複チェック（同じ色値が既にあればスキップ）
    if (params.some(p => p.type === 'color' && (p.value as string).toLowerCase() === `#${hex}`)) continue;
    // コメント内はスキップ
    const before = html.slice(Math.max(0, match.index - 30), match.index);
    if (before.includes('//') || before.includes('/*')) continue;

    params.push({
      id: makeId(`color_css_${hex}`),
      category: 'design',
      type: 'color',
      label: `#${hex}`,
      value: `#${hex}`,
      originalValue: `#${hex}`,
      originalMatch: `#${match[1]}`,
      colorFormat: 'hex',
    });
  }

  // === Pass 5: フォントサイズ ===
  const fontSizeRegex = /fontSize\s*[:=]\s*['"]?(\d+)(?:px)?['"]?/g;
  while ((match = fontSizeRegex.exec(html)) !== null) {
    const val = parseInt(match[1]);
    const fullMatch = match[0];
    if (params.some(p => p.originalMatch === fullMatch)) continue;

    params.push({
      id: makeId(`fontsize_${val}`),
      category: 'design',
      type: 'number',
      label: `fontSize: ${val}px`,
      value: val,
      originalValue: val,
      originalMatch: fullMatch,
      min: 8,
      max: 72,
      step: 1,
    });
  }

  // CSS font-size
  const cssFontRegex = /font-size\s*:\s*(\d+)px/g;
  while ((match = cssFontRegex.exec(html)) !== null) {
    const val = parseInt(match[1]);
    const fullMatch = match[0];
    if (params.some(p => p.originalMatch === fullMatch)) continue;

    params.push({
      id: makeId(`css_fontsize_${val}`),
      category: 'design',
      type: 'number',
      label: `font-size: ${val}px`,
      value: val,
      originalValue: val,
      originalMatch: fullMatch,
      min: 8,
      max: 72,
      step: 1,
    });
  }

  // === Pass 6: テキスト（タイトル、見出し、ボタン） ===
  const titleRegex = /<title>([^<]{2,50})<\/title>/;
  const titleMatch = html.match(titleRegex);
  if (titleMatch) {
    params.push({
      id: makeId('title'),
      category: 'text',
      type: 'text',
      label: '<title>',
      value: titleMatch[1],
      originalValue: titleMatch[1],
      originalMatch: titleMatch[0],
    });
  }

  // テキスト付きのadd.text呼び出し（Phaser）
  const addTextRegex = /\.text\([^,]+,\s*[^,]+,\s*'([^']{2,60})'/g;
  while ((match = addTextRegex.exec(html)) !== null) {
    const text = match[1];
    // コード片やURLっぽいものはスキップ
    if (/[{}()=<>\/\\]/.test(text)) continue;
    if (params.some(p => p.type === 'text' && p.value === text)) continue;

    params.push({
      id: makeId(`phasertext_${text.slice(0, 15)}`),
      category: 'text',
      type: 'text',
      label: text.length > 25 ? text.slice(0, 22) + '...' : text,
      value: text,
      originalValue: text,
      originalMatch: `'${text}'`,
    });
  }

  // ダブルクォート版
  const addTextRegex2 = /\.text\([^,]+,\s*[^,]+,\s*"([^"]{2,60})"/g;
  while ((match = addTextRegex2.exec(html)) !== null) {
    const text = match[1];
    if (/[{}()=<>\/\\]/.test(text)) continue;
    if (params.some(p => p.type === 'text' && p.value === text)) continue;

    params.push({
      id: makeId(`phasertext2_${text.slice(0, 15)}`),
      category: 'text',
      type: 'text',
      label: text.length > 25 ? text.slice(0, 22) + '...' : text,
      value: text,
      originalValue: text,
      originalMatch: `"${text}"`,
    });
  }

  return params;
}

// パラメータ変更をHTMLに反映
export function applyParams(html: string, params: TunerParam[]): string {
  let result = html;

  for (const p of params) {
    if (p.value === p.originalValue && p.originalMatch === getReplacementString(p)) continue;

    const replacement = getReplacementString(p);
    // 最初の1つだけ置換（同じ文字列が複数ある場合の安全策）
    const idx = result.indexOf(p.originalMatch);
    if (idx >= 0) {
      result = result.slice(0, idx) + replacement + result.slice(idx + p.originalMatch.length);
      // originalMatchを更新して次の変更でも追跡できるようにする
      p.originalMatch = replacement;
    }
  }

  return result;
}

function getReplacementString(p: TunerParam): string {
  if (p.type === 'color') {
    const hex = (p.value as string).replace('#', '');
    if (p.colorFormat === 'jshex') return `0x${hex}`;
    return `#${hex}`;
  }

  if (p.type === 'number') {
    // originalMatch内の数値部分だけ置換
    return p.originalMatch.replace(/-?\d+\.?\d*/, String(p.value));
  }

  if (p.type === 'text') {
    // クォート記号を維持
    const quote = p.originalMatch[0];
    if (quote === "'" || quote === '"') {
      return `${quote}${p.value}${quote}`;
    }
    // <title>タグの場合
    if (p.originalMatch.startsWith('<title>')) {
      return `<title>${p.value}</title>`;
    }
    return String(p.value);
  }

  return String(p.value);
}

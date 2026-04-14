import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// テンプレートベースの統合（LLMを使わない）
// モジュールコードを固定HTMLシェルに埋め込むだけ
function buildHTML(modules: { name: string; code: string }[], designDoc: string): string {
  // 設計書からタイトルを抽出（最初の行 or デフォルト）
  const titleMatch = designDoc?.match(/(?:タイトル|Title|名前)[：:]?\s*(.+)/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Kokoro Builder App';

  // Phaserを使うかどうかを判定
  const allCode = modules.map(m => m.code).join('\n');
  const usesPhaser = /Phaser/i.test(allCode);
  const usesPhaserScene = /extends\s+Phaser\.Scene/i.test(allCode);

  // Phaserシーンクラス名を抽出
  const sceneClasses: string[] = [];
  if (usesPhaserScene) {
    const sceneRegex = /class\s+(\w+)\s+extends\s+Phaser\.Scene/g;
    let match;
    while ((match = sceneRegex.exec(allCode)) !== null) {
      sceneClasses.push(match[1]);
    }
  }

  // シーンの順序を推測（Boot > Title > Game > GameOver/Result）
  const sceneOrder = ['Boot', 'Title', 'Main', 'Game', 'Play', 'Over', 'Result', 'Clear'];
  sceneClasses.sort((a, b) => {
    const aIdx = sceneOrder.findIndex(s => a.toLowerCase().includes(s.toLowerCase()));
    const bIdx = sceneOrder.findIndex(s => b.toLowerCase().includes(s.toLowerCase()));
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  // モジュールコードを結合
  const moduleCode = modules
    .map(m => `// ========== ${m.name} ==========\n${m.code}`)
    .join('\n\n');

  // Phaser初期化コード
  const phaserInit = usesPhaser ? `
// ===== Game Initialization =====
(function() {
  if (window.gameInstance) return;

  var config = {
    type: Phaser.CANVAS,
    width: 375,
    height: 667,
    backgroundColor: '#1a1a2e',
    parent: 'game-container',
    physics: {
      default: 'arcade',
      arcade: { debug: false }
    },
    scene: [${sceneClasses.join(', ')}],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    input: { touch: true }
  };

  window.gameInstance = new Phaser.Game(config);

  // ローディング画面を非表示
  var loading = document.getElementById('loading-screen');
  if (loading) loading.style.display = 'none';
})();
` : `
// ===== App Initialization =====
(function() {
  // ローディング画面を非表示
  var loading = document.getElementById('loading-screen');
  if (loading) loading.style.display = 'none';
})();
`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
    ${usesPhaser ? '<script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"><\/script>' : ''}
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%; height: 100%; overflow: hidden;
            display: flex; justify-content: center; align-items: center;
            background-color: #1a1a2e;
            font-family: 'Noto Sans JP', sans-serif;
            color: #e0e0e0;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
        }
        #game-container {
            width: 375px; height: 667px;
            max-width: 100vw; max-height: 100vh;
            position: relative; overflow: hidden;
            background-color: #1a1a2e;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        }
        canvas { display: block; width: 100%; height: 100%; touch-action: none; }
        #loading-screen {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-color: #1a1a2e; display: flex; flex-direction: column;
            justify-content: center; align-items: center; z-index: 9999;
        }
        .loading-spinner {
            width: 40px; height: 40px; border: 3px solid #333;
            border-top-color: #7c3aed; border-radius: 50%;
            animation: spin 0.8s linear infinite; margin-bottom: 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-text { font-size: 12px; letter-spacing: 3px; color: #888; }
    </style>
</head>
<body>
    <div id="game-container">
        <div id="loading-screen">
            <div class="loading-spinner"></div>
            <div class="loading-text">LOADING...</div>
        </div>
    </div>

    <script>
${moduleCode}

${phaserInit}
    </script>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const { modules, integrationNotes, designDoc } = await req.json() as {
      modules: { name: string; code: string }[];
      integrationNotes: string;
      designDoc?: string;
    };

    if (!modules || modules.length === 0) {
      return NextResponse.json({ error: 'モジュールが必要です' }, { status: 400 });
    }

    const code = buildHTML(modules, designDoc || '');
    return NextResponse.json({ code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

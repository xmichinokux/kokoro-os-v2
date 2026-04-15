import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

// テキストを指定幅で折り返す
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > 0) {
      if (remaining.length <= maxCharsPerLine) {
        lines.push(remaining);
        break;
      }
      lines.push(remaining.slice(0, maxCharsPerLine));
      remaining = remaining.slice(maxCharsPerLine);
    }
  }
  return lines;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { noteId } = await req.json() as { noteId: string };
    if (!noteId) {
      return NextResponse.json({ error: 'noteId が必要です' }, { status: 400 });
    }

    // ノートを取得
    const { data: note } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (!note) {
      return NextResponse.json({ error: 'ノートが見つかりません' }, { status: 404 });
    }

    // PDF生成
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // 日本語フォントを取得
    const origin = req.nextUrl.origin;
    let font;
    try {
      const fontRes = await fetch(`${origin}/fonts/NotoSansJP-Regular.ttf`);
      const fontBytes = await fontRes.arrayBuffer();
      font = await pdfDoc.embedFont(fontBytes, { subset: false });
    } catch {
      // フォント取得失敗時は標準フォント（日本語非対応）にフォールバック
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    const title = (note.title as string) || '無題';
    const body = (note.text as string) || '';
    const authorName = (note.author_name as string) || '匿名';
    const createdAt = new Date(note.created_at as string).toLocaleDateString('ja-JP');

    const PAGE_WIDTH = 595.28;  // A4
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 60;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const TITLE_SIZE = 18;
    const BODY_SIZE = 11;
    const META_SIZE = 9;
    const LINE_HEIGHT = BODY_SIZE * 2;

    // 本文のテキスト折り返し（1行あたりの文字数を推定）
    const charsPerLine = Math.floor(CONTENT_WIDTH / (BODY_SIZE * 0.6));
    const bodyLines = wrapText(body, charsPerLine);

    // 必要なページ数を計算
    const headerHeight = 100; // タイトル + メタ + 余白
    const availableHeight = PAGE_HEIGHT - MARGIN * 2 - headerHeight;
    const linesPerPage = Math.floor(availableHeight / LINE_HEIGHT);

    // ページ分割
    let lineIndex = 0;
    let pageNum = 0;

    while (lineIndex < bodyLines.length || pageNum === 0) {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      let y = PAGE_HEIGHT - MARGIN;

      if (pageNum === 0) {
        // タイトル
        page.drawText(title, {
          x: MARGIN, y: y - TITLE_SIZE,
          size: TITLE_SIZE, font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= TITLE_SIZE + 16;

        // メタ情報
        const metaText = `${authorName}  |  ${createdAt}`;
        page.drawText(metaText, {
          x: MARGIN, y: y - META_SIZE,
          size: META_SIZE, font,
          color: rgb(0.5, 0.5, 0.5),
        });
        y -= META_SIZE + 12;

        // 区切り線
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE_WIDTH - MARGIN, y },
          thickness: 0.5,
          color: rgb(0.85, 0.85, 0.85),
        });
        y -= 20;
      }

      // 本文描画
      const currentPageLines = pageNum === 0 ? linesPerPage : Math.floor((PAGE_HEIGHT - MARGIN * 2) / LINE_HEIGHT);
      let linesDrawn = 0;

      while (lineIndex < bodyLines.length && linesDrawn < currentPageLines) {
        const line = bodyLines[lineIndex];
        if (line !== '') {
          page.drawText(line, {
            x: MARGIN, y: y - BODY_SIZE,
            size: BODY_SIZE, font,
            color: rgb(0.15, 0.15, 0.15),
          });
        }
        y -= LINE_HEIGHT;
        lineIndex++;
        linesDrawn++;
      }

      // フッター
      page.drawText(`- ${pageNum + 1} -`, {
        x: PAGE_WIDTH / 2 - 10, y: MARGIN / 2,
        size: 8, font,
        color: rgb(0.7, 0.7, 0.7),
      });

      pageNum++;
    }

    const pdfBytes = await pdfDoc.save();

    // Supabase Storage にアップロード
    const fileName = `products/${user.id}/${noteId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('kokoro-pdfs')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`PDF アップロードエラー: ${uploadError.message}`);
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage
      .from('kokoro-pdfs')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // ノートの product_external_url を更新
    await supabase
      .from('notes')
      .update({
        product_external_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', noteId)
      .eq('user_id', user.id);

    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

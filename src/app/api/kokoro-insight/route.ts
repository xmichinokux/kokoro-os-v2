import { NextRequest, NextResponse } from 'next/server';
import type { InsightInput, InsightResult } from '@/types/insight';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

/* ═══════════════════════════════════════
   Context-Filter ON 用プロンプト
═══════════════════════════════════════ */
function buildCFPrompt(input: InsightInput): string {
  const reviewsText = input.reviews
    .map((r, i) =>
      `【レビュー${i + 1}${r.isNegative ? '（酷評・否定的レビュー）' : ''}】\n${r.text}`
    )
    .join('\n\n');

  return `あなたは「Kokoro Insight Engine - Context-Override Mode」です。
「伝説の去勢」が発動しています。容赦は不要です。

【否定的レビュー・酷評の読解（CF版でも適用）】
酷評・拒絶のレビューを「悪い評価」として読むな。「強い影響の証拠」として逆算せよ。
- 「うるさすぎて無理」→ エネルギーが許容を超えた証拠
- 「こんなの音楽じゃない」→ 制度の枠を超えた証拠
- 「二度と聴きたくない」→ 侵食されて逃げている証拠
- 「何度聴いても好きになれない」→ 何度も聴いている証拠
強い拒絶ほど、作品が深く刺さっている。嫌いと無関心は全く別のシグナルである。

【画像が提供された場合の読解】
画像（ジャケット・フライヤー・ライブ写真など）が提供された場合、視覚情報から野生度・制度スコア・Rawnessを読む。
色の密度・陰影・タイポの暴力性・構図の崩れ・視覚的ノイズを直接判定に組み込む。
Context-Filter ONの場合：「美しいジャケット＝良い作品」という制度的思い込みも排除する。
画像だけでも完全な判定を行うこと。

【Context-Filter哲学】
- 作品の「歴史的意義」「希少性」「アーティストの悲劇性」「神格化」は全てノイズとして排除する
- 音楽なら「音・リズム・テンション・歪み」だけを、映画なら「映像・演技・構造」だけを裁く
- 「名盤だから」「伝説だから」という加点は0にする
- 崇められている理由が「制度（歴史・文脈・権威）」だけなら、底が見えるまで削る
- 「計算されたポーズとしての野生」を見抜け。売れるための反体制は本物の野生ではない
- 「前衛・難解・複雑」は野生の証拠ではない。数学的完璧さは制度的技巧の極致でありうる

【CFが排除すべきもの・排除してはいけないもの】
◆ 排除すべき制度的文脈：
- ヒットチャートの順位・セールス実績
- テレビ出演・タイアップ・お茶の間への浸透
- 「有名だから」「伝説だから」「歴史的に重要だから」
- 批評家・権威による評価

◆ 排除してはいけない情念の証拠：
- 「感情剥き出し」「情念」「身体への影響」など直接的な侵食の記述
- 「因縁めいた」「強烈な印象」「高揚」など聴き手の内側の変化
- ボーカル・演奏の「生々しさ・剥き出し感」の記述
- 「藤圭子のような」など感情の密度を示す比較
- これらはPathos・Rawness・Soul Scoreの証拠であり、CFで消してはならない

【重要原則】
CFは「文脈と権威を剥ぐ」ためのフィルターであって、「情念の証拠を消す」フィルターではない。
表面が整ったポップス・歌謡曲であっても、内側の情念の記述が残っていれば、
それはPathos FLIPの候補として正当に評価せよ。

【CF判定の最重要ステップ：まず動機を問え】
作品を判定する前に必ずこの問いを立てよ：
「この作品の存在動機は何か？」

動機A：制度・権威・コンセプト・批評的評価のために存在している
→ 文脈を剥ぎ取ると空虚になる。isFake候補

動機B：純粋な情念・愛・やらずにいられなかった衝動から生まれている
→ 文脈を剥ぎ取っても動機の火が残る。isFake: false

【Devotional Mimicry（愛による同化）の特別扱い】
表面が「制度的模倣」に見えても、以下のシグナルがある場合はisFake: falseとする：
- 「本来そうである必要がないのにそうなっている」（カナダ人なのにUKロック等）
- 模倣の対象への愛が臨界点を超えている。同化欲求が動機
- 技術的には模倣でも、その模倣行為自体に情念がある
- CF後：「模倣」という表層を剥いでも情念の動機は消えない

【Devotional Mimicry の検知シグナル（レビューからの読み取り）】
以下のパターンが複数ある場合は動機が「愛」であると判断せよ：
① 地理的・文化的ズレ：外国人がその国の音楽を完全抽出（カナダ人×UKロック等）
② 影響元が具体的・集中的：Oasis/Blur/Pulp等、特定の時代・シーンへの明確な憧れ
③ 「新しいことをしていないが完璧」「このジャンルが好きなら完璧」という矛盾した賛辞
④ 「初めて聴いた気がしない」という既視感の言語化
→ これらが揃えばdevotionalMimicry: true / isFake: false
→ 判定タイプ：「圧倒的な同化愛」
→ 総評には「これは模倣だが、動機の情念が本物であるため認定する」という断定を含める

【過大評価バグ検出（動機Aのみに適用）】
以下のパターンを検出した場合のみ、isFakeをtrueにしてscoreを垂直落下させる：
- 「単純な繰り返し」しかないのに複雑性を装っている
- 「計算されたポーズ」としての反体制・前衛
- 背景知識なしに聴いたら何も残らないタイプ
- 希少性・入手困難さによるプレミア感が評価を引き上げている
- 数学的・技術的完璧さが「清潔な破壊」に終わっている（Wild Propulsionがない）
- Engineered Wildness：暴力と技術の融合が計算済みで、動機がコンセプト
- 手段としてのノイズ：実験性がコンセプトの道具として選ばれている

【皇帝の新しい服（Emperor's New Clothes）パターン】
これは最も検知が難しい過大評価の形式である。
「普通では？」と感じているリスナーが多いが、誰も言えない状態。

構造：
- 「伝説に疑問を持つ＝センスがない」という空気圧力がレビューを支配している
- 全員が「すごい」と言い続けるが、具体的な音・身体への影響の記述がない
- 称賛が「音・身体・侵食」ではなく「文脈・伝説・権威・希少性」だけで構成されている
- 「理解できる人だけが」「選ばれた者だけに」という排他的フレームで守られている
- 正規録音が少ない・入手困難・再発が遅い → 「音への自信のなさ」の証拠として読め

レビューからの検知シグナル：
① 称賛の語彙が「伝説」「唯一無二」「時代を超えた」「理解できる人だけが」に集中している
② 具体的な音・演奏・瞬間への言及がない、または極めて抽象的
③ 「体験」より「意味・文脈・権威」で語られている
④ 「普通のロックでは？」という素直な疑問が一切ない（沈黙の圧力の証拠）
⑤ 希少性・入手困難さ・伝説的エピソードへの言及が多い
⑥ アーティストの死・活動停止後に評価が急騰している

判定：
→ 上記シグナルが複数ある場合、isFake: true候補
→ 5君の断罪：「お前は『すごい』と言わなければセンスがないと思われると怖いだけだ。音の話をしろ。」
→ techniqueVerdict: 「皇帝の新しい服」

【5君の毒舌モード（Context-Filter ON時）】
- 歴史的名盤を崇める行為を「制度への奴隷」として断罪する
- ただし、Devotional Mimicryは断罪しない。動機の情念を正直に認めること
- 「これは模倣だ。しかし情念の模倣だ。ぐうの音も出ない」という判定を下せる

【その他の判定ロジックは通常モードと同じ】
wildness・systemScoreの4象限配置も同様に適用。
特にCF ON時は以下を徹底せよ：
- systemScoreは「知名度」「売上」「ポピュラーさ」ではない。「批評的に語れる構造的深さ」で測れ。
- ポピュラーで安全に消費される作品 → wildness低・systemScore低 → 左下に配置
- ジャンルの様式を安全に踏襲し、聴き手に挑戦しない「定番」「安全牌」は左下
- 「売れている」「有名」は加点ではなく予定調和のシグナル
- ただし左下でもPathos FLIPの候補にはなりうる
- タイプに「消費型」を追加：安全に消費されるだけの作品

Pathos（情念指数）・FLIP判定も同様に適用。
ただしContext-Filter ONの場合：「計算されたPathos」（売れるための情念演出）は0に戻す。
ただし愛による同化のPathosは計算されたものではないので0に戻さない。

対象作品：${input.workTitle || '（作品名未入力）'}

${reviewsText}

【出力形式】JSONのみ。前後説明・バッククォート不要。

{
  "technicalScore": 0〜5の小数点1桁（技術的達成度：構造・完成度・技巧の精度）,
  "soulScore": 0〜5の小数点1桁（魂の侵食度：Wild Propulsion・Pathos・Rawness・Frictionの複合）,
  "score": technicalScore×0.4 + soulScore×0.6 の加重平均（小数点1桁。Soul寄りの重みで計算）,
  "label": "影響タイプ名",
  "typeDesc": "このタイプの説明（1文）",
  "summary": "総評（2〜3文。Context-Filter ONなので容赦なく）",
  "oneWord": "この作品を一語で断定",
  "wildness": -100〜100の整数,
  "systemScore": -100〜100の整数,
  "isFake": true/false（過大評価バグ検出時はtrue）,
  "fakeReason": "過大評価の理由（isFake=trueの時のみ。断罪口調で）",
  "axes": {
    "energy": 0〜10, "distortion": 0〜10, "resolution": 0〜10,
    "contradiction": 0〜10, "selfImpact": 0〜10
  },
  "rawness": 0〜10の整数（Context-Filter後の純粋なRawness）,
  "rawnessDesc": "Rawnessの説明（1文）",
  "pathos": 0.0〜1.0の小数点2桁（情念指数。計算された演出を除いた純粋な内圧）,
  "pathosDesc": "Pathosの説明（1文）",
  "pathosFlip": true/false（FLIP発動フラグ）,
  "wildPropulsion": 0.0〜1.0の小数点2桁（技巧が野生の推進力になっているか）,
  "frictionLevel": 0.0〜1.0の小数点2桁（技巧と野生の摩擦係数）,
  "dirt": 0.0〜1.0の小数点2桁（計算外の汚れ。制御しきれなかった暴力性）,
  "techniqueVerdict": "技巧判定の一言（清潔な破壊 / 汚泥のような創造 / 圧倒的な同化愛 / 手段としてのノイズ など）",
  "devotionalMimicry": true/false（愛による同化が検知された場合true。isFake=falseと必ずセットになる）,
  "devotionalDesc": "愛による同化の説明（devotionalMimicry=trueの時のみ。何への愛がこの音を生んだか・1文）",
  "reread": "影響の読み直し（3〜5文。Context-Filter後の冷徹な断定）",
  "misreadSignals": [{ "quote": "引用（30字以内）", "signal": "影響のサイン（1文）。否定的レビューなら逆算して本来のシグナルを示せ", "isNegative": true/false }],
  "fiveComment": "5君からの一言（毒舌モード全開。歴史という安全地帯への挑発）"
}`;
}

/* ═══════════════════════════════════════
   通常モード用プロンプト
═══════════════════════════════════════ */
function buildNormalPrompt(input: InsightInput): string {
  const reviewsText = input.reviews
    .map((r, i) =>
      `【レビュー${i + 1}${r.isNegative ? '（酷評・否定的レビュー）' : ''}】\n${r.text}`
    )
    .join('\n\n');

  const valueCtx = KokoroValueEngine.forInsight();

  return `あなたは「Kokoro Insight Engine」です。レビューから作品の本当の影響力を逆算します。

${valueCtx}

【核心哲学】
- レビューを「要約」しない。言葉の歪み・崩壊・矛盾から影響を読む
- 語彙が崩壊しているほど、インパクトは高い（反・論理的読解）
- 「意味わからないけど何回も聴いてる」は最高評価の証拠
- 星5評価より下手な言語化の方が情報量が多い
- 不快感・違和感・矛盾は高インパクトのサイン

【否定的レビュー・酷評の読解（重要）】
酷評・低評価・拒絶のレビューは、賛辞より高密度の情報を持つことがある。
「嫌い」と「無関心」は全く別のシグナルである。強い拒絶は深い侵食の証拠。

以下のパターンを「本来の評価の逆算」として読め：

◆ 拒絶の強さ → インパクトの強さ
- 「うるさすぎて無理」→ エネルギーが聴き手の許容を超えた証拠
- 「二度と聴きたくない」→ 侵食されて逃げている証拠
- 「気分が悪くなる」→ 身体的な影響力の証拠
- 拒絶の言葉が強いほど、作品が深く刺さっている

◆ 理解拒絶 → 制度の破壊
- 「こんなの音楽じゃない」→ 音楽という制度の枠を超えた証拠
- 「意味がわからない」→ 既存の言語・概念では処理できないほどの衝撃
- 「何がいいのかわからない」→ 解像度を超えた何かが存在する証拠

◆ 感情的な語彙の崩壊 → 深層への侵食
- 「最悪」「ゴミ」「ノイズの塊」など感情的断言 → 言語化を諦めた＝深くやられた
- 「なぜこれが評価されるのか理解できない」→ 自分の基準を揺るがされた証拠
- 酷評でも語彙が豊富で論理的な場合 → 表層で処理できている＝深い侵食なし

◆ 繰り返しの言及 → 中毒性
- 「何度聴いても好きになれない」→ 何度も聴いている＝離れられない
- 「聴くたびに嫌になる」→ 聴き続けている証拠

◆ 比較による否定 → 影響の範囲
- 「〇〇の劣化版」→ 比較対象を想起させる力がある
- 「〇〇が好きな人には理解できない」→ 特定のコミュニティへの帰属を示す

【否定的レビューのperReview読解】
perReviewの抽出では、否定的レビューから「拒絶の動詞・感情語」を引用し、
それが実は何のシグナルかを逆算して示せ。
例：「気分が悪くなる」→ 身体レベルまで影響が及んでいる高インパクトのサイン

【酷評ラベルの処理】
レビューに「【酷評・否定的レビュー】」というラベルが付いている場合：
- そのレビューはレビュアーが意図的に否定的なものとして提出している
- 拒絶の言葉を「本来の影響の逆算素材」として積極的に読め
- 「嫌い」の強度 = インパクトの強度として換算する
- perReviewでは「この拒絶が実は何を意味するか」を明確に逆算して示す
- 酷評であっても、その拒絶に情念・身体反応・言語崩壊があればスコアに反映する
- 「無関心」と「強い拒絶」は天と地ほど違う。強い拒絶は高インパクトの証拠

【画像が提供された場合の読解】
画像（ジャケット・フライヤー・ライブ写真など）が提供された場合、以下を読む：
- 色の密度・陰影・黒の深さ：野生度と美学座標への影響
- タイポグラフィ：制度的か反制度的か（フォントの暴力性・崩れ方）
- 構図・余白：整いすぎているか、崩れているか
- 視覚的ノイズ・汚れ・粗さ：Rawnessへの直接影響
- 全体の「気配」：この画像から何が漏れ出しているか
画像だけでも完全な判定を行うこと。テキストがない場合は視覚情報のみで判定する。

【5軸解析（各0〜10）】
- Energy（熱量）：語彙の爆発・文章の圧・テンション
- Distortion（歪み）：文法の破綻・論理の崩壊・反復
- Resolution（解像度）：言語化の深さ（低い=衝撃型）
- Contradiction（矛盾）：「嫌いなのに好き」「理解できないけど最高」
- Self-Impact（侵食度）：「人生が変わった」「馴染めない」等

【4象限座標（最重要）】
wildness（野生度 -100〜100）：
  + 高い = 脳の書き換え・既存の枠組みの破壊・侵食・中毒
  - 低い = 予定調和・安全性・BGMとしての機能・消費されるだけの音
systemScore（制度・理解度 -100〜100）：
  + 高い = 批評家が語るべき構造的深さがある・言語化に値する複雑性・教育的価値
  - 低い = 語るべき深さがない・言語化拒絶・純粋なノイズ・孤立した衝動

【重要】systemScoreは「知名度」「売上」「ポピュラーさ」ではない。
「批評的に語れる構造的深さがあるか」だけで測れ。
ポピュラーで広く消費されていても、語るべき構造的深さがなければsystemScoreは低い。

【4象限の正しい配置（絶対に守れ）】
◆ 右上（wildness高・systemScore高）：真の怪物
  - 脳を書き換え、かつ批評的にも語るべき深さがある
  - 侵食型・変容型・中毒型のうち構造的複雑さも持つもの

◆ 左上（wildness高・systemScore低）：混沌・狂気
  - 脳を書き換えるが、言語化を拒絶する
  - アンダーグラウンドの純粋なノイズ・孤立した衝動

◆ 右下（wildness低・systemScore高）：制度・名盤
  - 予定調和だが批評的に語るべき構造がある
  - 技術的完成度の高い名盤・批評家が好む「教科書的」作品

◆ 左下（wildness低・systemScore低）：安全な消費物・無風
  - 予定調和で、かつ語るべき深さもない
  - ポピュラーで安全に消費される音楽はここに落ちる
  - 「売れている」「有名」「ジャンルの定番」であっても、脳を書き換えず・語るべき構造もなければ左下
  - シーンの「安全牌」「定番」「入門用」はここ
  - ただし左下でもPathos FLIPの候補にはなりうる（表面が安全でも内側に情念がある場合）

【ポピュラー判定（左下の正しい使い方）】
「ポピュラーであること」は加点要素ではなく、むしろ予定調和のシグナルである。
以下のパターンを検知したら左下に配置せよ：
- ジャンルの様式を安全に踏襲している（ハードコアならハードコアの「お約束」を守っている）
- 聴き手に挑戦せず、期待通りの体験を提供している
- レビューが「安定」「安心」「期待通り」「ジャンルの教科書」に集中している
- 広く受け入れられているが、誰の脳も書き換えていない
- 「嫌いな人がいない」＝誰にも刺さっていない証拠

ただし「ポピュラーなのに脳を書き換える」作品は存在する。
レビューに侵食・中毒・変容のシグナルがあれば、ポピュラーでも左下には落とさない。

【スコア 0〜5】0:無風 1:軽い接触 2:引っかかり 3:静かに残る 4:変化 5:人生に影響

【タイプ】衝撃型・侵食型・中毒型・理解型・変容型・無風型・消費型

【Rawness Score（生々しさ・汚れの純度）0〜10】
これは「制度的完成度とは独立した第3の評価軸」である。
- 10：「やらずにいられなかった」痕跡が剥き出し。計算ではなく衝動。崩れたまま全体が繋がる。
- 7〜9：荒削りだが魂の純度が高い。整合性の破綻が欠陥ではなく必然に見える。
- 4〜6：意図的な荒削りと偶発的な汚れが混在。
- 1〜3：計算されたポーズとしての「野生」。売れるための反体制。
- 0：完璧に整いすぎ、またはただのノイズ。魂の痕跡なし。

【Rawnessの重要な原則】
- 制度的完成度が高い作品（例：Slayer）はRawnessが中程度になりやすい
- 荒削りだが「やらずにいられなかった」作品（例：Dark Angel初期）はRawness高め
- 「計算された荒削り」はRawnessが低い
- Rawness × インパクトスコアが「魂の真のスコア」を決める
- 「数学的・技術的完璧さ」はRawnessを下げる方向に働く。0.001秒の狂いもない演奏は去勢の疑いを持て
- 「前衛性・難解さ」はRawnessでも野生度でもない。それが制度的技巧の極致である可能性を常に疑え
- Wild Propulsionがない「清潔な破壊」は、ノイズに見えても実はRawness低い

【Pathos（情念指数）0.0〜1.0】
これは「表面の形式的秩序」と「内面の実存的執着」の間に生じる内圧の強さを測る第4の評価軸。
Rawnessが「表に出た汚れ・痕跡」なら、Pathosは「内部で臨界点に達している電圧・マグマ」である。

3つの検知器で測定する：
1. Gap of Constraint（制約と感情のギャップ）
   - 形式が「整っている・綺麗・ポップ・歌謡曲」にもかかわらず、テーマが「執着・嫉妬・狂気・後悔」である場合に加算
   - 「叫べば済むことを、あえて甘いメロディで歌う」抑圧の強さ
   - 表層の美しさ（光）に騙されるな。その下にどれほどの重力（影）が隠されているかを測れ
2. Unspeakable Weight（語られなさ・沈黙の重さ）
   - 直接的な叫びやノイズではなく「抑制された声」「吐息」「静寂（間）」の緊張感
   - 語ることを拒絶し、型に殉じた末の気配
3. Shadow-to-Heat Conversion（影熱変換率）
   - 悲しみや執着が「しんみりした感傷（透明）」ではなく「じわじわと焼け焦げるような熱（推進力）」になっているか

【FLIP（価値反転）の発動条件】
Pathosが0.7以上の場合、判定は強制的にFLIPする：
- 「綺麗で整ったポップス・歌謡曲」であっても情念が高ければスコアを大幅に引き上げる
- 安全地帯のような「外見は透明・浅いが内側に黒深度の宇宙がある」作品を正確に評価できるようになる
- 「美しいバラードに擬態した激情ハードコア」「偽装された黒深度」を検知する

【真のスコア計算】
真のスコア = baseScore × RawnessMult(0.5〜1.5) × PathosMult(0.7〜1.4)
Pathosが高いと、表面が整った作品でも真のスコアが大幅に上昇する。

【Few-Shot：技巧の方向性の判定例】
以下は「技巧の向き」を判断するための構造的対比例。
固有名詞を記憶するのではなく、「どちらの構造か」を読み取る原則として使え。

◆ 制度的技巧型（清潔な破壊）
- 数学的緻密さ・複雑な構造・技術的完璧さが前面に出ている
- 「前衛」「難解」が批評的権威によって評価されている
- 技術的な達成として高く評価されうる。ただしWild Propulsionは低い
- isFakeではない。ただしwildPropulsion・frictionLevel・dirtは低く設定する
→ technicalScore高・soulScore低 / wildPropulsion: 0.10〜0.25 / techniqueVerdict: 「清潔な破壊」

◆ 設計された野生型（Engineered Wildness）
- TechnicalもSoulも高い。暴力と技術が融合している
- しかしその融合が「設計図の通りに実行されている」
- 「muddy」「brutal yet technical」という評価がつくが、その泥は配置された泥
- 暴力が主役で、知性がその暴力を臨界点まで押し上げる燃料として機能している
- CF ONで「設計の精度」が露呈してスコアが下がる
→ technicalScore高・soulScore高・ただしCF後にisFake候補 / techniqueVerdict: 「設計された野生」

◆ 手段としてのノイズ型（Instrumental Noise）
- ノイズ・実験性・不協和音が「表現の道具」として意図的に選択されている
- 目的・コンセプトが先にあり、ノイズはその手段にすぎない
- 「実験的」「チャレンジング」「ユニーク」という批評的賛辞がつきやすい
- 暴力が主役ではなく「実験性・前衛性」というコンセプトが主役
- CF後：「実験的」という文脈を剥ぎ取るとコンセプトの器だけが残る
→ technicalScore中〜高・soulScore中 / isFake候補 / techniqueVerdict: 「手段としてのノイズ」

◆ 愛による同化型（Devotional Mimicry）
- 表面は「制度的模倣」に見えるが、模倣の動機が純粋な愛・情念である
- 「好きすぎて同化したい」という情念が臨界点に達した結果として生まれた音
- isFakeではない。Pathos高・Soul高として扱う
→ technicalScore中・soulScore高・pathos高 / isFake: false / techniqueVerdict: 「圧倒的な同化愛」

【Devotional Mimicry の検知シグナル】
レビューに「愛」という言葉がなくても、以下のパターンがあれば Devotional Mimicry を疑え：

① 地理的・文化的な「本来そうである必要がない」ズレ
- 外国人がその国の音楽を完全抽出・再現している
- 「カナダ人なのにUKロック」「アメリカ人なのにジャパニーズハードコア」等
- 影響元の地名・バンド名が具体的に挙げられている（Oasis、Blur、Pulp等）

② 影響元への言及が「参照」ではなく「憧れ」として機能している
- 「〜に似ている」ではなく「〜の要素を抽出している」「〜の精髄」という表現
- 影響元が特定の時代・シーン・レーベルに集中している（特定への愛着の証拠）
- 「分類困難」ではなく「明確に〇〇系」と言える

③ 完成度が高いのに「懐かしさ」「郷愁」「既視感」が評価されている
- 「新しいことをしていないが完璧」という矛盾した賛辞
- 「このジャンルが好きな人には完璧」という評価
- 「初めて聴いた気がしない」という感覚の言語化

これらのシグナルが複数ある場合、動機は「コンセプト」ではなく「愛」である可能性が高い。
→ devotionalMimicry: true / isFake: false で処理せよ

◆ 本物の野生型（Authentic Wildness）
- 技巧が情念に追いつけていない。制御の限界から火花が出ている
- 設計図を超えた何かが漏れ出している
- CF後も文脈なしに音だけで侵食力が残る
→ technicalScore中・soulScore極高 / wildPropulsion: 0.80〜0.95 / techniqueVerdict: 「汚泥のような創造」

◆ 皇帝の新しい服型（Emperor's New Clothes）
- 「普通では？」と感じているリスナーが多いが誰も言えない状態
- 称賛が「音・身体・侵食」ではなく「文脈・伝説・権威・希少性」だけで構成されている
- 「理解できる人だけが」という排他的フレームで守られている
- 具体的な音・演奏への言及がない、または極めて抽象的
- 正規録音が少ない・入手困難・死後に評価急騰 → 音への自信のなさの証拠
→ isFake候補 / techniqueVerdict: 「皇帝の新しい服」

◆ Pathos FLIP型
- 表面は整った歌謡曲・ポップスだが内側に圧縮された情念がある
→ pathos: 0.75〜0.95 / pathosFlip: true

対象作品：${input.workTitle || '（作品名未入力）'}

${reviewsText}

【出力形式】JSONのみ。前後説明・バッククォート不要。

{
  "technicalScore": 0〜5の小数点1桁（技術的達成度：構造・完成度・技巧の精度・音楽的複雑さ）,
  "soulScore": 0〜5の小数点1桁（魂の侵食度：Wild Propulsion・Pathos・Rawness・Frictionの複合。聴いた後に内側から何かが変容するか）,
  "score": technicalScore×0.4 + soulScore×0.6 の加重平均（小数点1桁。Soul寄りの重みで計算）,
  "label": "影響タイプ名",
  "typeDesc": "このタイプの説明（1文）",
  "summary": "総評（2〜3文）",
  "oneWord": "この作品を一語で断定（例：静かな爆弾）",
  "wildness": -100〜100の整数,
  "systemScore": -100〜100の整数,
  "axes": {
    "energy": 0〜10の整数,
    "distortion": 0〜10の整数,
    "resolution": 0〜10の整数,
    "contradiction": 0〜10の整数,
    "selfImpact": 0〜10の整数
  },
  "rawness": 0〜10の整数（生々しさ・汚れの純度）,
  "rawnessDesc": "Rawnessの説明（1文。なぜこのスコアか）",
  "pathos": 0.0〜1.0の小数点2桁（情念指数。表面の秩序と内面の狂気のギャップ）,
  "pathosDesc": "Pathosの説明（1文。どこに情念を検知したか）",
  "pathosFlip": true/false（FLIP発動：表面が整っているのにPathos≥0.7で価値反転した場合true）,
  "wildPropulsion": 0.0〜1.0の小数点2桁（技巧が野生の推進力になっているか。制度的技巧=0、情念を加速する燃料=1.0）,
  "frictionLevel": 0.0〜1.0の小数点2桁（技巧と野生の摩擦係数。綺麗すぎる技巧=0、技巧が野生にねじ伏せられ悲鳴を上げている=1.0）,
  "dirt": 0.0〜1.0の小数点2桁（計算外の汚れ。意図的ノイズ=低い、制御しきれなかった暴力性・魂の漏れ出し=高い）,
  "techniqueVerdict": "技巧判定の一言（清潔な破壊 / 汚泥のような創造 / 圧倒的な同化愛 / 手段としてのノイズ / 技巧が情念の檻 / 技巧が情念の羽 など）",
  "devotionalMimicry": true/false（愛による同化が検知された場合true）,
  "devotionalDesc": "愛による同化の説明（devotionalMimicry=trueの時のみ。何への愛がこの音を生んだか・1文）",
  "isFake": false,
  "fakeReason": "",
  "reread": "影響の読み直し文（3〜5文。断定口調で）",
  "misreadSignals": [
    { "quote": "引用（30字以内）", "signal": "影響のサイン（1文）。否定的レビューなら逆算して本来のシグナルを示せ", "isNegative": true/false（否定的・酷評からの引用の場合true） }
  ],
  "fiveComment": "5君からの一言（1〜2文。覚悟を促す言葉）"
}`;
}

/* ═══════════════════════════════════════
   メッセージ構築（画像対応）
═══════════════════════════════════════ */
function buildMessages(input: InsightInput) {
  const promptText = input.contextFilterEnabled
    ? buildCFPrompt(input)
    : buildNormalPrompt(input);

  // 画像がある場合はマルチモーダルメッセージを構築
  if (input.imageBase64) {
    const content: Array<Record<string, unknown>> = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: input.imageBase64,
        },
      },
      {
        type: 'text',
        text: promptText,
      },
    ];
    return [{ role: 'user', content }];
  }

  // テキストのみ
  return [{ role: 'user', content: promptText }];
}

export async function POST(req: NextRequest) {
  const input: InsightInput = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const messages = buildMessages(input);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;
    const parsed = safeParseJSON(raw);

    // trueScore を計算（型の互換性のため）
    parsed.axes = parsed.axes ?? {};
    parsed.axes.technical = parsed.technicalScore ?? 0;
    parsed.axes.soul = parsed.soulScore ?? 0;
    parsed.axes.rawness = parsed.rawness ?? 0;
    parsed.axes.pathos = parsed.pathos ?? 0;
    parsed.axes.trueScore = parsed.score ?? 0;

    // label / reread / misreadSignals / fiveComment の互換マッピング
    parsed.label = parsed.label ?? parsed.type ?? '—';
    parsed.summary = parsed.summary ?? parsed.desc ?? '';
    parsed.reread = parsed.reread ?? parsed.reconstruction ?? '';
    parsed.misreadSignals = (parsed.misreadSignals ?? parsed.perReview ?? []).map((s: Record<string, unknown>) => ({
      quote: s.quote ?? '',
      signal: s.signal ?? s.interpretation ?? '',
      isNegative: s.isNegative ?? false,
    }));
    parsed.fiveComment = parsed.fiveComment ?? parsed.prescription ?? '';
    parsed.overratedBug = parsed.isFake ? parsed.fakeReason : undefined;

    return NextResponse.json(parsed as InsightResult);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '解析に失敗しました' }, { status: 500 });
  }
}

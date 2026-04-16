'use client';

import { useRef, useEffect, useCallback } from 'react';

// ── 定数 ──
const BG_COLOR = '#050510';
const PLAYER_COLOR = '#ffffff';
const P_BULLET_COLOR = '#facc15';
const E_BULLET_COLOR = '#ff4466';
const ENEMY_COLOR = '#6366f1';
const ENEMY_BIG_COLOR = '#ec4899';
const STAR_COUNT = 60;

const PLAYER_SIZE = 15;
const PLAYER_BULLET_SIZE = 4;
const ENEMY_BULLET_SIZE = 3;
const ENEMY_SIZE = 15;
const ENEMY_BIG_SIZE = 25;

const BULLET_INTERVAL = 250;
const BULLET_SPEED = 7;
const SPREAD_ANGLE = Math.PI / 7;

// ステージ定義: y位置（進行度0〜1）にスポーンする敵
type EnemyDef = { y: number; x: number; type: 'normal' | 'big'; pattern: 'straight' | 'spread' | 'aimed' };

function generateStage(): EnemyDef[] {
  const enemies: EnemyDef[] = [];
  const count = 20;
  for (let i = 0; i < count; i++) {
    const y = 0.05 + (i / count) * 0.85;
    const isBig = i % 5 === 4;
    enemies.push({
      y,
      x: 0.15 + Math.random() * 0.7,
      type: isBig ? 'big' : 'normal',
      pattern: isBig ? 'spread' : (i % 3 === 0 ? 'aimed' : 'straight'),
    });
  }
  return enemies;
}

type Star = { x: number; y: number; speed: number; size: number };
type Bullet = { x: number; y: number; vx: number; vy: number };
type Enemy = {
  x: number; y: number; type: 'normal' | 'big';
  hp: number; pattern: 'straight' | 'spread' | 'aimed';
  lastShot: number; active: boolean;
  score: number;
};

type GameScene = 'title' | 'playing' | 'gameover' | 'clear';

type GameState = {
  scene: GameScene;
  width: number; height: number;
  playerX: number; playerY: number;
  playerBullets: Bullet[];
  enemyBullets: Bullet[];
  enemies: Enemy[];
  enemyDefs: EnemyDef[];
  stars: Star[];
  lastBulletTime: number;
  scrollSpeed: number;
  scrollPos: number;
  totalDistance: number;
  kills: number;
  score: number;
  startTime: number;
  clearTime: number;
  clearBonus: number;
  // input
  dragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  lastTouchY: number;
  keysDown: Set<string>;
};

function createInitState(): GameState {
  return {
    scene: 'title',
    width: 0, height: 0,
    playerX: 0, playerY: 0,
    playerBullets: [],
    enemyBullets: [],
    enemies: [],
    enemyDefs: generateStage(),
    stars: [],
    lastBulletTime: 0,
    scrollSpeed: 1.0,
    scrollPos: 0,
    totalDistance: 1000,
    kills: 0, score: 0,
    startTime: 0, clearTime: 0, clearBonus: 0,
    dragging: false,
    dragOffsetX: 0, dragOffsetY: 0,
    lastTouchY: 0,
    keysDown: new Set(),
  };
}

export default function KokoroPlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef<GameState>(createInitState());

  const initStars = useCallback((w: number, h: number): Star[] => {
    return Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      speed: 0.3 + Math.random() * 1.5,
      size: 0.5 + Math.random() * 1.2,
    }));
  }, []);

  const startGame = useCallback(() => {
    const s = stateRef.current;
    s.scene = 'playing';
    s.playerX = s.width / 2;
    s.playerY = s.height - 80;
    s.playerBullets = [];
    s.enemyBullets = [];
    s.enemies = [];
    s.enemyDefs = generateStage();
    s.scrollSpeed = 1.0;
    s.scrollPos = 0;
    s.kills = 0;
    s.score = 0;
    s.startTime = performance.now();
    s.clearTime = 0;
    s.clearBonus = 0;
    s.lastBulletTime = 0;
  }, []);

  // ── メインループ ──
  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;
    const W = s.width;
    const H = s.height;
    if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(gameLoop); return; }

    // ── 背景 ──
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // 星（全シーンで描画）
    const starMult = s.scene === 'playing' ? s.scrollSpeed : 0.5;
    for (const star of s.stars) {
      star.y += star.speed * starMult;
      if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
      ctx.fillStyle = `rgba(255,255,255,${0.2 + star.size * 0.25})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── タイトル画面 ──
    if (s.scene === 'title') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 22px 'Space Mono', monospace";
      ctx.fillText('SCROLL SHOOTER', W / 2, H * 0.3);
      ctx.font = "13px 'Noto Sans JP', sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('スクロール速度と駆け引きする', W / 2, H * 0.3 + 30);
      ctx.fillText('シューティングゲーム', W / 2, H * 0.3 + 50);

      ctx.font = "11px 'Space Mono', monospace";
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('ドラッグ: 自機を移動', W / 2, H * 0.55);
      ctx.fillText('上下スワイプ / ホイール / 右クリック: 速度変更', W / 2, H * 0.55 + 20);
      ctx.fillText('速いほどスコアボーナス↑', W / 2, H * 0.55 + 40);

      // START button area
      const btnY = H * 0.75;
      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 80, btnY - 20, 160, 44, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 14px 'Space Mono', monospace";
      ctx.fillText('START', W / 2, btnY + 6);

      ctx.textAlign = 'start';
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ── ゲームオーバー画面 ──
    if (s.scene === 'gameover') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ef4444';
      ctx.font = "bold 28px 'Space Mono', monospace";
      ctx.fillText('GAME OVER', W / 2, H * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = "13px 'Space Mono', monospace";
      ctx.fillText(`Kills: ${s.kills}`, W / 2, H * 0.4);
      ctx.fillText(`Score: ${s.score}`, W / 2, H * 0.4 + 22);

      // Retry
      const btnY = H * 0.6;
      ctx.fillStyle = '#6366f1';
      ctx.beginPath(); ctx.roundRect(W / 2 - 70, btnY - 18, 140, 40, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = "bold 13px 'Space Mono', monospace";
      ctx.fillText('RETRY', W / 2, btnY + 7);

      // Title
      const btn2Y = btnY + 56;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.roundRect(W / 2 - 70, btn2Y - 18, 140, 40, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('TITLE', W / 2, btn2Y + 7);

      ctx.textAlign = 'start';
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ── クリア画面 ──
    if (s.scene === 'clear') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#facc15';
      ctx.font = "bold 28px 'Space Mono', monospace";
      ctx.fillText('CLEAR!', W / 2, H * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = "13px 'Space Mono', monospace";
      const ct = (s.clearTime / 1000).toFixed(1);
      ctx.fillText(`Time: ${ct}s`, W / 2, H * 0.32);
      ctx.fillText(`Kills: ${s.kills}`, W / 2, H * 0.32 + 22);
      ctx.fillText(`Base Score: ${s.score}`, W / 2, H * 0.32 + 44);
      ctx.fillStyle = '#facc15';
      ctx.font = "bold 15px 'Space Mono', monospace";
      ctx.fillText(`Bonus: x${s.clearBonus.toFixed(2)}`, W / 2, H * 0.32 + 72);
      const total = Math.floor(s.score * s.clearBonus);
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 20px 'Space Mono', monospace";
      ctx.fillText(`TOTAL: ${total}`, W / 2, H * 0.32 + 102);

      const btnY = H * 0.7;
      ctx.fillStyle = '#6366f1';
      ctx.beginPath(); ctx.roundRect(W / 2 - 70, btnY - 18, 140, 40, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = "bold 13px 'Space Mono', monospace";
      ctx.fillText('RETRY', W / 2, btnY + 7);

      const btn2Y = btnY + 56;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.roundRect(W / 2 - 70, btn2Y - 18, 140, 40, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('TITLE', W / 2, btn2Y + 7);

      ctx.textAlign = 'start';
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ══════════════════════════════════════
    // ── プレイ中 ──
    // ══════════════════════════════════════

    const gameAreaW = W - 30; // 右30pxはメーター用

    // キーボード入力
    const keys = s.keysDown;
    if (keys.has('ArrowLeft') || keys.has('a')) s.playerX -= 4;
    if (keys.has('ArrowRight') || keys.has('d')) s.playerX += 4;
    if (keys.has('ArrowUp') || keys.has('w')) s.playerY -= 4;
    if (keys.has('ArrowDown') || keys.has('s')) s.playerY += 4;
    s.playerX = Math.max(PLAYER_SIZE, Math.min(gameAreaW - PLAYER_SIZE, s.playerX));
    s.playerY = Math.max(PLAYER_SIZE, Math.min(H - PLAYER_SIZE, s.playerY));

    // スクロール進行
    s.scrollPos += s.scrollSpeed * 0.5;
    const progress = Math.min(1, s.scrollPos / s.totalDistance);

    // 敵のスポーン
    for (let i = s.enemyDefs.length - 1; i >= 0; i--) {
      const def = s.enemyDefs[i];
      if (progress >= def.y) {
        const size = def.type === 'big' ? ENEMY_BIG_SIZE : ENEMY_SIZE;
        s.enemies.push({
          x: def.x * gameAreaW,
          y: -size,
          type: def.type,
          hp: def.type === 'big' ? 5 : 2,
          pattern: def.pattern,
          lastShot: timestamp,
          active: true,
          score: def.type === 'big' ? 50 : 10,
        });
        s.enemyDefs.splice(i, 1);
      }
    }

    // 自動発射（3way）
    if (timestamp - s.lastBulletTime > BULLET_INTERVAL) {
      const angles = [-SPREAD_ANGLE, 0, SPREAD_ANGLE];
      for (const a of angles) {
        s.playerBullets.push({
          x: s.playerX, y: s.playerY - PLAYER_SIZE,
          vx: Math.sin(a) * BULLET_SPEED,
          vy: -Math.cos(a) * BULLET_SPEED,
        });
      }
      s.lastBulletTime = timestamp;
    }

    // 自弾移動
    s.playerBullets = s.playerBullets.filter(b => {
      b.x += b.vx; b.y += b.vy;
      return b.y > -10 && b.x > -10 && b.x < W + 10;
    });

    // 敵の移動・射撃
    const enemyScrollSpeed = s.scrollSpeed * 1.2;
    for (const e of s.enemies) {
      if (!e.active) continue;
      e.y += enemyScrollSpeed;

      // 射撃
      const shootInterval = e.type === 'big' ? 800 : 1200;
      if (e.y > 20 && e.y < H - 50 && timestamp - e.lastShot > shootInterval) {
        e.lastShot = timestamp;
        const bSpeed = 3 + s.scrollSpeed * 0.3;
        if (e.pattern === 'straight') {
          s.enemyBullets.push({ x: e.x, y: e.y + 10, vx: 0, vy: bSpeed });
        } else if (e.pattern === 'spread') {
          for (let a = -0.4; a <= 0.4; a += 0.2) {
            s.enemyBullets.push({ x: e.x, y: e.y + 10, vx: Math.sin(a) * bSpeed, vy: Math.cos(a) * bSpeed });
          }
        } else if (e.pattern === 'aimed') {
          const dx = s.playerX - e.x;
          const dy = s.playerY - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          s.enemyBullets.push({ x: e.x, y: e.y + 10, vx: (dx / dist) * bSpeed, vy: (dy / dist) * bSpeed });
        }
      }
    }

    // 敵弾移動
    s.enemyBullets = s.enemyBullets.filter(b => {
      b.x += b.vx; b.y += b.vy;
      return b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10;
    });

    // ── 当たり判定: 自弾 vs 敵 ──
    for (const e of s.enemies) {
      if (!e.active) continue;
      const eSize = e.type === 'big' ? ENEMY_BIG_SIZE : ENEMY_SIZE;
      for (let i = s.playerBullets.length - 1; i >= 0; i--) {
        const b = s.playerBullets[i];
        if (Math.abs(b.x - e.x) < eSize && Math.abs(b.y - e.y) < eSize) {
          e.hp--;
          s.playerBullets.splice(i, 1);
          if (e.hp <= 0) {
            e.active = false;
            s.kills++;
            s.score += e.score;
          }
          break;
        }
      }
    }

    // 画面外の敵を除去
    s.enemies = s.enemies.filter(e => e.active || e.y < H + 50);
    s.enemies = s.enemies.filter(e => e.y < H + 100);

    // ── 当たり判定: 敵弾 vs 自機 ──
    for (const b of s.enemyBullets) {
      if (Math.abs(b.x - s.playerX) < PLAYER_SIZE * 0.8 && Math.abs(b.y - s.playerY) < PLAYER_SIZE * 0.8) {
        s.scene = 'gameover';
        break;
      }
    }

    // ── 敵本体 vs 自機 ──
    for (const e of s.enemies) {
      if (!e.active) continue;
      const eSize = e.type === 'big' ? ENEMY_BIG_SIZE : ENEMY_SIZE;
      if (Math.abs(e.x - s.playerX) < (eSize + PLAYER_SIZE) * 0.6 && Math.abs(e.y - s.playerY) < (eSize + PLAYER_SIZE) * 0.6) {
        s.scene = 'gameover';
        break;
      }
    }

    // ── クリア判定 ──
    if (progress >= 1 && s.enemyDefs.length === 0) {
      const allGone = s.enemies.every(e => !e.active || e.y > H);
      if (allGone) {
        s.clearTime = performance.now() - s.startTime;
        const baseTime = 60000; // 60秒基準
        const ratio = Math.max(0.5, Math.min(2.0, 2.0 - s.clearTime / baseTime));
        s.clearBonus = ratio;
        s.scene = 'clear';
      }
    }

    // ══════════════════════════════════════
    // ── 描画 ──
    // ══════════════════════════════════════

    // 敵
    for (const e of s.enemies) {
      if (!e.active) continue;
      const size = e.type === 'big' ? ENEMY_BIG_SIZE : ENEMY_SIZE;
      ctx.fillStyle = e.type === 'big' ? ENEMY_BIG_COLOR : ENEMY_COLOR;
      ctx.fillRect(e.x - size / 2, e.y - size / 2, size, size);
      // HPバー
      if (e.hp > 0) {
        const maxHp = e.type === 'big' ? 5 : 2;
        const barW = size;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(e.x - barW / 2, e.y - size / 2 - 5, barW, 2);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(e.x - barW / 2, e.y - size / 2 - 5, barW * (e.hp / maxHp), 2);
      }
    }

    // 自弾
    ctx.fillStyle = P_BULLET_COLOR;
    for (const b of s.playerBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, PLAYER_BULLET_SIZE, 0, Math.PI * 2);
      ctx.fill();
    }

    // 敵弾
    ctx.fillStyle = E_BULLET_COLOR;
    for (const b of s.enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, ENEMY_BULLET_SIZE, 0, Math.PI * 2);
      ctx.fill();
    }

    // 自機（三角形）
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.moveTo(s.playerX, s.playerY - PLAYER_SIZE);
    ctx.lineTo(s.playerX - PLAYER_SIZE * 0.8, s.playerY + PLAYER_SIZE * 0.5);
    ctx.lineTo(s.playerX + PLAYER_SIZE * 0.8, s.playerY + PLAYER_SIZE * 0.5);
    ctx.closePath();
    ctx.fill();

    // ── UI: ゴールメーター（右サイド）──
    const meterX = W - 14;
    const meterH = H * 0.7;
    const meterY = (H - meterH) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(meterX, meterY); ctx.lineTo(meterX, meterY + meterH); ctx.stroke();
    // 進行
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(meterX, meterY + meterH); ctx.lineTo(meterX, meterY + meterH * (1 - progress)); ctx.stroke();
    // GOAL
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = "8px 'Space Mono', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', meterX, meterY - 4);
    ctx.textAlign = 'start';

    // ── UI: 速度表示（左上）──
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = "10px 'Space Mono', monospace";
    ctx.fillText(`SPD: ${s.scrollSpeed.toFixed(1)}x`, 8, 20);
    ctx.fillText(`KILL: ${s.kills}`, 8, 34);

    rafRef.current = requestAnimationFrame(gameLoop);
  }, []);

  // ── 初期化 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const w = Math.min(window.innerWidth, 430);
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      const s = stateRef.current;
      s.width = w;
      s.height = h;
      if (s.stars.length === 0) s.stars = initStars(w, h);
      if (s.scene === 'title') { s.playerX = w / 2; s.playerY = h - 80; }
    };
    resize();
    window.addEventListener('resize', resize);

    // ── タッチ操作 ──
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const tx = t.clientX - rect.left;
      const ty = t.clientY - rect.top;

      if (s.scene === 'title') {
        // START ボタン
        const btnY = s.height * 0.75;
        if (tx > s.width / 2 - 80 && tx < s.width / 2 + 80 && ty > btnY - 20 && ty < btnY + 24) {
          startGame();
        }
        return;
      }

      if (s.scene === 'gameover' || s.scene === 'clear') {
        const btnY = s.scene === 'gameover' ? s.height * 0.6 : s.height * 0.7;
        if (tx > s.width / 2 - 70 && tx < s.width / 2 + 70) {
          if (ty > btnY - 18 && ty < btnY + 22) { startGame(); return; }
          if (ty > btnY + 38 && ty < btnY + 78) { s.scene = 'title'; return; }
        }
        return;
      }

      // playing: ドラッグ開始
      s.dragging = true;
      s.dragOffsetX = tx - s.playerX;
      s.dragOffsetY = ty - s.playerY;
      s.lastTouchY = ty;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      if (s.scene !== 'playing' || !s.dragging) return;
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const tx = t.clientX - rect.left;
      const ty = t.clientY - rect.top;

      // 自機移動
      s.playerX = tx - s.dragOffsetX;
      s.playerY = ty - s.dragOffsetY;
      const gameAreaW = s.width - 30;
      s.playerX = Math.max(PLAYER_SIZE, Math.min(gameAreaW - PLAYER_SIZE, s.playerX));
      s.playerY = Math.max(PLAYER_SIZE, Math.min(s.height - PLAYER_SIZE, s.playerY));

      // 縦スワイプで速度変更
      const dy = ty - s.lastTouchY;
      if (Math.abs(dy) > 30) {
        if (dy < -30) s.scrollSpeed = Math.min(2.0, s.scrollSpeed + 0.25);
        else s.scrollSpeed = Math.max(0.5, s.scrollSpeed - 0.25);
        s.lastTouchY = ty;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      stateRef.current.dragging = false;
    };

    // ── マウス操作（PC）──
    const onContextMenu = (e: Event) => { e.preventDefault(); };

    const onMouseDown = (e: MouseEvent) => {
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // 右クリック: プレイ中は速度アップ（2.0超えで0.5にリセット）
      if (e.button === 2) {
        e.preventDefault();
        if (s.scene === 'playing') {
          s.scrollSpeed = s.scrollSpeed >= 2.0 ? 0.5 : Math.min(2.0, s.scrollSpeed + 0.25);
        }
        return;
      }

      if (s.scene === 'title') {
        const btnY = s.height * 0.75;
        if (mx > s.width / 2 - 80 && mx < s.width / 2 + 80 && my > btnY - 20 && my < btnY + 24) {
          startGame();
        }
        return;
      }
      if (s.scene === 'gameover' || s.scene === 'clear') {
        const btnY = s.scene === 'gameover' ? s.height * 0.6 : s.height * 0.7;
        if (mx > s.width / 2 - 70 && mx < s.width / 2 + 70) {
          if (my > btnY - 18 && my < btnY + 22) { startGame(); return; }
          if (my > btnY + 38 && my < btnY + 78) { s.scene = 'title'; return; }
        }
        return;
      }
      s.dragging = true;
      s.dragOffsetX = mx - s.playerX;
      s.dragOffsetY = my - s.playerY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const s = stateRef.current;
      if (s.scene !== 'playing' || !s.dragging) return;
      const rect = canvas.getBoundingClientRect();
      s.playerX = (e.clientX - rect.left) - s.dragOffsetX;
      s.playerY = (e.clientY - rect.top) - s.dragOffsetY;
      const gameAreaW = s.width - 30;
      s.playerX = Math.max(PLAYER_SIZE, Math.min(gameAreaW - PLAYER_SIZE, s.playerX));
      s.playerY = Math.max(PLAYER_SIZE, Math.min(s.height - PLAYER_SIZE, s.playerY));
    };

    const onMouseUp = () => { stateRef.current.dragging = false; };

    // ── キーボード ──
    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      s.keysDown.add(e.key);
      if (e.key === 'ArrowUp') s.scrollSpeed = Math.min(2.0, s.scrollSpeed + 0.25);
      if (e.key === 'ArrowDown') s.scrollSpeed = Math.max(0.5, s.scrollSpeed - 0.25);
      if (s.scene === 'title' && (e.key === 'Enter' || e.key === ' ')) startGame();
      if ((s.scene === 'gameover' || s.scene === 'clear') && e.key === 'Enter') startGame();
    };
    const onKeyUp = (e: KeyboardEvent) => { stateRef.current.keysDown.delete(e.key); };

    // ── ホイールで速度変更 ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      if (s.scene !== 'playing') return;
      if (e.deltaY < 0) s.scrollSpeed = Math.min(2.0, s.scrollSpeed + 0.1);
      else s.scrollSpeed = Math.max(0.5, s.scrollSpeed - 0.1);
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameLoop, initStars, startGame]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', background: BG_COLOR, minHeight: '100vh' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          maxWidth: 430,
          width: '100%',
          height: '100vh',
          background: BG_COLOR,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
    </div>
  );
}

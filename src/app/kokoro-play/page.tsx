'use client';

import { useRef, useEffect, useCallback } from 'react';

// ── 定数 ──
const BG_COLOR = '#050510';
const PLAYER_COLOR = '#ffffff';
const BULLET_COLOR = '#facc15';
const STAR_COUNT = 80;
const BULLET_INTERVAL = 300; // ms
const BULLET_SPEED = 8;
const BULLET_RADIUS = 3;
const PLAYER_SIZE = 18;
const PLAYER_MOVE_SPEED = 6;
const SPREAD_ANGLE = Math.PI / 6; // 30度

type Star = { x: number; y: number; speed: number; size: number };
type Bullet = { x: number; y: number; vx: number; vy: number };

export default function KokoroPlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // ゲーム状態（useRefで管理してrAFからアクセス）
  const stateRef = useRef({
    width: 0,
    height: 0,
    playerX: 0,
    playerY: 0,
    bullets: [] as Bullet[],
    stars: [] as Star[],
    lastBulletTime: 0,
    scrollSpeed: 3, // 1〜5
    moveDir: 0, // -1=left, 0=none, 1=right
    touchStartX: 0,
    touchStartY: 0,
    isTouching: false,
  });

  // ── 星の初期化 ──
  const initStars = useCallback((w: number, h: number) => {
    const stars: Star[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: 0.5 + Math.random() * 2,
        size: 0.5 + Math.random() * 1.5,
      });
    }
    return stars;
  }, []);

  // ── 3way弾を発射 ──
  const fireBullets = useCallback(() => {
    const s = stateRef.current;
    const angles = [-SPREAD_ANGLE, 0, SPREAD_ANGLE];
    for (const angle of angles) {
      s.bullets.push({
        x: s.playerX,
        y: s.playerY - PLAYER_SIZE,
        vx: Math.sin(angle) * BULLET_SPEED,
        vy: -Math.cos(angle) * BULLET_SPEED,
      });
    }
  }, []);

  // ── メインループ ──
  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;
    const { width: W, height: H } = s;

    // 自動発射
    if (timestamp - s.lastBulletTime > BULLET_INTERVAL) {
      fireBullets();
      s.lastBulletTime = timestamp;
    }

    // 自機移動
    s.playerX += s.moveDir * PLAYER_MOVE_SPEED;
    s.playerX = Math.max(PLAYER_SIZE, Math.min(W - PLAYER_SIZE, s.playerX));

    // 弾の更新
    s.bullets = s.bullets.filter(b => {
      b.x += b.vx;
      b.y += b.vy;
      return b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10;
    });

    // 星の更新
    const starSpeed = s.scrollSpeed * 0.8;
    for (const star of s.stars) {
      star.y += star.speed * starSpeed;
      if (star.y > H) {
        star.y = 0;
        star.x = Math.random() * W;
      }
    }

    // ── 描画 ──
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // 星
    for (const star of s.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + star.size * 0.2})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 弾
    ctx.fillStyle = BULLET_COLOR;
    for (const b of s.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // 自機（三角形）
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.moveTo(s.playerX, s.playerY - PLAYER_SIZE);
    ctx.lineTo(s.playerX - PLAYER_SIZE * 0.7, s.playerY + PLAYER_SIZE * 0.5);
    ctx.lineTo(s.playerX + PLAYER_SIZE * 0.7, s.playerY + PLAYER_SIZE * 0.5);
    ctx.closePath();
    ctx.fill();

    // 速度表示（左サイド）
    ctx.font = "12px 'Space Mono', monospace";
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`${s.scrollSpeed}`, 8, H / 2);

    // 進行メーター（右サイド・プレースホルダー）
    const meterX = W - 8;
    const meterH = H * 0.6;
    const meterY = (H - meterH) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(meterX - 4, meterY, 4, meterH);
    // 仮の進行率（将来ステージ進行と連動）
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(meterX - 4, meterY + meterH * 0.7, 4, meterH * 0.3);

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [fireBullets]);

  // ── 初期化・リサイズ ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      const s = stateRef.current;
      s.width = w;
      s.height = h;
      s.playerX = w / 2;
      s.playerY = h - 80;
      if (s.stars.length === 0) {
        s.stars = initStars(w, h);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // タッチ操作
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const t = e.touches[0];
      s.touchStartX = t.clientX;
      s.touchStartY = t.clientY;
      s.isTouching = true;
      // 左半分タップ→左、右半分→右
      s.moveDir = t.clientX < s.width / 2 ? -1 : 1;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const t = e.touches[0];
      const dx = t.clientX - s.touchStartX;
      const dy = t.clientY - s.touchStartY;

      // 横スワイプ → 移動方向
      if (Math.abs(dx) > 10) {
        s.moveDir = dx > 0 ? 1 : -1;
      }

      // 縦スワイプ → 速度変更
      if (Math.abs(dy) > 40) {
        if (dy < -40 && s.scrollSpeed < 5) {
          s.scrollSpeed++;
          s.touchStartY = t.clientY;
        } else if (dy > 40 && s.scrollSpeed > 1) {
          s.scrollSpeed--;
          s.touchStartY = t.clientY;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      stateRef.current.moveDir = 0;
      stateRef.current.isTouching = false;
    };

    // キーボード操作（PC用）
    const keysDown = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      keysDown.add(e.key);
      const s = stateRef.current;
      if (e.key === 'ArrowLeft' || e.key === 'a') s.moveDir = -1;
      if (e.key === 'ArrowRight' || e.key === 'd') s.moveDir = 1;
      if (e.key === 'ArrowUp') s.scrollSpeed = Math.min(5, s.scrollSpeed + 1);
      if (e.key === 'ArrowDown') s.scrollSpeed = Math.max(1, s.scrollSpeed - 1);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.key);
      const s = stateRef.current;
      const leftHeld = keysDown.has('ArrowLeft') || keysDown.has('a');
      const rightHeld = keysDown.has('ArrowRight') || keysDown.has('d');
      if (!leftHeld && !rightHeld) s.moveDir = 0;
      else if (leftHeld) s.moveDir = -1;
      else s.moveDir = 1;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ゲームループ開始
    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameLoop, initStars]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: BG_COLOR,
        touchAction: 'none',
      }}
    />
  );
}

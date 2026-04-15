'use client';

import { TalkProvider } from './TalkContext';
import TalkDock from './TalkDock';

export default function TalkShell({ children }: { children: React.ReactNode }) {
  return (
    <TalkProvider>
      <div style={{ paddingBottom: 90 }}>
        {children}
      </div>
      <TalkDock />
    </TalkProvider>
  );
}

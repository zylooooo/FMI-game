import { useState } from 'react';
import { Banner, Button, Countdown, EffectChart, Podium, RankingTable, Shell, Toast, useToast } from './ui.tsx';
import { useGame } from './socket.ts';
import { rank } from '../shared/logic.ts';

// Temporary stub with a dev-only UI kit preview — replaced by the group view task.
export function Group() {
  const { connected, now } = useGame();
  const { message, show } = useToast();
  const [deadline, setDeadline] = useState(() => now() + 8000);
  const rows = rank([{ number: 1, total: 1180 }, { number: 2, total: 1180 }, { number: 3, total: 950 }, { number: 4, total: 1003 }]);
  return (
    <Shell title="Market Survival" right={<Button variant="ghost" onClick={() => setDeadline(now() + 8000)}>Restart timer</Button>}>
      <Banner connected={connected} />
      {import.meta.env.DEV && (
        <div className="grid gap-12">
          <div className="flex flex-wrap items-center gap-6">
            <Button onClick={() => show('Total must be exactly 1000')}>Show toast</Button>
            <Button variant="teal">Lock in</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
            <Countdown deadline={deadline} now={now} totalMs={8000} />
          </div>
          <EffectChart effects={{ cash: 0, stocks: 40, bonds: -3 }} />
          <RankingTable rows={rows} />
          <Podium rows={rows} />
        </div>
      )}
      <Toast message={message} />
    </Shell>
  );
}

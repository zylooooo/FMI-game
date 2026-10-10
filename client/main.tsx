import { createRoot } from 'react-dom/client';
import './index.css';
import { Host } from './Host.tsx';
import { Group } from './Group.tsx';
import { Button, Shell } from './ui.tsx';

function Landing() {
  return (
    <Shell title="Market Survival">
      <div className="mx-auto mt-[6vh] flex max-w-md flex-col gap-6">
        <div aria-hidden className="stripes h-4" />
        <h2 className="font-display text-4xl uppercase leading-tight sm:text-6xl">Who are you?</h2>
        <Button href="/play">I'm a group</Button>
        <Button href="/host" variant="ghost">I'm the host</Button>
      </div>
    </Shell>
  );
}

const path = location.pathname;
createRoot(document.getElementById('root')!).render(
  path.startsWith('/host') ? <Host /> : path.startsWith('/play') ? <Group /> : <Landing />,
);

import { createRoot } from 'react-dom/client';
import './index.css';
import { Host } from './Host.tsx';
import { Group } from './Group.tsx';

createRoot(document.getElementById('root')!).render(location.pathname.startsWith('/host') ? <Host /> : <Group />);

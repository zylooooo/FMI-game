import type { Holdings } from './types.ts';

export interface GameEvent { title: string; question: string; options: string[]; effects: Holdings /* % */ }

export const EVENTS: GameEvent[] = [
  {
    title: 'AI Boom',
    question: 'Big tech companies suddenly say they will double AI spending next year. What is the most likely effect on the Korea market?',
    options: [
      'Samsung and SK Hynix expect more chip orders, so their share price may rise',
      'Korean bond prices rise, because the economy is stronger',
      'The Kospi falls, because competition for chips increases',
      "Nothing, because Korea doesn't depend on AI",
    ],
    effects: { stocks: 40, bonds: -3, cash: 0 },
  },
  {
    title: 'KOSPI Crash',
    question: 'After AI sentiment weakens and Samsung/SK hynix begin falling, why can leveraged ETFs make the sell-off worse?',
    options: [
      'Leveraged ETFs automatically guarantee losses when markets fall',
      'Leveraged products magnify losses, causing investors and funds to reduce exposure, which can create additional selling pressure',
      'Leveraged ETFs cause interest rates to rise',
      'Leveraged ETFs make companies earn less profit',
    ],
    effects: { stocks: -20, bonds: 3, cash: 0 },
  },
  {
    title: 'Domestic interest-rate hike',
    question: 'Rates are rising. What do you do with your Korean government bonds and stocks?',
    options: ['Sell bonds, sell stocks', 'Buy bonds, buy stocks', 'Sell bonds, buy stocks', 'Buy bonds, sell stocks'],
    effects: { stocks: -2, bonds: -3, cash: 0 },
  },
  {
    title: 'Bond market crisis',
    question: 'Assume government bond buybacks lower Korean market yields and borrowing costs, while US yields and other factors remain unchanged. Which pair of effects is most likely?',
    options: [
      'Stock prices rise, while existing bond prices fall.',
      'Growth-stock valuations rise, while the won faces depreciation pressure against the US dollar.',
      'Property prices face downward pressure, while the won strengthens against the US dollar.',
      'Existing bond prices rise, while growth-stock valuations fall.',
    ],
    effects: { stocks: 0, bonds: 0, cash: 0 },
  },
];

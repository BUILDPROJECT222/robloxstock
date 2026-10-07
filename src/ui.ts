// Small presentation helpers shared by components.

import { fmtClock } from './engine/util';
import type { Clock } from './engine/types';

export const upDown = (x: number) => (x >= 0 ? 'up' : 'down');
export const when = (t: Clock | null | undefined) => (t ? `D${t.day} ${fmtClock(t.minute)}` : '');

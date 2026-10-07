import { useSyncExternalStore } from 'react';
import { game } from '../engine/game';

/** Re-renders the calling component whenever the simulation changes (throttled by the engine). */
export function useGame() {
  useSyncExternalStore(game.subscribe, game.getVersion);
  return game;
}

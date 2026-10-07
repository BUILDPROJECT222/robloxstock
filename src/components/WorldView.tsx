import { useEffect, useRef } from 'react';
import { game } from '../engine/game';
import { useUI } from '../state/store';
import { World } from '../world/World';

/** Mounts the Three.js world and hands it to the engine as its 3D hook. */
export function WorldView() {
  const ref = useRef<HTMLDivElement>(null);
  const setWorld = useUI((s) => s.setWorld);

  useEffect(() => {
    const world = new World(ref.current!, (sym) => game.select(sym));
    game.world = world;
    world.sync(game, true);
    setWorld(world);
    return () => {
      game.world = null;
      setWorld(null);
      world.dispose();
    };
  }, [setWorld]);

  return <div id="world" ref={ref} />;
}

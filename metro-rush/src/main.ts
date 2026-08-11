import './game/ui/style.css';
import { Game } from './game/core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Metro Rush: #game-canvas not found in index.html');
}

const game = new Game(canvas);
game.boot();

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const copyTree = (source, target) => cpSync(join(projectRoot, source), join(destination, target), { recursive: true });

mkdirSync(destination, { recursive: true });
copyTree('game', 'game');
const shotsPath = join(projectRoot, 'screenshots');
mkdirSync(join(destination, 'screenshots'), { recursive: true });
if (existsSync(shotsPath)) copyTree('screenshots', 'screenshots');

const scoringLimits = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
writeFileSync(join(destination, 'dossier.json'), buildDossier(destination, scoringLimits));

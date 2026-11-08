// Preserve alpha while sampling the original eight-second chair turn into 24 frames.
// The second row uses white ink for the dark theme, preserving the same alpha.
// Run only when the source movie changes; ordinary card builds reuse the curated sprite.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = new URL('../../', import.meta.url);
execFileSync('ffmpeg', ['-y','-loglevel','error','-threads','1','-c:v','libvpx-vp9',
  '-i',fileURLToPath(new URL('agendamatic/assets/animation/logo_spin_128.webm',root)),
  '-filter_complex','fps=3,tile=24x1,split[light][base];[base]lutrgb=r=255:g=255:b=255[dark];[light][dark]vstack','-frames:v','1','-c:v','libwebp','-lossless','1','-threads','1',
  fileURLToPath(new URL('assets/cards/autochair-turn.webp',root))], {stdio:'inherit'});

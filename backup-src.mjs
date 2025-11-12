import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const srcDir = path.join(projectRoot, 'src');
const outputPath = '/Users/loic/Documents/ZoneStat/SiteWeb/Sauvegarde/ZoneStat-src-backup.txt';
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectSourceFiles(dir, baseDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolutePath, baseDir)));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (allowedExtensions.has(ext)) {
        const relativePath = path.relative(baseDir, absolutePath);
        files.push(relativePath);
      }
    }
  }

  return files;
}

async function buildBackup() {
  if (!(await fileExists(srcDir))) {
    throw new Error('Le dossier src est introuvable dans ce projet.');
  }

  const collectedFiles = await collectSourceFiles(srcDir, projectRoot);
  collectedFiles.sort((a, b) => a.localeCompare(b));

  const extraFiles = ['middleware.ts', path.join('src', 'app', 'globals.css')];
  for (const relativePath of extraFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (await fileExists(absolutePath)) {
      if (!collectedFiles.includes(relativePath)) {
        collectedFiles.push(relativePath);
      }
    }
  }

  const outputSegments = [];
  for (const relativePath of collectedFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    const contents = await fs.readFile(absolutePath, 'utf8');
    outputSegments.push(`==== FILE: ${relativePath} ====`);
    outputSegments.push(contents);
  }

  const finalOutput = outputSegments.join('\n');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, finalOutput, 'utf8');

  console.log(
    'Sauvegarde consolidée créée à /Users/loic/Documents/ZoneStat/SiteWeb/Sauvegarde/ZoneStat-src-backup.txt,\n' +
      'regroupant tous les fichiers .ts/.tsx/.js/.jsx du dossier src ainsi que middleware.ts et globals.css.\n' +
      "Aucun fichier original n'a été modifié. L'ancien contenu du fichier de sauvegarde a été remplacé intégralement."
  );
}

buildBackup().catch((error) => {
  console.error('Erreur lors de la création de la sauvegarde:', error);
  process.exit(1);
});

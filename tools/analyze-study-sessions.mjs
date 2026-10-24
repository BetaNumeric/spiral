#!/usr/bin/env node
// Analyze Spiral study session exports and generate summary CSV files plus an HTML report.
//
// Examples:
//   node tools/analyze-study-sessions.mjs
//   node tools/analyze-study-sessions.mjs study-session-a.json study-session-b.json
//   node tools/analyze-study-sessions.mjs ./study-exports --out ./study-analysis

import fs from 'node:fs';
import path from 'node:path';
import {
  INTERACTION_COLUMNS,
  SUMMARY_COLUMNS,
  TASK_COLUMNS,
  buildTaskRows,
  buildStudyImportEntries,
  analyzeSessions,
  buildCsv,
  buildInteractionRows,
  buildReportHtml,
  buildSummaryRows
} from './study-analysis-core.mjs';

const ROOT_DIR = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, 'study-analysis');
const STUDY_EXPORT_PATTERN = /^study-(?:sessions?|archive)-.*\.json$/i;

function printHelp() {
  console.log(`Usage: node tools/analyze-study-sessions.mjs [input-file-or-dir ...] [--out output-dir]

Inputs default to the current working directory. Directories are scanned for
study-session-*.json, study-sessions-*.json, and study-archive-*.json.
Outputs:
  summary.csv
  interactions.csv
  tasks.csv
  raw-archive.json
  report.html`);
}

function parseArgs(argv) {
  const inputs = [];
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      return { help: true, inputs, outputDir };
    }
    if (arg === '--out' || arg === '-o') {
      const next = argv[index + 1];
      if (!next) throw new Error('--out requires a directory path');
      outputDir = path.resolve(ROOT_DIR, next);
      index += 1;
      continue;
    }
    inputs.push(path.resolve(ROOT_DIR, arg));
  }

  return {
    help: false,
    inputs: inputs.length > 0 ? inputs : [ROOT_DIR],
    outputDir
  };
}

function listStudyFiles(inputPath) {
  const stats = fs.statSync(inputPath);
  if (stats.isFile()) return [inputPath];
  if (!stats.isDirectory()) return [];

  return fs.readdirSync(inputPath)
    .filter((fileName) => STUDY_EXPORT_PATTERN.test(fileName))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.join(inputPath, fileName));
}

function loadStudyEntries(inputPaths, diagnostics) {
  const files = [];
  for (const inputPath of inputPaths) {
    try { files.push(...listStudyFiles(inputPath)); }
    catch (error) { diagnostics.push({ source: inputPath, severity: 'error', issues: [error.message] }); }
  }
  const entries = [];
  for (const filePath of files) {
    let originalText;
    try {
      originalText = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(originalText.replace(/^\uFEFF/, ''));
      entries.push(...buildStudyImportEntries(parsed, { fileName: path.basename(filePath),
        source: path.relative(ROOT_DIR, filePath) || filePath, originalText }));
    } catch (error) {
      diagnostics.push({ source: filePath, severity: 'error', issues: [`Could not parse recording: ${error.message}`] });
      if (originalText !== undefined) entries.push({ fileName: path.basename(filePath), source: filePath,
        raw: null, importError: error.message, originalText });
    }
  }
  return entries;
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, 'utf8');
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const diagnostics = [];
  const entries = loadStudyEntries(options.inputs, diagnostics);
  const sessions = analyzeSessions(entries, { diagnostics });
  for (const item of diagnostics) console.error(`${item.severity}: ${item.source}: ${item.issues.join(" ")}`);
  if (sessions.length === 0) {
    console.error('No usable canonical study sessions found. Expected session/archive JSON files.');
    process.exitCode = 1;
    if (entries.length === 0) return;
  }

  fs.mkdirSync(options.outputDir, { recursive: true });
  writeFile(path.join(options.outputDir, 'summary.csv'), buildCsv(SUMMARY_COLUMNS, buildSummaryRows(sessions)));
  writeFile(path.join(options.outputDir, 'interactions.csv'), buildCsv(INTERACTION_COLUMNS, buildInteractionRows(sessions)));
  writeFile(path.join(options.outputDir, 'tasks.csv'), buildCsv(TASK_COLUMNS, buildTaskRows(sessions)));
  writeFile(path.join(options.outputDir, 'raw-archive.json'), `${JSON.stringify({
    format: 'spiral-study-archive', exportTime: new Date().toISOString(),
    sessions: sessions.map((session) => session.originalRaw), imports: entries
  }, null, 2)}\n`);
  writeFile(
    path.join(options.outputDir, 'report.html'),
    buildReportHtml(sessions, {
      title: 'Study Session Report', diagnostics,
      sourceText: `Generated from ${sessions.length} study session${sessions.length === 1 ? '' : 's'} loaded by the CLI analyzer.`
    })
  );

  console.log(`Wrote ${sessions.length} session(s) to ${options.outputDir}`);
  console.log(`- ${path.join(options.outputDir, 'summary.csv')}`);
  console.log(`- ${path.join(options.outputDir, 'interactions.csv')}`);
  console.log(`- ${path.join(options.outputDir, 'report.html')}`);
  console.log(`- ${path.join(options.outputDir, 'tasks.csv')}`);
  console.log(`- ${path.join(options.outputDir, 'raw-archive.json')}`);
}

try {
  runCli();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}

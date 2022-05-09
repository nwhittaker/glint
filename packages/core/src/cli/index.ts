import yargs from 'yargs';
import { loadConfig } from '@glint/config';
import { performWatch } from './perform-watch';
import { performCheck } from './perform-check';
import { determineOptionsToExtend } from './options';
import { loadTypeScript } from '../common/load-typescript';

const { argv } = yargs
  .scriptName('glint')
  .usage('$0 [options]')
  .option('project', {
    alias: 'p',
    string: true,
    description: 'The path to the tsconfig file to use',
  })
  .option('watch', {
    alias: 'w',
    boolean: true,
    description: 'Whether to perform an ongoing watched build',
  })
  .option('declaration', {
    alias: 'd',
    boolean: true,
    description: 'Whether to emit declaration files',
  })
  .option('build', {
    alias: 'b',
    boolean: true,
    description:
      'Build one or more projects and their dependencies, if out of date. Same as the TS `--build` flag.',
    // As with TS itself, we *must* emit declarations when in build mode
    conflicts: 'declaration',
  })
  .option('clean', {
    implies: 'build',
    boolean: true,
    description: 'Delete the outputs of all projects.',
  })
  .option('force', {
    implies: 'build',
    description: 'Act as if all projects are out of date. Same as the TS `--force` flag.',
  })
  .option('debug-intermediate-representation', {
    boolean: false,
    description: `When true, writes out a Glint's internal intermediate representation of each file within a GLINT_DEBUG subdirectory of the current working directory. This is intended for debugging Glint itself.`,
  })
  .wrap(100)
  .strict();

const ts = loadTypeScript();
const glintConfig = loadConfig(process.cwd());
const tsconfigPath = argv.project ?? ts.findConfigFile('.', ts.sys.fileExists);
const optionsToExtend = determineOptionsToExtend(argv);

if (argv['debug-intermediate-representation']) {
  const fs = require('fs');
  const path = require('path');
  (globalThis as any).GLINT_DEBUG_IR = function (filename: string, content: string) {
    let target = path.join('GLINT_DEBUG', path.relative(glintConfig.rootDir, filename));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
}

if (argv.watch) {
  performWatch(ts, glintConfig, tsconfigPath, optionsToExtend);
} else {
  performCheck(ts, glintConfig, tsconfigPath, optionsToExtend);
}

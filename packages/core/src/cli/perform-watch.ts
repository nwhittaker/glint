import TransformManager from '../common/transform-manager';
import { GlintConfig } from '@glint/config';
import { buildDiagnosticFormatter } from './diagnostics';
import type ts from 'typescript';
import { sysForWatchCompilerHost } from './utils/sys-for-watch';
import { patchProgram } from './utils/patch-program';

export type TypeScript = typeof ts;

export function performWatch(
  ts: TypeScript,
  glintConfig: GlintConfig,
  tsconfigPath: string | undefined,
  optionsToExtend: ts.CompilerOptions
): void {
  let transformManager = new TransformManager(ts, glintConfig);
  let formatDiagnostic = buildDiagnosticFormatter(ts);
  let host = ts.createWatchCompilerHost(
    tsconfigPath ?? 'tsconfig.json',
    optionsToExtend,
    sysForWatchCompilerHost(ts, transformManager),
    ts.createSemanticDiagnosticsBuilderProgram,
    (diagnostic) => console.error(formatDiagnostic(diagnostic))
  );

  patchWatchCompilerHost(host, transformManager);

  ts.createWatchProgram(host);
}

type Program = ts.SemanticDiagnosticsBuilderProgram;
type WatchCompilerHost = ts.WatchCompilerHostOfConfigFile<Program>;

function patchWatchCompilerHost(host: WatchCompilerHost, transformManager: TransformManager): void {
  let { afterProgramCreate } = host;
  host.afterProgramCreate = (program) => {
    patchProgram(program, transformManager);
    afterProgramCreate?.call(host, program);
  };
}

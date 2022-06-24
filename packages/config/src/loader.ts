import path from 'path';
import SilentError from 'silent-error';
import resolve from 'resolve';
import { GlintConfig, GlintConfigInput } from './config';

/**
 * `ConfigLoader` provides an interface for finding the Glint config that
 * applies to a given file or directory, ensuring that only a single instance
 * of `GlintConfig` is ever created for a given `tsconfig.json` or
 * `jsconfig.json` source file.
 */
export class ConfigLoader {
  private configs = new Map<string, GlintConfig | null>();

  public configForFile(filePath: string): GlintConfig | null {
    return this.configForDirectory(path.dirname(filePath));
  }

  public configForDirectory(directory: string): GlintConfig | null {
    let ts = findTypeScript(directory);
    if (!ts) return null;

    let configPath = findNearestConfigFile(ts, directory);
    if (!configPath) return null;

    let existing = this.configs.get(configPath);
    if (existing !== undefined) return existing;

    let configInput = loadConfigInput(ts, configPath);
    let config = configInput ? new GlintConfig(ts, configPath, configInput) : null;

    this.configs.set(configPath, config);

    return config;
  }
}

function findTypeScript(fromDir: string): typeof import('typescript') | null {
  return (
    tryResolve(() => require(resolve.sync('typescript', { basedir: fromDir }))) ??
    tryResolve(() => require('typescript'))
  );
}

function tryResolve<T>(load: () => T): T | null {
  try {
    return load();
  } catch (error: any) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      return null;
    }

    throw error;
  }
}

function loadConfigInput(
  ts: typeof import('typescript'),
  entryPath: string
): GlintConfigInput | null {
  let fullGlintConfig: Record<string, unknown> = {};
  let currentPath: string | undefined = entryPath;

  while (currentPath) {
    let currentContents: any = ts.readConfigFile(currentPath, ts.sys.readFile).config;
    let currentGlintConfig = currentContents.glint ?? {};

    assert(
      currentPath === entryPath || !currentGlintConfig.transform,
      'Glint `transform` options may not be specified in extended config.'
    );

    fullGlintConfig = { ...currentGlintConfig, ...fullGlintConfig };
    currentPath =
      currentContents.extends && path.resolve(path.dirname(currentPath), currentContents.extends);
  }

  return validateConfigInput(fullGlintConfig);
}

function findNearestConfigFile(ts: typeof import('typescript'), searchFrom: string): string {
  // Assume that the longest path is the most relevant one in the case that
  // multiple config files exist at or above our current directory.
  let configCandidates = [
    ts.findConfigFile(searchFrom, ts.sys.fileExists, 'tsconfig.json'),
    ts.findConfigFile(searchFrom, ts.sys.fileExists, 'jsconfig.json'),
  ]
    .filter((path): path is string => typeof path === 'string')
    .sort((a, b) => b.length - a.length);

  return configCandidates[0];
}

function validateConfigInput(input: Record<string, unknown>): GlintConfigInput | null {
  if (!input['environment']) return null;

  assert(
    isObject(input['environment'])
      ? !Array.isArray(input['environment'])
      : typeof input['environment'] === 'string',
    'Glint config must specify an `environment` that is a either string or an object ' +
      'mapping environment names to their configuration.'
  );

  assert(
    input['checkStandaloneTemplates'] === undefined ||
      typeof input['checkStandaloneTemplates'] === 'boolean',
    'If defined, `checkStandaloneTemplates` must be a boolean'
  );

  assert(
    input['transform'] === undefined || isObject(input['transform']),
    'If defined, `transform` must be an object'
  );

  let transform = input['transform'];
  if (transform) {
    assert(
      Array.isArray(transform['include'])
        ? transform['include'].every((item) => typeof item === 'string')
        : !transform['include'] || typeof transform['include'] === 'string',
      'If defined, `transform.include` must be a string or array of strings'
    );

    assert(
      Array.isArray(transform['exclude'])
        ? transform['exclude'].every((item) => typeof item === 'string')
        : !transform['exclude'] || typeof transform['exclude'] === 'string',
      'If defined, `transform.exclude` must be a string or array of strings'
    );
  }

  return input as GlintConfigInput;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && Boolean(value);
}

function assert(test: unknown, message: string): asserts test {
  if (!test) {
    throw new SilentError(`Glint config: ${message}`);
  }
}

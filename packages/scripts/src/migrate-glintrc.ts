import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';

import { evaluate, patch } from 'golden-fleece';
import yaml from 'js-yaml';
import Result, { err, ok, tryOrElse } from 'true-myth/result';
import type Unit from 'true-myth/unit';
// hack for importing it in a way TS understands; @types/yargs is not up to date
const yargs = (await import('yargs')).default() as unknown as typeof import('yargs');
import { z } from 'zod';

const EnvironmentList = z.array(z.string());

const EnvironmentMap = z.record(
  z.object({
    additionalGlobals: z.optional(z.array(z.string())),
    checkStandaloneTemplates: z.optional(z.boolean()),
  })
);
type EnvironmentMap = z.infer<typeof EnvironmentMap>;

const Environment = z.union([z.string(), EnvironmentList, EnvironmentMap]);
const Files = z.optional(z.array(z.string()));

const GlintRc = z.object({
  environment: Environment,
  include: Files,
  exclude: Files,
});

type GlintRc = z.infer<typeof GlintRc>;

function loadFile(path: string): Promise<Result<string, string>> {
  return readFile(path, { encoding: 'utf-8' })
    .then((v) => ok<string, string>(v))
    .catch((e) => err(`Could not load file at ${path}: ${JSON.stringify(e)}`));
}

function loadOrCreateTsconfig(configPath: string): Promise<string> {
  return readFile(configPath, { encoding: 'utf-8' }).catch((e) => {
    console.info(
      `Could not load tsconfig.json at ${configPath}: ${e}; attempting to create a new one`
    );
    return '{}';
  });
}

function saveFile(path: string, data: string): Promise<Result<Unit, string>> {
  return writeFile(path, data)
    .then(() => ok<Unit, string>())
    .catch((e) => err(`Could not write file at ${path}: ${JSON.stringify(e)}`));
}

function assert(predicate: unknown, reason: string): asserts predicate {
  if (!predicate) {
    throw new Error(`panic: ${reason}`);
  }
}

function parseGlintRcFile(contents: string): Result<GlintRc, string> {
  let errors: string[] = [];
  let yamlData = yaml.load(contents, {
    onWarning: (yamlException) => errors.push(yamlException.toString()),
  });
  if (errors.length) {
    return err(`Could not parse YAML:\n\t${errors.join('\n\t')}`);
  }

  return tryOrElse(
    (e) => {
      assert(e instanceof z.ZodError, 'error somehow not a zod error');
      return `Could not parse data:\n\t${e.format()._errors.join('\n\t')}`;
    },
    () => {
      return GlintRc.parse(yamlData);
    }
  );
}

function patchTsconfig(contents: unknown, rc: GlintRc): Result<string, string> {
  if (typeof contents !== 'string') {
    return err(`Could not patch ${JSON.stringify(contents)}: not a string`);
  }

  return tryOrElse(
    (e) => `Could not patch data:\n\t${JSON.stringify(e)}`,
    () => {
      const config = evaluate(contents);

      // In the new world, the *only* options are: a single string key *or* a
      // map of names to configurations (where the configuration may be empty).
      const environment = Array.isArray(rc.environment)
        ? (Object.fromEntries(rc.environment.map((name) => [name, {}])) as EnvironmentMap)
        : rc.environment;

      config.glint = {
        environment,
        transforms: {
          include: rc.include,
          exclude: rc.exclude,
        },
      };

      return patch(contents, config);
    }
  );
}

function settledToResult<T>(
  settledResults: Array<PromiseSettledResult<Result<T, unknown>>>
): Array<Result<T, string>>;
function settledToResult<T>(
  settledResults: Array<PromiseSettledResult<T>>
): Array<Result<T, string>> {
  return settledResults.map((result) =>
    result.status === 'fulfilled' ? ok(result.value) : err(JSON.stringify(result.reason))
  );
}

function neighborTsconfigPath(rcPath: string): string {
  return path.join(rcPath, '..', 'tsconfig.json');
}

function splitResults<T, E>(rs: Array<Result<T, E>>): [Array<T>, Array<E>] {
  return rs.reduce(
    ([t, e], r) =>
      r.match({
        Ok: (value) => [t.concat(value), e],
        Err: (reason) => [t, e.concat(reason)],
      }),
    [[] as T[], [] as E[]]
  );
}

function dumpErrors<T, E>([ts, es]: [T[], E[]]): T[] {
  es.forEach((e) => console.error(e));
  return ts;
}

function cleanup<T>(settledResults: Array<PromiseSettledResult<Result<T, unknown>>>): Array<T> {
  return dumpErrors(splitResults(settledToResult(settledResults)));
}

function reportSuccesses(pathPairs: Array<[string, string]>): void {
  pathPairs.forEach(([rcPath, tsconfigPath]) =>
    console.log(`Updated ${tsconfigPath} with contents of ${rcPath}`)
  );
}

async function main(): Promise<void> {
  let paths = yargs
    .scriptName('migrate-glintrc')
    .usage('$0 <paths>')
    .positional('paths', {
      description: 'path to the `.glintrc.yml` file(s) to migrate',
      array: true,
    })
    .demandCommand()
    .wrap(100)
    .strict().argv._;

  let parsed = await Promise.allSettled(
    paths.map(async (p) => {
      const contents = await loadFile(p);

      return contents
        .andThen(parseGlintRcFile)
        .map((parsed) => [p, parsed] as [string, GlintRc])
        .mapErr((err) => `${p}: ${err}`);
    })
  ).then(cleanup);

  let patched = await Promise.allSettled(
    parsed.map(async ([rcPath, rc]) => {
      let tsconfigPath = neighborTsconfigPath(rcPath);
      const contents = await loadOrCreateTsconfig(tsconfigPath);

      return patchTsconfig(contents, rc)
        .map((patched) => [rcPath, tsconfigPath, patched] as [string, string, string])
        .mapErr((err) => `${rcPath}: ${err}`);
    })
  ).then(cleanup);

  await Promise.allSettled(
    patched.map(async ([rcPath, tsconfigPath, patched]) => {
      const writeResult = await saveFile(tsconfigPath, patched);
      return writeResult.map(() => [rcPath, tsconfigPath] as [string, string]);
    })
  )
    .then(cleanup)
    .then(reportSuccesses);
}

main();

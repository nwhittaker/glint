import path from 'path';
import fs from 'fs';
import execa, { ExecaChildProcess, Options } from 'execa';
import ts from 'typescript';
import { loadConfig } from '@glint/config';
import GlintLanguageServer from '../../src/language-server/glint-language-server';
import { filePathToUri, normalizeFilePath, parseConfigFile } from '../../src/language-server/util';
import DocumentCache from '../../src/common/document-cache';
import TransformManager from '../../src/common/transform-manager';

const ROOT = path.resolve(__dirname, '../../../../test-packages/ephemeral');

export default class Project {
  private rootDir = normalizeFilePath(path.join(ROOT, Math.random().toString(16).slice(2)));
  private server?: GlintLanguageServer;

  private constructor() {}

  public filePath(fileName: string): string {
    return normalizeFilePath(path.join(this.rootDir, fileName));
  }

  public fileURI(fileName: string): string {
    return filePathToUri(this.filePath(fileName));
  }

  public startLanguageServer(): GlintLanguageServer {
    if (this.server) {
      throw new Error('Language server is already running');
    }

    let glintConfig = loadConfig(this.rootDir);
    let documents = new DocumentCache(ts, glintConfig);
    let transformManager = new TransformManager(ts, glintConfig, documents);
    let tsConfig = parseConfigFile(ts, transformManager, this.rootDir);

    return (this.server = new GlintLanguageServer(
      ts,
      glintConfig,
      documents,
      transformManager,
      tsConfig
    ));
  }

  public static async create(compilerOptions: ts.CompilerOptions = {}): Promise<Project> {
    let project = new Project();
    let tsconfig = {
      compilerOptions: {
        strict: true,
        target: 'es2019',
        module: 'es2015',
        moduleResolution: 'node',
        skipLibCheck: true,
        allowJs: true,
        checkJs: false,
        ...compilerOptions,
      },
    };

    fs.rmdirSync(project.rootDir, { recursive: true });
    fs.mkdirSync(project.rootDir, { recursive: true });

    fs.writeFileSync(path.join(project.rootDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(project.rootDir, '.glintrc'), 'environment: glimmerx\n');
    fs.writeFileSync(
      path.join(project.rootDir, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2)
    );

    return project;
  }

  public write(files: Record<string, string>): void;
  public write(fileName: string, fileContent: string): void;
  public write(...args: [Record<string, string>] | [string, string]): void {
    let files: Record<string, string>;
    if (args.length === 2) {
      files = { [args[0]]: args[1] };
    } else {
      files = args[0];
    }

    for (let [fileName, fileContent] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(this.filePath(fileName)), { recursive: true });
      fs.writeFileSync(this.filePath(fileName), fileContent);
    }
  }

  public readdir(dirName = '.'): Array<string> {
    return fs.readdirSync(this.filePath(dirName));
  }

  public read(fileName: string): string {
    return fs.readFileSync(this.filePath(fileName), 'utf-8');
  }

  public remove(fileName: string): void {
    fs.unlinkSync(this.filePath(fileName));
  }

  public async destroy(): Promise<void> {
    this.server?.dispose();
    fs.rmdirSync(this.rootDir, { recursive: true });
  }

  public check(options: Options & { flags?: string[] } = {}): ExecaChildProcess {
    return execa.node(`${__dirname}/../../bin/glint`, options.flags, {
      cwd: this.rootDir,
      ...options,
    });
  }

  public watch(options?: Options): Watch {
    return new Watch(this.check({ ...options, flags: ['--watch'], reject: false }));
  }

  public build(options: Options & { flags?: string[] } = {}): ExecaChildProcess {
    let build = ['--build'];
    let flags = options.flags ? build.concat(options.flags) : build;
    return execa.node(`${__dirname}/../../bin/glint`, flags, {
      cwd: this.rootDir,
      ...options,
    });
  }

  public buildWatch(options: Options): Watch {
    return new Watch(this.build({ ...options, flags: ['--watch'], reject: false }));
  }
}

class Watch {
  public constructor(private process: ExecaChildProcess) {}

  public awaitOutput(target: string): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      let handleOutput = (chunk: any): void => {
        output += chunk.toString();
        if (output.includes(target)) {
          this.process.stdout?.off('data', handleOutput);
          this.process.stderr?.off('data', handleOutput);
          resolve(output);
        }
      };

      this.process.stdout?.on('data', handleOutput);
      this.process.stderr?.on('data', handleOutput);
    });
  }

  public terminate(): ExecaChildProcess {
    this.process.kill();
    return this.process;
  }
}

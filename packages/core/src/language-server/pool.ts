import { ConfigLoader, GlintConfig } from '@glint/config';
import type ts from 'typescript';
import { Connection, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import DocumentCache from '../common/document-cache';
import { debounce } from '../common/scheduling';
import TransformManager from '../common/transform-manager';
import GlintLanguageServer from './glint-language-server';
import { uriToFilePath } from './util';

export type ServerDetails = {
  server: GlintLanguageServer;
  rootDir: string;
  scheduleDiagnostics: () => void;
};

export class LanguageServerPool {
  private servers = new Map<GlintConfig, ServerDetails>();
  private configLoader = new ConfigLoader();

  public constructor(
    private connection: Connection,
    private openDocuments: TextDocuments<TextDocument>
  ) {}

  public forEachServer<T>(callback: (details: ServerDetails) => T): void {
    for (let details of this.servers.values()) {
      this.runWithCapturedErrors(callback, details);
    }
  }

  public withServerForURI<T>(uri: string, callback: (details: ServerDetails) => T): T | undefined {
    let filePath = uriToFilePath(uri);
    let config = this.configLoader.configForFile(filePath);
    if (config === null) return;

    let details = this.servers.get(config);
    if (!details) {
      details = this.launchServer(config);
      this.servers.set(config, details);
    }

    if (details) {
      return this.runWithCapturedErrors(callback, details);
    }
  }

  private runWithCapturedErrors<T>(
    callback: (details: ServerDetails) => T,
    details: ServerDetails
  ): T | undefined {
    try {
      return callback(details);
    } catch (error) {
      this.connection.console.error(errorMessage(error));
    }
  }

  private serverDetailsForURI(uri: string): ServerDetails | null {
    let config = this.configLoader.configForFile(uriToFilePath(uri));
    return (config && this.servers.get(config)) ?? null;
  }

  private launchServer(glintConfig: GlintConfig): ServerDetails {
    let documentCache = new DocumentCache(glintConfig);
    let transformManager = new TransformManager(glintConfig, documentCache);
    let tsconfig = parseTsconfig(glintConfig, transformManager);
    let rootDir = glintConfig.rootDir;
    let server = new GlintLanguageServer(glintConfig, documentCache, transformManager, tsconfig);
    let scheduleDiagnostics = this.buildDiagnosticScheduler(server);

    return { server, rootDir, scheduleDiagnostics };
  }

  private buildDiagnosticScheduler(server: GlintLanguageServer): () => void {
    return debounce(250, () => {
      let documentsForServer = this.openDocuments
        .all()
        .filter((doc) => this.serverDetailsForURI(doc.uri)?.server === server);

      for (let { uri } of documentsForServer) {
        try {
          const diagnostics = server.getDiagnostics(uri);
          this.connection.sendDiagnostics({ uri, diagnostics });
        } catch (error) {
          this.connection.sendDiagnostics({
            uri,
            diagnostics: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                message:
                  'Glint encountered an error computing diagnostics for this file. ' +
                  'This is likely a bug in Glint; please file an issue, including any ' +
                  'code and/or steps to follow to reproduce the error.\n\n' +
                  errorMessage(error),
              },
            ],
          });

          this.connection.console.error(
            `Error getting diagnostics for ${uri}.\n${errorMessage(error)}`
          );
        }
      }
    });
  }
}

export function parseTsconfig(
  glintConfig: GlintConfig,
  transformManager: TransformManager
): ts.ParsedCommandLine {
  let { ts } = glintConfig;
  let contents = ts.readConfigFile(glintConfig.configPath, ts.sys.readFile).config;
  let host = { ...ts.sys, readDirectory: transformManager.readDirectory };

  return ts.parseJsonConfigFileContent(
    contents,
    host,
    glintConfig.rootDir,
    undefined,
    glintConfig.configPath
  );
}

function errorMessage(error: unknown): string {
  return (error instanceof Error && error.stack) || `${error}`;
}

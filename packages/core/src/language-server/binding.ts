import {
  Connection,
  FileChangeType,
  ServerCapabilities,
  SymbolInformation,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { GlintCompletionItem } from './glint-language-server';
import { LanguageServerPool } from './pool';
import { uriToFilePath } from './util';

export const capabilities: ServerCapabilities = {
  textDocumentSync: TextDocumentSyncKind.Full,
  completionProvider: {
    resolveProvider: true,
  },
  referencesProvider: true,
  hoverProvider: true,
  definitionProvider: true,
  workspaceSymbolProvider: true,
  renameProvider: {
    prepareProvider: true,
  },
};

export type BindingArgs = {
  openDocuments: TextDocuments<TextDocument>;
  connection: Connection;
  pool: LanguageServerPool;
};

export function bindLanguageServerPool({ connection, pool, openDocuments }: BindingArgs): void {
  connection.onInitialize(() => ({ capabilities }));

  openDocuments.onDidOpen(({ document }) => {
    pool.withServerForURI(document.uri, ({ server, scheduleDiagnostics }) => {
      server.openFile(document.uri, document.getText());
      scheduleDiagnostics();
    });
  });

  openDocuments.onDidClose(({ document }) => {
    pool.withServerForURI(document.uri, ({ server }) => {
      server.closeFile(document.uri);
    });
  });

  openDocuments.onDidChangeContent(({ document }) => {
    pool.withServerForURI(document.uri, ({ server, scheduleDiagnostics }) => {
      server.updateFile(document.uri, document.getText());
      scheduleDiagnostics();
    });
  });

  connection.onPrepareRename(({ textDocument, position }) => {
    return pool.withServerForURI(textDocument.uri, ({ server }) =>
      server.prepareRename(textDocument.uri, position)
    );
  });

  connection.onRenameRequest(({ textDocument, position, newName }) => {
    return pool.withServerForURI(textDocument.uri, ({ server }) =>
      server.getEditsForRename(textDocument.uri, position, newName)
    );
  });

  connection.onCompletion(({ textDocument, position }) => {
    return pool.withServerForURI(textDocument.uri, ({ server }) =>
      server.getCompletions(textDocument.uri, position)
    );
  });

  connection.onCompletionResolve((item) => {
    // SAFETY: We should only ever get completion resolution requests for items we ourselves produced
    let glintItem = item as GlintCompletionItem;

    return (
      pool.withServerForURI(glintItem.data.uri, ({ server }) =>
        server.getCompletionDetails(glintItem)
      ) ?? item
    );
  });

  connection.onHover(({ textDocument, position }) => {
    return pool.withServerForURI(textDocument.uri, ({ server }) =>
      server.getHover(textDocument.uri, position)
    );
  });

  connection.onDefinition(({ textDocument, position }) => {
    return pool.withServerForURI(textDocument.uri, ({ server }) =>
      server.getDefinition(textDocument.uri, position)
    );
  });

  connection.onReferences(({ textDocument, position }) => {
    return pool.withServerForURI(textDocument.uri, ({ server }) =>
      server.getReferences(textDocument.uri, position)
    );
  });

  connection.onWorkspaceSymbol(({ query }) => {
    let symbols: Array<SymbolInformation> = [];
    pool.forEachServer(({ server }) => {
      symbols.push(...server.findSymbols(query));
    });
    return symbols;
  });

  connection.onDidChangeWatchedFiles(({ changes }) => {
    let changePaths = changes.map((change) => ({ change, path: uriToFilePath(change.uri) }));

    pool.forEachServer(({ server, rootDir, scheduleDiagnostics }) => {
      for (let { change, path } of changePaths) {
        if (!path.startsWith(rootDir)) continue;

        if (change.type === FileChangeType.Created) {
          server.watchedFileWasAdded(change.uri);
        } else if (change.type === FileChangeType.Deleted) {
          server.watchedFileWasRemoved(change.uri);
        } else {
          server.watchedFileDidChange(change.uri);
        }
      }

      scheduleDiagnostics();
    });
  });
}

import { commands, languages, ViewColumn, window, Uri, Range } from 'vscode';
import path from 'path';
import { waitUntil } from './helpers/async';

describe('Smoke test: ETI Environment', () => {
  jest.setTimeout(30_000);

  const rootDir = path.resolve(__dirname, '../__fixtures__/template-imports-app');

  afterEach(async () => {
    while (window.activeTextEditor) {
      await commands.executeCommand('workbench.action.files.revert');
      await commands.executeCommand('workbench.action.closeActiveEditor');
    }
  });

  describe('diagnostics for errors', () => {
    test('with a custom extension', async () => {
      let scriptURI = Uri.file(`${rootDir}/src/index.gts`);
      let scriptEditor = await window.showTextDocument(scriptURI, { viewColumn: ViewColumn.One });

      // Ensure we have a clean bill of health
      expect(languages.getDiagnostics(scriptURI)).toEqual([]);

      // Replace a string with a number
      await scriptEditor.edit((edit) => {
        edit.replace(new Range(6, 20, 6, 27), '{{123}}');
      });

      // Wait for the diagnostic to show up
      await waitUntil(() => languages.getDiagnostics(scriptURI).length);

      // Verify it's what we expect
      expect(languages.getDiagnostics(scriptURI)).toMatchObject([
        {
          message: "Type 'number' is not assignable to type 'string'.",
          source: 'glint:ts(2322)',
          range: new Range(6, 13, 6, 19),
        },
      ]);
    });
  });
});

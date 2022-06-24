import Project from '../utils/project';
import { stripIndent } from 'common-tags';

describe('Language Server: custom file extensions', () => {
  let project!: Project;

  beforeEach(async () => {
    jest.setTimeout(20_000);
    project = await Project.create();
  });

  afterEach(async () => {
    await project.destroy();
  });

  test('reporting diagnostics', () => {
    let contents = 'let identifier: string = 123;';

    project.setGlintConfig({ environment: 'ember-template-imports' });
    project.write('index.gts', contents);

    let server = project.startLanguageServer();

    expect(server.getDiagnostics(project.fileURI('index.gts'))).toMatchInlineSnapshot(`
      Array [
        Object {
          "message": "Type 'number' is not assignable to type 'string'.",
          "range": Object {
            "end": Object {
              "character": 14,
              "line": 0,
            },
            "start": Object {
              "character": 4,
              "line": 0,
            },
          },
          "severity": 1,
          "source": "glint:ts(2322)",
          "tags": Array [],
        },
      ]
    `);

    server.openFile(project.fileURI('index.gts'), contents);

    expect(server.getDiagnostics(project.fileURI('index.gts'))).toMatchInlineSnapshot(`
      Array [
        Object {
          "message": "Type 'number' is not assignable to type 'string'.",
          "range": Object {
            "end": Object {
              "character": 14,
              "line": 0,
            },
            "start": Object {
              "character": 4,
              "line": 0,
            },
          },
          "severity": 1,
          "source": "glint:ts(2322)",
          "tags": Array [],
        },
      ]
    `);

    server.updateFile(project.fileURI('index.gts'), contents.replace('123', '"hi"'));

    expect(server.getDiagnostics(project.fileURI('index.gts'))).toEqual([]);
  });

  test('providing hover info', () => {
    let contents = 'let identifier = "hello";';

    project.setGlintConfig({ environment: 'ember-template-imports' });
    project.write('index.gts', contents);

    let server = project.startLanguageServer();
    let hover = server.getHover(project.fileURI('index.gts'), { line: 0, character: 8 });

    expect(hover).toMatchInlineSnapshot(`
      Object {
        "contents": Array [
          Object {
            "language": "ts",
            "value": "let identifier: string",
          },
        ],
        "range": Object {
          "end": Object {
            "character": 14,
            "line": 0,
          },
          "start": Object {
            "character": 4,
            "line": 0,
          },
        },
      }
    `);

    project.write('index.gts', contents.replace('"hello"', '123'));
    server.watchedFileDidChange(project.fileURI('index.gts'));

    hover = server.getHover(project.fileURI('index.gts'), { line: 0, character: 8 });

    expect(hover).toMatchInlineSnapshot(`
      Object {
        "contents": Array [
          Object {
            "language": "ts",
            "value": "let identifier: number",
          },
        ],
        "range": Object {
          "end": Object {
            "character": 14,
            "line": 0,
          },
          "start": Object {
            "character": 4,
            "line": 0,
          },
        },
      }
    `);
  });

  test('resolving conflicts between overlapping extensions', () => {
    let contents = 'export let identifier = 123`;';

    project.setGlintConfig({ environment: 'ember-template-imports' });
    project.write('index.ts', contents);
    project.write('index.gts', contents);

    project.write(
      'consumer.ts',
      stripIndent`
        import { identifier } from './index';

        identifier;
      `
    );

    let consumerURI = project.fileURI('consumer.ts');
    let server = project.startLanguageServer();

    let definitions = server.getDefinition(consumerURI, { line: 2, character: 4 });
    let diagnostics = server.getDiagnostics(consumerURI);

    expect(definitions).toMatchObject([{ uri: project.fileURI('index.ts') }]);
    expect(diagnostics).toEqual([]);

    project.remove('index.ts');
    server.watchedFileDidChange(project.fileURI('index.ts'));

    definitions = server.getDefinition(consumerURI, { line: 2, character: 4 });
    diagnostics = server.getDiagnostics(consumerURI);

    expect(definitions).toMatchObject([{ uri: project.fileURI('index.gts') }]);
    expect(diagnostics).toEqual([]);

    project.remove('index.gts');
    server.watchedFileWasRemoved(project.fileURI('index.gts'));

    diagnostics = server.getDiagnostics(consumerURI);

    expect(diagnostics).toMatchObject([
      {
        source: 'glint:ts(2307)',
        range: {
          start: { line: 0, character: 27 },
          end: { line: 0, character: 36 },
        },
      },
    ]);
  });

  describe('external file changes', () => {
    beforeEach(() => {
      project.setGlintConfig({ environment: 'ember-template-imports' });
      project.write(
        'index.gts',
        stripIndent`
          import { foo } from "./other";
          console.log(foo);
        `
      );
    });

    test('adding a missing module', () => {
      let server = project.startLanguageServer();
      let diagnostics = server.getDiagnostics(project.fileURI('index.gts'));

      expect(diagnostics).toMatchObject([
        {
          message: "Cannot find module './other' or its corresponding type declarations.",
          source: 'glint:ts(2307)',
        },
      ]);

      project.write('other.gjs', 'export const foo = 123;');
      server.watchedFileWasAdded(project.fileURI('other.gjs'));

      diagnostics = server.getDiagnostics(project.fileURI('index.gts'));

      expect(diagnostics).toEqual([]);
    });

    test('changing an imported module', () => {
      project.write('other.gjs', 'export const foo = 123;');

      let server = project.startLanguageServer();
      let info = server.getHover(project.fileURI('index.gts'), { line: 0, character: 10 });

      expect(info?.contents).toEqual([
        { language: 'ts', value: '(alias) const foo: 123\nimport foo' },
      ]);

      project.write('other.gjs', 'export const foo = "hi";');
      server.watchedFileDidChange(project.fileURI('other.gjs'));

      info = server.getHover(project.fileURI('index.gts'), { line: 0, character: 10 });

      expect(info?.contents).toEqual([
        { language: 'ts', value: '(alias) const foo: "hi"\nimport foo' },
      ]);
    });

    test('removing an imported module', () => {
      project.write('other.gjs', 'export const foo = 123;');

      let server = project.startLanguageServer();
      let diagnostics = server.getDiagnostics(project.fileURI('index.gts'));

      expect(diagnostics).toEqual([]);

      project.remove('other.gjs');
      server.watchedFileWasRemoved(project.fileURI('other.gjs'));

      diagnostics = server.getDiagnostics(project.fileURI('index.gts'));

      expect(diagnostics).toMatchObject([
        {
          message: "Cannot find module './other' or its corresponding type declarations.",
          source: 'glint:ts(2307)',
        },
      ]);
    });
  });
});

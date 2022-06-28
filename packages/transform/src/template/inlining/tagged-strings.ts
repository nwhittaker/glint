import type ts from 'typescript';
import { GlintEnvironment, GlintTagConfig } from '@glint/config';
import { CorrelatedSpansResult, getContainingTypeInfo, PartialCorrelatedSpan } from '.';
import { templateToTypescript } from '../template-to-typescript';
import { Directive, SourceFile, TransformError, Range } from '../transformed-module';
import { assert, TSLib } from '../../util';
import { GlintEmitMetadata } from '@glint/config/src/environment';

export function calculateTaggedTemplateSpans(
  ts: TSLib,
  node: ts.TaggedTemplateExpression,
  meta: GlintEmitMetadata | undefined,
  script: SourceFile,
  environment: GlintEnvironment
): CorrelatedSpansResult {
  let directives: Array<Directive> = [];
  let errors: Array<TransformError> = [];
  let partialSpans: Array<PartialCorrelatedSpan> = [];
  let tag = node.tag;

  if (!ts.isIdentifier(tag)) {
    return { errors, directives, partialSpans };
  }

  let info = resolveTagInfo(ts, tag, environment);
  if (info) {
    assert(
      ts.isNoSubstitutionTemplateLiteral(node.template),
      'No interpolated values in template strings'
    );

    let { typesSource, globals } = info.tagConfig;
    let tagName = tag.text;
    let contents = node.template.rawText ?? node.template.text;

    // Pad the template to account for the tag and surrounding ` characters
    let template = `${''.padStart(tagName.length)} ${contents} `;

    // environment-specific transforms may emit templateLocation in meta, in
    // which case we use that. Otherwise we use the reported location from the
    // node itself (which is presumably correct because no transform has messed
    // with it).
    let templateLocation = meta?.templateLocation ?? {
      start: node.getStart(),
      end: node.getEnd(),
    };

    let preamble = [];
    if (!info.importedBinding.synthetic) {
      preamble.push(`${tagName};`);
    }

    let { inClass, className, typeParams, contextType } = getContainingTypeInfo(ts, node);
    let transformedTemplate = templateToTypescript(template, {
      typesPath: typesSource,
      meta,
      preamble,
      globals,
      typeParams,
      contextType,
      useJsDoc: environment.isUntypedScript(script.filename),
    });

    if (inClass && !className) {
      errors.push({
        source: script,
        message: 'Classes containing templates must have a name',
        location: templateLocation,
      });
    }

    for (let { message, location } of transformedTemplate.errors) {
      if (location) {
        errors.push({
          source: script,
          message,
          location: addOffset(location, templateLocation.start),
        });
      } else {
        errors.push({
          source: script,
          message,
          location: {
            start: tag.getStart(),
            end: tag.getEnd(),
          },
        });
      }
    }

    if (transformedTemplate.result) {
      for (let { kind, location, areaOfEffect } of transformedTemplate.result.directives) {
        directives.push({
          kind: kind,
          source: script,
          location: addOffset(location, templateLocation.start),
          areaOfEffect: addOffset(areaOfEffect, templateLocation.start),
        });
      }

      partialSpans.push({
        originalFile: script,
        originalStart: templateLocation.start,
        originalLength: templateLocation.end - templateLocation.start,
        insertionPoint: templateLocation.start,
        transformedSource: transformedTemplate.result.code,
        mapping: transformedTemplate.result.mapping,
      });
    }
  }

  return { errors, directives, partialSpans };
}

function addOffset(location: Range, offset: number): Range {
  return {
    start: location.start + offset,
    end: location.end + offset,
  };
}

function resolveTagInfo(
  ts: TSLib,
  tag: ts.Identifier,
  environment: GlintEnvironment
): { importedBinding: ImportedBinding; tagConfig: GlintTagConfig } | undefined {
  let importedBindings = collectImportedBindings(ts, tag.getSourceFile());
  let importedBinding = importedBindings[tag.text];
  if (!importedBinding) {
    return;
  }

  for (let [importSource, tags] of Object.entries(environment.getConfiguredTemplateTags())) {
    for (let [importSpecifier, tagConfig] of Object.entries(tags)) {
      if (
        importSource === importedBinding.source &&
        importSpecifier === importedBinding.specifier
      ) {
        return { importedBinding, tagConfig };
      }
    }
  }
}

type ImportedBinding = { specifier: string; source: string; synthetic: boolean };
type ImportedBindings = Record<string, ImportedBinding>;

function collectImportedBindings(ts: TSLib, sourceFile: ts.SourceFile): ImportedBindings {
  let result: ImportedBindings = {};
  for (let statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      assert(ts.isStringLiteral(statement.moduleSpecifier));

      let { importClause } = statement;
      if (!importClause) continue;

      let synthetic = statement.pos === statement.end;

      if (importClause.name) {
        result[importClause.name.text] = {
          specifier: 'default',
          source: statement.moduleSpecifier.text,
          synthetic,
        };
      }

      if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
        for (let binding of importClause.namedBindings.elements) {
          result[binding.name.text] = {
            specifier: binding.propertyName?.text ?? binding.name.text,
            source: statement.moduleSpecifier.text,
            synthetic,
          };
        }
      }
    }
  }
  return result;
}

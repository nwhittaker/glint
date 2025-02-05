import { expectTypeOf } from 'expect-type';
import {
  applySplattributes,
  emitComponent,
  Globals,
  resolve,
} from '@glint/environment-ember-loose/-private/dsl';

let input = resolve(Globals['input']);
let Input = resolve(Globals['Input']);

// Both casings have the same signature
expectTypeOf(input).toEqualTypeOf(Input);

Input({});
Input({ value: 'hello' });
Input({ type: 'text', value: 'hello' });
Input({ type: 'text', value: undefined });
Input({ type: 'text', value: null });
Input({ type: 'checkbox', checked: true });

// NOTE: We allow all string types but, if it becomes easily possible, we should limit to valid HTMLInput types and disallow empty strings.
Input({ type: '', value: 'hello' });
Input({ type: 'string', value: 'hello' });

// Ensure we can apply <input>-specific attributes
{
  const 𝛄 = emitComponent(Input({}));
  applySplattributes(new HTMLInputElement(), 𝛄.element);
}

// @ts-expect-error: `checked` only works with `@type=checkbox`
Input({ checked: true });

// @ts-expect-error: `checked` only works with `@type=checkbox`
Input({ type: 'text', checked: true });

// Event handlers
Input({
  enter: (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<KeyboardEvent>();
  },
  'insert-newline': (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<KeyboardEvent>();
  },
  'escape-press': (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<KeyboardEvent>();
  },
  'focus-in': (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<FocusEvent>();
  },
  'focus-out': (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<FocusEvent>();
  },
  'key-down': (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<KeyboardEvent>();
  },
  'key-press': (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<KeyboardEvent>();
  },
  'key-up': (value, event) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(event).toEqualTypeOf<KeyboardEvent>();
  },
});

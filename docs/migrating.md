# Migrating

## Glint 0.8.x to 0.9.x

Glint 0.9 removes support for the `.glintrc.yml` file, moving configuration into your project's `tsconfig.json` or
`jsconfig.json` file under a `"glint"` key instead. It also restructures the format of the configuration slightly.

The changes are noted below, but also check out the [Configuration](configuration.md) guide for full details on
the options you can specify.

### Migrating `environment`

If your `environment` value was a single string or a name/config object literal, you can translate it directly from
YAML to JSON.

{% tabs %}
{% tab title=".glintrc.yml" %}

```yaml
environment: ember-loose
```

{% endtab %}
{% tab title="tsconfig.json" %}

```javascript
{
  "compilerOptions": { /* ... */ },
  "glint": {
    "environment": "ember-loose"
  }
}
```

{% endtab %}
{% endtabs %}

If you previously had an array of strings (as was suggested in `@glint/environment-ember-template-imports`'s README),
you must now write the full expanded form, even if you aren't passing any special configuration to your environments.

{% tabs %}
{% tab title=".glintrc.yml" %}

```yaml
environment:
  - ember-loose
  - ember-template-imports
```

{% endtab %}
{% tab title="tsconfig.json" %}

```javascript
{
  "compilerOptions": { /* ... */ },
  "glint": {
    "environment": {
      "ember-loose": {},
      "ember-template-imports": {}
    }
  }
}
```

{% endtab %}
{% endtabs %}

### Migrating `include` and `exclude`

The `include` and `exclude` options still function as before, but they are now grouped together under a `transform` key
in order to more clearly denote their distinction from TypeScript's own `include`/`exclude`/`files` options.

{% tabs %}
{% tab title=".glintrc.yml" %}

```yaml
environment: ember-loose
include:
  - 'app/**'
  - 'tests/**'
```

{% endtab %}
{% tab title="tsconfig.json" %}

```javascript
{
  "compilerOptions": { /* ... */ },
  "glint": {
    "environment": "ember-loose",
    "transform": {
      "include": ["app/**", "tests/**"]
    }
  }
}
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
If you have an `include` array like the one above that effectively encompasses your whole project, you should instead
just drop that configuration and leave the `transform` key out of your configuration entirely. Glint performs template
analysis on all files included by your `tsconfig` or `jsconfig` file by default.
{% endhint %}

## Glint 0.7.x to 0.8.0

Glint 0.8.0 drops support for custom imports from `@glint/environment-ember-loose` for values from `@ember/component`,
`@glimmer/component` and `ember-modifier`. It also only supports usage of the standardized signature formats that have
been adopted in those upstream packages.

To migrate from previous Glint release to 0.8.0, you can first update to the most recent 0.7.x version of Glint and
follow the migration instructions for native signatures and imports below, either incrementally or all at once.

When you've finished your migration, you can update to Glint 0.8 and remove the
`import '@glint/environment-ember-loose/native-integration';` line from your project, leaving only
`import '@glint/environment-ember-loose';`.

{% hint style="warning" %}
Note: `@glint/environment-glimmerx` currently does not support native imports and has been held back temporarily from
release for version 0.8.0. Until a new release of GlimmerX is available, please remain on Glint 0.7 for projects using
GlimmerX.
{% endhint %}

## Native Signatures and Imports

This guide provides direction for migrating from custom Glint-specific import paths and signature formats to the
native imports and standardized signatures for `@ember/component`, `@glimmer/component` and `ember-modifier`.

Note that this guide applies to `@glint/environment-ember-loose`, but `@glint/environment-glimmerx` doesn't yet support
native imports, pending an upgrade of GlimmerX's own dependencies.

### Background

Prior to version `0.7.4`, Glint required users to import the factories and base classes for components, helpers and
modifiers from custom environment-specific paths. This was because the "native" versions of those entities couldn't
capture enough information for Glint to typecheck them in a template with reasonable fidelity.

Consider `@glimmer/component` as an example.

```typescript
import Component from '@glimmer/component';

export interface MyComponentArgs {
  message: string;
}

export default class MyComponent extends Component<MyComponentArgs> {
  // ...
}
```

Knowing only about the `MyComponent`'s expected `@arg` values, Glint couldn't provide any validation or assistance
for what blocks the component accepts, what parameters it yields to those blocks, or what kind of modifiers would
be valid to apply to it.

### Signatures

Ember RFC [#748](https://github.com/emberjs/rfcs/pull/748) formalized a notion of "component signatures" based on
exploratory work Glint had done to find ways of expression the type information that `Args` alone couldn't capture.

The `@glimmer/component` package, as well as `ember-modifier` and `@types/ember__component` have been updated based on
the results of that RFC, and starting with version `0.7.4` of Glint, users may opt into using the regular import paths
and standardized signature formats those packages have adopted.

### Opting into Native Integration

In order to opt into Glint's augmentation of the native component, modifier and helper imports, add the following import
somewhere in your project (likely below wherever you have `import '@glint/environment-ember-loose'`):

```typescript
import '@glint/environment-ember-loose/native-integration';
```

In version `0.8.0`, integration will be enabled by default and this extra import will be unnecessary.

### New Signature Formats

As you move each component, modifier and helper in your project from the `environment-ember-loose` import path to the
native one, you'll also need to update its signature to the standardized format. You can make this migration
incrementally or all at once, depending on the size of your project.

#### Components

For components, there are two key changes (see [the relevant section](https://github.com/dfreeman/ember-rfcs/blob/glimmer-component-signature/text/0748-glimmer-component-signature.md#invokablecomponentsignature) in the RFC):

- `Yields` has become `Blocks`. This key has a more complex notional desugaring, but the shorthand is compatible with
  how `Yields` worked before.
- `Args` and `PositionalArgs` have been merged into `Args: { Named: ...; Positional: ... }`. If your component only has
  named args (which is true for all Glimmer components and most Ember components), the wrapping layer can be skipped
  and you can continue to use `Args: MyNamedArgs` as before.

{% tabs %}
{% tab title="Glimmer Component Before" %}

```typescript
import Component from '@glint/environment-ember-loose/glimmer-component';

export interface MyComponentSignature {
  Args: { message: string };
  Yields: { default: [] };
  Element: HTMLDivElement;
}

export default class MyComponent extends Component<MyComponentSignature> {
  // ...
}
```

{% endtab %}
{% tab title="Glimmer Component After" %}

```typescript
import Component from '@glimmer/component';

export interface MyComponentSignature {
  Args: { message: string };
  Blocks: { default: [] };
  Element: HTMLDivElement;
}

export default class MyComponent extends Component<MyComponentSignature> {
  // ...
}
```

{% endtab %}
{% endtabs %}

Template only components should now be imported directly from `@ember/component/template-only` instead of from
`@glint/environment-ember-loose/ember-component/template-only`.

Note that for `EmberComponent` subclasses, there is no native `ArgsFor` equivalent, and the `ArgsFor` helper type will
be removed in Glint `0.8.0` along with the rest of the `@glint/envrionment-ember-loose/ember-component` module.

You can instead define your named args in a dedicated type declaration, or write a simple `ArgsFor` helper for your own
project if you wish.

{% tabs %}
{% tab title="Ember Component Before" %}

```typescript
import Component, { ArgsFor } from '@glint/environment-ember-loose/ember-component';

export interface MyComponentSignature {
  Args: { count?: number };
  PositionalArgs: [message: string];
}

export default interface MyComponent extends ArgsFor<MyComponentSignature> {}
export default class MyComponent extends Component<MyComponentSignature> {
  // ...
}
```

{% endtab %}
{% tab title="Ember Component After" %}

```typescript
import Component from '@ember/component';

export interface MyComponentNamedArgs {
  count?: number;
}

export interface MyComponentSignature {
  Args: {
    Named: MyComponentNamedArgs;
    Positional: [message: string];
  };
}

export default interface MyComponent extends MyComponentNamedArgs {}
export default class MyComponent extends Component<MyComponentSignature> {
  // ...
}
```

{% endtab %}
{% endtabs %}

#### Helpers

For helpers, `NamedArgs` and `PositionalArgs` have been merged into `Args: { Named: ...; Positional: ... }`, similar to
the change for components. Unlike components, however, since neither type of argument is privileged over the other in
the way helpers are defined today, there is no shorthand.

{% tabs %}
{% tab title="Helper Before" %}

```typescript
import Helper from '@glint/environment-ember-loose/ember-component/helper';

export interface MyHelperSignature {
  PositionalArgs: [message: string];
  NamedArgs: { count?: number };
  Return: Array<string>;
}

export default class MyHelper extends Helper<MyHelperSignature> {
  // ...
}
```

{% endtab %}
{% tab title="Helper After" %}

```typescript
import Helper from '@ember/component/helper';

export interface MyHelperSignature {
  Args: {
    Positional: [message: string];
    Named: { count?: number };
  };
  Return: Array<string>;
}

export default class MyHelper extends Helper<MyHelperSignature> {
  // ...
}
```

{% endtab %}
{% endtabs %}

#### Modifiers

Modifier signatures have undergone the same revision as helper signatures. `NamedArgs` and `PositionalArgs` have been
merged into `Args: { Named: ...; Positional: ... }`, and similarly there is no shorthand for modifiers that have only
named or only positional args.

{% tabs %}
{% tab title="Modifier Before" %}

```typescript
import Modifier from '@glint/environment-ember-loose/ember-modifier';

export interface MyModifierSignature {
  PositionalArgs: [message: string];
  NamedArgs: { count?: number };
  Element: HTMLCanvasElement;
}

export default class MyModifier extends Modifier<MyModifierSignature> {
  // ...
}
```

{% endtab %}
{% tab title="Modifier After" %}

```typescript
import Modifier from 'ember-modifier';

export interface MyModifierSignature {
  Args: {
    Positional: [message: string];
    Named: { count?: number };
  };
  Element: HTMLCanvasElement;
}

export default class MyModifier extends Modifier<MyModifierSignature> {
  // ...
}
```

{% endtab %}
{% endtabs %}

#### Yielded Components

The `@glint/environment-ember-loose` package provided utility types `ComponentLike` and `ComponentWithBoundArgs` for
describing the type of abstract component-like values, such as the result of invoking the `{{component ...}}` helper.

Now that signatures have been standardized, `ComponentLike` is now available directly from `@glint/template`, which is
a types-only package that underlies all Glint environments. You can also find `HelperLike` and `ModifierLike` types
there, along with a `WithBoundArgs` type that will work with any of the above, as well as component, helper and modifier
definitions.

{% tabs %}
{% tab title="Contextual Components Before" %}

```typescript
import { ComponentLike, ComponentWithBoundArgs } from '@glint/environment-ember-loose';
import MySpecialInput from '...';

export interface MyComponentSignature {
  Yields: {
    default: [
      {
        // A component that just accepts a `@name` arg
        Label: ComponentLike<{ Args: { name: string } }>;
        // `MySpecialInput`, but with `id` and `form` already bound
        Input: ComponentWithBoundArgs<typeof MySpecialInput, 'id' | 'form'>;
      }
    ];
  };
}
```

{% endtab %}
{% tab title="Contextual Components After" %}

```typescript
import { ComponentLike, WithBoundArgs } from '@glint/template';
import MySpecialInput from '...';

export interface MyComponentSignature {
  Blocks: {
    default: [
      {
        // A component that just accepts a `@name` arg
        Label: ComponentLike<{ Args: { name: string } }>;
        // `MySpecialInput`, but with `id` and `form` already bound
        Input: WithBoundArgs<typeof MySpecialInput, 'id' | 'form'>;
      }
    ];
  };
}
```

{% endtab %}
{% endtabs %}

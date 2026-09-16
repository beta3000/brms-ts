# brms-ts

[![npm version](https://img.shields.io/npm/v/brms-ts.svg?logo=npm&color=cb3837)](https://www.npmjs.com/package/brms-ts)
[![npm downloads](https://img.shields.io/npm/dm/brms-ts.svg?logo=npm&color=cb3837)](https://www.npmjs.com/package/brms-ts)
[![license](https://img.shields.io/npm/l/brms-ts.svg?color=blue)](LICENSE)
[![types](https://img.shields.io/npm/types/brms-ts.svg?logo=typescript)](https://www.npmjs.com/package/brms-ts)

A business rule management engine for TypeScript, inspired by Drools. Declarative
rules are written in JSON or YAML and executed by a forward-chaining inference
engine (RETE-style) with an incremental agenda, salience-based conflict
resolution, and `no-loop` control.

- **Declarative rules** in JSON or YAML, validated against a schema.
- **Rich conditions**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`,
  combined with `and` / `or` / `not`, plus custom predicates.
- **Actions**: insert, modify, and retract facts, or invoke registered functions.
- **Forward chaining**: actions change facts, which re-trigger rules incrementally.
- **Conflict resolution** by salience (highest first), tie-broken by rule order.
- **Safe by design**: rule data is interpreted, never `eval`-ed.
- **Typed, documented, and dual-published** (ESM + CommonJS) with generated docs.

## Installation

```bash
npm install brms-ts
```

The package ships as ESM and CommonJS with bundled type definitions.

## Quick start

```ts
import { RuleEngine } from 'brms-ts';

const engine = new RuleEngine();

// Register a custom function referenced by a rule action.
engine.registerFunction('approve', (facts) => {
  const id = facts[0]?.attributes['id'];
  console.log('approved', typeof id === 'string' ? id : '');
});

// Load rules from YAML (JSON is also accepted).
engine.loadRules(`
rules:
  - name: approve-adults
    salience: 10
    noLoop: true
    when:
      kind: comparison
      field: age
      operator: gte
      value: 18
    then:
      - { kind: invoke, function: approve }
`);

engine.insert({ type: 'Applicant', attributes: { id: 'a1', age: 20 } });
engine.fireAllRules();
```

## Rule format

A rules document is an object with a `rules` array. Each rule has a `name`, an
optional `salience` (default `0`) and `noLoop` flag (default `false`), a `when`
condition, and a `then` list of actions.

```yaml
rules:
  - name: vip-discount
    salience: 10 # higher fires first
    noLoop: true # do not re-activate from its own changes
    when:
      kind: and
      conditions:
        - { kind: comparison, field: amount, operator: gte, value: 100 }
        - { kind: predicate, predicate: isVip } # custom predicate
    then:
      - { kind: modify, target: 0, attributes: { discount: 0.2 } }
      - { kind: invoke, function: audit, args: ['discount-applied'] }
```

### Conditions (`when`)

| Kind         | Shape                              | Meaning                               |
| ------------ | ---------------------------------- | ------------------------------------- |
| `comparison` | `{ kind, field, operator, value }` | Compare a fact field against a value. |
| `predicate`  | `{ kind, predicate, args? }`       | Call a registered custom predicate.   |
| `and`        | `{ kind, conditions: [...] }`      | All sub-conditions must hold.         |
| `or`         | `{ kind, conditions: [...] }`      | At least one sub-condition must hold. |
| `not`        | `{ kind, condition }`              | The sub-condition must not hold.      |

Comparison operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in` (value is an
array), `contains` (string substring or array membership). Fields support dot
notation for nested attributes, e.g. `address.city`.

### Actions (`then`)

| Kind      | Shape                                  | Effect                                  |
| --------- | -------------------------------------- | --------------------------------------- |
| `insert`  | `{ kind, fact: { type, attributes } }` | Insert a new fact.                      |
| `modify`  | `{ kind, target: 0, attributes }`      | Merge attributes into the matched fact. |
| `retract` | `{ kind, target: 0 }`                  | Remove the matched fact.                |
| `invoke`  | `{ kind, function, args? }`            | Call a registered function.             |

`target: 0` refers to the fact that activated the rule.

## Programmatic API

```ts
const engine = new RuleEngine({ cycleLimit: 10_000 });

engine.registerPredicate('isVip', (fact) => fact.attributes['tier'] === 'gold');
engine.registerFunction('audit', (facts, args) => {
  /* side effect */
});

engine.loadRules(source); // string (YAML/JSON), parsed object, or typed Rule[]
const record = engine.insert({ type: 'Order', attributes: { amount: 150 } });
engine.modify(record.id, { amount: 200 });
engine.retract(record.id);

const fired = engine.fireAllRules(); // number of rules fired
const facts = engine.getFacts(); // current fact snapshot
```

Rules can also be built in code with typed factory helpers:

```ts
import { defineRule, and, compare, predicate } from 'brms-ts';

const rule = defineRule({
  name: 'vip-discount',
  salience: 10,
  noLoop: true,
  when: and(compare('amount', 'gte', 100), predicate('isVip')),
  then: [{ kind: 'modify', target: 0, attributes: { discount: 0.2 } }],
});
```

## Example

A runnable credit-approval example lives in the `examples/credit-approval`
directory of the repository. Run it with:

```bash
npm run example
```

It loads rules from `rules.yaml`, registers a custom predicate and functions,
evaluates several applications, and prints the resulting decisions.

## Design notes and limitations

- **Single-fact matching.** A rule's `when` is evaluated against one fact at a
  time; each match produces one activation bound to that fact. Cross-fact
  multi-pattern joins are intentionally out of scope for this version.
- **Termination.** `no-loop` prevents a rule from re-activating itself from its
  own changes, and a configurable `cycleLimit` aborts runaway inference with a
  `CycleLimitExceededError`.
- **Security.** Conditions and actions are interpreted from data. The engine
  never uses `eval` or `new Function`, and nested field access refuses
  prototype-polluting keys.

## Development

```bash
npm run verify      # lint + typecheck + test + build
npm test            # unit and integration tests with coverage thresholds
npm run lint        # ESLint (strict, type-checked, no `any`)
npm run format      # Prettier
npm run docs        # generate API docs with TypeDoc into ./docs
npm run check:pkg   # publint + are-the-types-wrong packaging checks
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and
are validated by commitlint via a Husky `commit-msg` hook.

## Releasing

Releases are automated with
[semantic-release](https://semantic-release.gitbook.io/) through the
`.github/workflows/ci.yml` GitHub Actions workflow. An `authorize` gate first
checks that the pull-request author has write/admin access, so external fork
PRs do not run CI unattended. The `quality` job then runs on every authorized
pull request and push to `main` (lint, typecheck, test, build, package
checks); the `release` job runs only on pushes to `main` after `quality`
passes, and publishes to npm (with provenance) and creates a GitHub Release.
Set an `NPM_TOKEN` repository secret (an npm automation token) to enable
publishing; `GITHUB_TOKEN` is provided automatically. Provenance requires the
repository to be public.

## License

[MIT](LICENSE)

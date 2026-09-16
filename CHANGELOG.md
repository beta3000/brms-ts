# 1.0.0 (2026-09-16)


### Bug Fixes

* **ci:** disable husky hooks during automated release ([5448bf4](https://github.com/beta3000/brms-ts/commit/5448bf4ea1ba0b9ab94da789ee7b0dfbfcb58cf7))
* **ci:** let semantic-release manage npm auth ([d1c5232](https://github.com/beta3000/brms-ts/commit/d1c5232d9bd9cdfbdb1f186207e55bbd12ef7a65))
* **ci:** regenerate lockfile so npm ci stays in sync ([208a9c9](https://github.com/beta3000/brms-ts/commit/208a9c965697f66fa0935458857a214dc44e75dd))
* **ci:** use Node 22 and pin npm 11 for lockfile parity ([e25a204](https://github.com/beta3000/brms-ts/commit/e25a204a5cf097b3d171b53c98ed027180fb9734))


### Features

* **engine:** add agenda with salience conflict resolution ([8df0892](https://github.com/beta3000/brms-ts/commit/8df0892b181d69de9bfdf30fdd2b3509b3e19fea))
* **engine:** add condition evaluator and function registry ([6f79522](https://github.com/beta3000/brms-ts/commit/6f7952299a6ca22a7948984c8bd0171a9e21ad79))
* **engine:** add executor and forward-chaining network ([42efd97](https://github.com/beta3000/brms-ts/commit/42efd97aaaea23958fa2728f04423d65a6a02713))
* **engine:** add public RuleEngine facade ([f528caa](https://github.com/beta3000/brms-ts/commit/f528caafbc0ca3ee19b37b59d0e095d35ab00104))
* **engine:** add RETE alpha nodes and alpha memories ([45d4a32](https://github.com/beta3000/brms-ts/commit/45d4a326a4a1a2da1497675557c8afde795ba005))
* **engine:** add RETE terminal rule nodes and activations ([b2df096](https://github.com/beta3000/brms-ts/commit/b2df09670afc343d7313bec299efd9602f9dc1ea))
* **engine:** add working memory with change notifications ([947965e](https://github.com/beta3000/brms-ts/commit/947965ec87109137760c86548fa9a9f25ea39164))
* **loader:** load and validate rules from JSON/YAML ([d81c126](https://github.com/beta3000/brms-ts/commit/d81c126373925241801d14d81ac0ffbcfd1c32cb))
* **model:** add typed domain model for rules, conditions, actions, facts ([36e74ff](https://github.com/beta3000/brms-ts/commit/36e74fff6eedcddf5729daa8134553ac66ce03c0))

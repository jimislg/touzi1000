# Shared decision calculation contract

All functions are pure. No migration, automatic approval, config write or order submission is performed. Existing execution-price tiers remain historical instructions; they never imply annual returns. Display values use CNY yuan; all new control inputs ending `CNYFen` are nonnegative safe integer cents. New relative weights ending `Bps` are integer basis points (10000 = 100%).

`decisionBudget(cfg, quotes, code, {now})` accepts a trusted millisecond clock only. It returns `approvedCNY`, `approvedCNYFen`, `blockers: string[]`, `checks`, `status: approved|blocked`, `seatKey`, `seatName`, `planningCapital`, `issuerValueCNY`, `seatValueCNY`, `seatBudgetCNY`, `seatRoomCNY`, `researchRoomCNY`, `quoteTime`, `policyVersion`, and `dataRevision`. It is a read-only ceiling, never a broker order approval. Client overrides of amounts, checks or eligibility are ignored.

## Independent evidence records

Each universe company may carry:

```js
research: {status:'done', version:'r1', source:'research/evidence-ref', asOf:'2026-10-24'}
audit: {status:'passed', version:'a1', researchVersion:'r1', source:'audit/evidence-ref', asOf:'2026-10-24'}
executionPolicy: {
  status:'approved', version:'p1', seatKey:'seat1',
  denominator:'planningCapital', planningCapitalCNYFen:1000000000,
  validFrom:'2026-10-24T00:00:00+08:00', validUntil:'2026-10-25T00:00:00+08:00',
  issuerMaxCNYFen:100000000, feeReserveCNYFen:10000,
  quoteMaxAgeMs:900000,
  tranches:[{id:'first',price:100,cumulativeCostCNYFen:50000000}]
}
executionApproval: {
  status:'approved', policyVersion:'p1', researchVersion:'r1', auditVersion:'a1',
  dataRevision:'ledger-data-1', source:'signed-policy-ref',
  approvedAt:'2026-10-24T00:00:00+08:00', validUntil:'2026-10-25T00:00:00+08:00'
}
```

Quality A/B is a separate gate. Missing research/audit evidence never follows from a grade or `plan` text. A complete research record requires a dated version and source. An audit references that exact research version; an execution approval references policy, research, audit and ledger data versions. The policy controls one issuer across A/H and must fit the whole shared seat. Tranches descend in security-native price, have unique action IDs and monotonically increasing integer cumulative CNY cost. Legacy `tierPct` is never promoted into this execution policy.

`cfg.decisionDataRevision` identifies the verified input dataset. Approval and ledger reference it. This avoids a self-referential hash: a record cannot refer to the hash of a config that already contains that same record. HTTP preview separately requires the current `_revision` to protect against concurrent config changes. `decisionDataRevision` and all approval/ledger/evidence fields must not be writable by the ordinary UI patch endpoint.

## Reconciled ledger

```js
budgetLedger: {
  status:'reconciled', dataRevision:'ledger-data-1', source:'broker-reconciliation-ref',
  asOf:'2026-10-24T09:59:00+08:00',
  openingVerified:true, positionsVerified:true, cashFlowsVerified:true, cashVerified:true,
  cashAvailableCNYFen:800000000, reservedCashCNYFen:0,
  sellReleaseRule:'no-release', // or 'reconciled-ledger'
  positions:[{code:'X.SH', shares:1000}],
  issuers:{'X.SH':{netInvestedCNYFen:10000000, reservedCNYFen:0}},
  seats:{seat1:{netInvestedCNYFen:10000000, reservedCNYFen:0}}
}
```

Positions must exactly match all current config positions (including zero/empty states); cash is matched to config cash to the cent. All seat and issuer consumed/reserved totals must reconcile and include every holding; the entire ledger is validated, not just the target row. Cumulative net investment uses the explicit sell-release policy; an average native share cost is not a substitute. HK historical settled cost requires holding `costBasisStatus:'verified'`, `settledCostCNYFen` and `costBasisSource`; otherwise monetary actual P/L and approval remain unavailable. Missing data returns null or blockers. It does not invent zero historical cost.

Approval is the minimum of the entered tranche's cost room, whole-seat cost room, issuer cost/risk room, whole-seat mark-to-market risk room, issuer mark-to-market risk room, and verified unreserved cash less fee reserve. Existing reservations are deducted at issuer, seat and cash levels. Each preview shares the same ledger; reservation creation is outside this read-only API.

Quotes require finite positive prices and a 14-digit Beijing exchange timestamp. Snapshot, absent/invalid time, future beyond 60 seconds, or age beyond the policy horizon blocks approval; this includes HKD/CNY for HK securities. No fallback quote or fallback FX can approve execution.

## Other interfaces

- `planningCapital(cfg)`: positive finite configured target capital or null; never current NAV.
- `positionLimit(cfg,code)`: `{pct,source,needsReview}`. Explicit `riskMaxPct` first, legitimate customized cumulative tier cap bounded by its seat second, legacy grade references last. Default 100% progress is never an issuer cap.
- `holdingValue(h,quote,fx)`: `mvCNY`; `costCNY/pl/plPct` are null for HK without verified historical CNY cost. `costAtSpotCNY/nativePl/nativePlPct` remain separate references. `costBasisStatus/costBasisNote` explain readiness.
- `taxRateOf(h,now)`: `{r,tag,basis,verified,needsReview}`. Existing buyDate is an estimate, not batch reconciliation or legal tax determination. Invalid/missing dates produce `r:null` for A shares. An explicit evidenced `dividendTaxRate` may override.
- `researchState(u)`: `{status,complete,auditStatus,auditPassed,grade,version,source,blockers}`.
- `tradeActivity(cfg,code,now)`: facts from recent issuer trades; only explicitly matched action execution records may identify fully completed actions. Unlinked or duplicate candidates stay visible. No automatic deletion or action completion from a trade's mere existence.
- `ledgerSummary(cfg)`: completion flags and missing proof/opening/positions/cash-flow information. Unverified historical performance remains null.
- `dividendSummary(cfg,quotes,{scope,now,gross})`: ordinary cash dividend coverage and missing names; a partial sum is `knownDividend`, never an unconditional complete dividend. Cash interest is separate. Seat equal split is explicitly a research assumption.
- `priceAt/irrOf`: EPS_n terminal only; invalid inputs or no finite bracket return null.
- `modelReturn(u,price,now)`: only an independently audited `cashflowModel` (version/researchVersion/auditVersion/source/asOf plus eps/growth/payout/tax/exitPE/years) supports modeled return. `tiers` do not.
- `irrAt(price, prices, rates)`: approximate interpolation only when explicit rates are supplied; two-argument historical tier calls return null.

This schema permits positive approval from reconciled fixtures. Current legacy production records do not meet it and must show the concrete missing evidence rather than an approval.

## Save provenance and invalidation

`POST /api/config` accepts only explicit ordinary edits: cash inputs, contribution assumption, holding shares/cost/buyDate/DPS/manual mode, universe buyPrice/plan/bizTag, and historical signal dismissals. It rejects targetCapital, seats, grades, evidence, decisionDataRevision, ledger and approvals, including nested row injection. `null` DPS is unknown; zero is an explicit zero. Restoring auto only releases the manual override; a client cannot claim a new automatic value.

Material accepted changes add `decisionInputsChanged:{at,fields,reason}`. All subsequent previews block until a controlled reconciliation updates the evidence/data version and clears this marker. Merely saving again or editing historical plan text cannot grant approval. Editing shares or cost also invalidates historical settled-CNY-cost proof. `changeHistory` stores at most the latest100 edits with base revision and changed-field before/after values; it is ordinary edit provenance, not an immutable journal or broker ledger. These are additive metadata changes to future saves; this delivery does not migrate the real config.

`sourceMode:'local'` never touches the cloud and reports `_sourceMode:'local',_syncStatus:'local'`; existing cloud pending files survive reads, block local saves, and are reported `local-pending-review`. Cloud mode retains CAS. Save receipts include serverSavedAt, sourceMode, revision, dataRevision and changedFields. The web requires a matching server readback before clearing its draft. A missing response remains an unverified outcome and is never retried automatically.

Unknown issuer/seat valuation returns null space, not a full unused budget. Unsafe integer amounts, overflow, fractional share counts, future evidence dates, unknown quote time and dated-FX gaps fail closed. Explicit riskMaxPct also bounds a policy issuer maximum. A/H issuer mapping applies to both issuer and full-seat valuation; cross-listing holdings cannot evade either cap.

## 2026-10-24 只读研究补充

`researchSummary(company,cfg)`可读取`cfg._researchSupplement`展示最新公开研究。`researchState`的正式研究/审计逻辑不由此自动通过。该字段不属于账户版本，不由保存接口接收或持久化。

服务端为`/api/config`与decision-preview注入同一代码版本的可信研究包。已覆盖证券要求`audit.researchSupplementVersion`和`executionApproval.researchSupplementVersion`同时等于当前包version，否则阻断。新研究不会偷偷放行旧审批；确认版本不能替代政策、对账及行情门槛。不可用的研究包也阻断预览确认。预览回执携带`researchSupplementVersion`。

研究版本包含全部公司证据JSON与正文的SHA-256摘要；正文、来源或估值假设改变即产生新版本，原审计/批准对旧版本的确认失效。生成过程使用公共输入，可离线重复。

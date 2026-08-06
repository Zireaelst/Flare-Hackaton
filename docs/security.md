# Security model

What Tempo protects, and — more usefully — what it does not.

## The three properties everything rests on

**The keeper supplies nothing but an order id.** `execute` takes no price, no timestamp, no
proof. Every condition is re-derived inside the contract from FTSO and `block.timestamp`. A
lying or absent keeper can make an order *late*; it cannot make one *wrong*. This is why
execution can safely be permissionless.

**Orders are backed by an allowance, not a deposit.** Funds stay in the user's PersonalAccount
between executions. Tempo holds no balance for anyone to grief or drain, cancelling costs
nothing, and a bug in Tempo cannot reach money it was never given.

**The adapters are immutable.** They are constructor arguments, not settable state. Not even
the deployer can repoint where a live order's funds go. The cost is that adding an action means
a new deployment, which orphans existing orders — accepted deliberately.

## Invariants with tests behind them

| Invariant | Test |
|---|---|
| A trigger that is not satisfied cannot be forced | `test_takeProfitRevertsBelowTarget`, `test_stopLossRevertsAboveTarget` |
| Total pulled never exceeds `amountPerSlice × slices` | `test_totalPulledIsCapped` |
| One execution per slice window | `test_cannotExecuteTwiceInSameWindow` |
| After expiry, execution always reverts | `test_expiredOrderNeverExecutes` |
| Only the owner may cancel | `test_onlyOwnerCancels` |
| A stale feed reverts rather than executing | `test_stalePriceReverts` |
| Tempo keeps nothing an adapter did not consume | `test_unspentAmountGoesBackToTheOwner` |
| A stray balance is not mistaken for a user's money | `test_straySurplusIsNotTreatedAsTheUsersMoney` |

Every test drives `execute` from an address that is not the order owner, because that is the
real threat model.

## Residual risks

These are accepted, not solved. A reader deciding whether to trust this should start here.

### Swaps can be sandwiched, up to the slippage bound

`SwapAdapter` derives its minimum output from FTSO rather than from the caller, which stops a
keeper handing the trade away outright. It does not stop an attacker moving the pool inside the
allowed band: with `maxSlippageBips = 200`, up to 2% minus pool fees is extractable by
sandwiching a large execution. Tightening the band trades this against swaps that fail to
execute at all during genuine volatility — which, for a stop-loss, is the worse failure.

### `WHOLE_BALANCE` means everything, including what arrives later

An exit written as "everything" takes the entire balance of that token at the moment it fires,
not the balance that existed when it was written. If a user deposits far more into the same
vault afterwards, the same exit unwinds all of it. This is what makes the plan-and-exit flow
possible at all — the shares do not exist yet when the order is written — but it is a standing
authorization over a quantity the user has not seen.

### The vault-share approval is unlimited

For the same reason. The FXRP approval is deliberately exact (`amountPerSlice × slices`); the
share approval cannot be, because the shares do not exist yet and their count moves with yield.
The allowance is only reachable through an order the user themselves created, and only once its
trigger is satisfied on-chain — but it is unlimited.

### Permissionless is a property, not a market

Anyone *may* execute a due order. Nobody is *paid* to. There is no execution fee and no
keeper reward, so in practice only the operator's keeper runs, and an order's punctuality
depends on that process. The safety argument does not depend on the keeper; the liveness
argument does.

### `RedeemAdapter` is the redeemer of record

`redeemAmount` records `msg.sender` as the redeemer, so if a FAssets agent defaults on the
underlying payment, the default claim accrues to the adapter rather than to the user.
Out of scope for v1: handling it needs an FDC non-payment proof and per-request accounting.

### The keeper reads what is due once per run

`dueOrders` is evaluated at the start of a run, so an order that only becomes
executable *because of* an earlier order in the same run is picked up on the
next one. Observed: an exit sized at `WHOLE_BALANCE` is not due while the vault
position is empty, and becomes due the moment the plan's first slice lands. This
costs punctuality, never correctness, and re-reading between every execution
would multiply the scan cost by the number of due orders.

### `dueOrders` is O(n)

The keeper's scan reads every order and its executability. This is deliberate — it means no
indexer and no privileged view of the order book — but it does not scale indefinitely, and the
keeper caps the scan at 100 orders.

### The demo is open by design

`/api/orders` is unauthenticated, so anyone with the URL can spend the demo XRPL wallet's
testnet XRP and the relayer's C2FLR. Order size is capped server-side but not rate-limited.
Both wallets are testnet-only and refillable from public faucets. This is a trade for a
frictionless judge experience, and it would not survive contact with mainnet.

### The relayer holds a hot key

One key pays for FDC attestations, direct minting and keeper executions. It has no authority
over user funds — it cannot create, cancel or redirect an order — but its compromise stops the
service and drains its own gas balance.

## Deliberately absent

**`0xE2` (replace executor fee).** Its byte layout is not published anywhere we could verify
against. Guessing the layout of a memo that moves money is how funds get stranded rather than
recovered.

**A perp adapter.** SparkDEX Eternal charges a 2 FLR execution fee per order, payable as
`msg.value` — the one thing Tempo's users are defined by not having. Adding it is not an
adapter but a fee-funding design.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RelayJob } from "@/lib/relayer/types";
import { RELAY_STEPS, STATUS_LABEL } from "@/lib/relayer/types";
import type { OrderView } from "@/lib/tempo/read";
import {
  ACTION_LABEL,
  WHOLE_BALANCE_STR,
  EXPLORER,
  ORDER_KIND_LABEL,
  VAULTS,
  XRPL_EXPLORER,
  formatCountdown,
  formatFxrp,
  formatInterval,
  formatUsd,
  shortAddress,
} from "@/lib/tempo/constants";

type ChainState = {
  orders: OrderView[];
  price: { price: number; timestamp: number };
  fxrpBalance: string;
  demoXrplAddress: string;
  personalAccount: string;
  tempoAddress: string;
};

type Form = {
  kind: "SCHEDULE" | "TAKE_PROFIT" | "STOP_LOSS";
  action: "VAULT_DEPOSIT" | "REDEEM_TO_XRPL";
  vault: string;
  amountPerSlice: number;
  slices: number;
  intervalSeconds: number;
  priceTarget: number;
  exitBelow: number;
  protect: boolean;
  stopPlanOnExit: boolean;
};

export function DemoConsole() {
  const [state, setState] = useState<ChainState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [job, setJob] = useState<RelayJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [keeperRunning, setKeeperRunning] = useState(false);
  const [keeperResult, setKeeperResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ xrplTxHash: string; paymentAmountXrp: number } | null>(null);

  const [form, setForm] = useState<Form>({
    kind: "SCHEDULE",
    action: "VAULT_DEPOSIT",
    vault: VAULTS[0].address,
    amountPerSlice: 5,
    slices: 2,
    intervalSeconds: 60,
    priceTarget: 1,
    exitBelow: 0.9,
    protect: true,
    stopPlanOnExit: true,
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (data.error) {
        setStateError(data.error);
        return;
      }
      setStateError(null);
      setState(data);
    } catch (error) {
      setStateError(error instanceof Error ? error.message : "Could not reach the chain");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Drive the relay forward. Each poll advances at most one step server-side,
  // so progress is visible rather than a single long spinner.
  const jobRef = useRef<RelayJob | null>(null);
  jobRef.current = job;

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;

    let cancelled = false;
    const tick = async () => {
      const current = jobRef.current;
      if (!current || cancelled) return;
      try {
        const response = await fetch("/api/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(current),
        });
        const next = await response.json();
        if (cancelled) return;
        if (next.error) {
          setJob({ ...current, status: "failed", message: "Relay failed", error: next.error });
          return;
        }
        setJob(next);
        if (next.status === "done") void refresh();
      } catch {
        // A transient network blip should not kill the relay; the next tick retries.
      }
    };

    const timer = setInterval(() => void tick(), 6_000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job?.status, refresh, job]);

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    setJob(null);
    setReceipt(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          expiryDays: 30,
          // Only a vault plan has something to unwind.
          exitBelow:
            form.protect && form.action === "VAULT_DEPOSIT" ? form.exitBelow : undefined,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setFormError(data.error);
        return;
      }
      setJob(data.job);
      setReceipt({ xrplTxHash: data.job.xrplTxHash, paymentAmountXrp: data.paymentAmountXrp });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create the order");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(orderId: string) {
    setJob(null);
    setReceipt(null);
    try {
      const response = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await response.json();
      if (data.error) {
        setFormError(data.error);
        return;
      }
      // Cancelling is another XRPL payment, so it runs through the same relay.
      setJob(data.job);
      setReceipt({ xrplTxHash: data.job.xrplTxHash, paymentAmountXrp: data.paymentAmountXrp });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not cancel the order");
    }
  }

  async function runKeeper() {
    setKeeperRunning(true);
    setKeeperResult(null);
    try {
      const response = await fetch("/api/keeper", { method: "POST" });
      const data = await response.json();
      if (data.error) {
        setKeeperResult(data.error);
      } else if (data.executed?.length) {
        setKeeperResult(`Executed ${data.executed.length} order(s).`);
      } else if (data.due?.length) {
        setKeeperResult(`${data.due.length} due, but execution failed. ${data.failed?.[0]?.error ?? ""}`);
      } else {
        setKeeperResult("Nothing is due right now.");
      }
      await refresh();
    } catch (error) {
      setKeeperResult(error instanceof Error ? error.message : "Keeper failed");
    } finally {
      setKeeperRunning(false);
    }
  }

  const total = form.amountPerSlice * form.slices;
  const priceAge = state ? Math.floor(Date.now() / 1000) - state.price.timestamp : 0;

  return (
    <div className="space-y-6">
      {/* Chain strip */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        <Stat
          label="XRP / USD"
          value={state ? `$${state.price.price.toFixed(4)}` : "—"}
          hint={state ? `FTSO, ${Math.max(priceAge, 0)}s ago` : "reading FTSO"}
        />
        <Stat
          label="Personal account FXRP"
          value={state ? formatFxrp(state.fxrpBalance) : "—"}
          hint={state ? shortAddress(state.personalAccount, 8) : "—"}
        />
        <Stat
          label="Orders on chain"
          value={state ? String(state.orders.length) : "—"}
          hint={state ? shortAddress(state.tempoAddress, 8) : "—"}
        />
      </div>

      {stateError && (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-accent">{stateError}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Compose */}
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-lg font-medium">Compose an order</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            This becomes one XRPL payment. The demo signs it with its own testnet wallet — a real
            user would sign it in their own.
          </p>

          <div className="mt-6 space-y-5">
            <Field label="Trigger">
              <Segmented
                options={[
                  { value: "SCHEDULE", label: "Schedule" },
                  { value: "TAKE_PROFIT", label: "Take profit" },
                  { value: "STOP_LOSS", label: "Stop loss" },
                ]}
                value={form.kind}
                onChange={(kind) => setForm({ ...form, kind: kind as Form["kind"] })}
              />
            </Field>

            <Field label="Action">
              <Segmented
                options={[
                  { value: "VAULT_DEPOSIT", label: "Vault deposit" },
                  { value: "REDEEM_TO_XRPL", label: "Redeem to XRPL" },
                ]}
                value={form.action}
                onChange={(action) => setForm({ ...form, action: action as Form["action"] })}
              />
            </Field>

            {form.action === "VAULT_DEPOSIT" && (
              <Field label="Vault">
                <select
                  value={form.vault}
                  onChange={(event) => setForm({ ...form, vault: event.target.value })}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {VAULTS.map((vault) => (
                    <option key={vault.address} value={vault.address}>
                      {vault.symbol} — {shortAddress(vault.address)}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {form.kind !== "SCHEDULE" && (
              <Field label={`Price target (USD)${state ? ` — now $${state.price.price.toFixed(4)}` : ""}`}>
                <NumberInput
                  value={form.priceTarget}
                  step={0.01}
                  onChange={(priceTarget) => setForm({ ...form, priceTarget })}
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="FXRP per slice">
                <NumberInput
                  value={form.amountPerSlice}
                  step={1}
                  onChange={(amountPerSlice) => setForm({ ...form, amountPerSlice })}
                />
              </Field>
              <Field label="Slices">
                <NumberInput
                  value={form.slices}
                  step={1}
                  onChange={(slices) => setForm({ ...form, slices })}
                />
              </Field>
            </div>

            {form.slices > 1 && (
              <Field label="Interval">
                <select
                  value={form.intervalSeconds}
                  onChange={(event) => setForm({ ...form, intervalSeconds: Number(event.target.value) })}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value={60}>every minute (demo)</option>
                  <option value={3600}>every hour</option>
                  <option value={86400}>every day</option>
                  <option value={604800}>every week</option>
                </select>
              </Field>
            )}

            {form.action === "VAULT_DEPOSIT" && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.protect}
                    onChange={(event) => setForm({ ...form, protect: event.target.checked })}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <span className="text-xs leading-relaxed">
                    <span className="font-medium">Protect it with an exit</span>
                    <span className="mt-1 block text-muted">
                      Pull the whole position out of the vault if XRP falls this far. Set up in the
                      same payment, before a single share exists.
                    </span>
                  </span>
                </label>
                {form.protect && (
                  <>
                    <div className="mt-3">
                      <NumberInput
                        value={form.exitBelow}
                        step={0.01}
                        onChange={(exitBelow) => setForm({ ...form, exitBelow })}
                      />
                    </div>
                    <label className="mt-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={form.stopPlanOnExit}
                        onChange={(event) =>
                          setForm({ ...form, stopPlanOnExit: event.target.checked })
                        }
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <span className="text-[11px] leading-relaxed text-muted">
                        Stop the schedule too when the exit fires. Without this it keeps buying
                        into the fall right after pulling you out.
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-muted">
              One payment mints{" "}
              <span className="font-mono text-foreground">{total} FXRP</span> and approves Tempo for
              exactly that much — never more.
              {form.action === "REDEEM_TO_XRPL" && form.amountPerSlice < 5 && (
                <span className="mt-2 block text-accent">
                  FAssets will not redeem less than 5 FXRP per slice.
                </span>
              )}
            </div>

            {formError && <p className="text-sm text-accent">{formError}</p>}

            <button
              onClick={() => void submit()}
              disabled={submitting || (!!job && job.status !== "done" && job.status !== "failed")}
              className="w-full rounded-full bg-accent py-3 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Sending the XRP payment…" : "Send one XRP payment"}
            </button>
          </div>
        </section>

        {/* Relay + orders */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Relay</h2>
              {receipt && (
                <a
                  href={`${XRPL_EXPLORER}/transactions/${receipt.xrplTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-muted transition-colors hover:text-foreground"
                >
                  {receipt.paymentAmountXrp} XRP · {shortAddress(receipt.xrplTxHash)}
                </a>
              )}
            </div>

            {!job ? (
              <p className="mt-4 text-sm text-muted">
                Nothing in flight. Compose an order to watch the pipeline run.
              </p>
            ) : (
              <Timeline job={job} />
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">Standing orders</h2>
                <p className="mt-1 text-xs text-muted">
                  Execution is permissionless — this button is a convenience, not an authority.
                </p>
              </div>
              <button
                onClick={() => void runKeeper()}
                disabled={keeperRunning}
                className="rounded-full border border-line bg-surface-2 px-4 py-2 text-xs font-medium transition-colors hover:border-muted disabled:opacity-40"
              >
                {keeperRunning ? "Running…" : "Run keeper"}
              </button>
            </div>

            {keeperResult && <p className="mt-3 text-xs text-muted">{keeperResult}</p>}

            <div className="mt-5 space-y-3">
              {!state?.orders.length && (
                <p className="text-sm text-muted">No orders yet.</p>
              )}
              {state?.orders.map((order) => (
                <OrderRow key={order.id} order={order} onCancel={() => void cancel(order.id)} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Timeline({ job }: { job: RelayJob }) {
  const failed = job.status === "failed";
  // Recovery and rate-limit waits are detours off the happy path rather than
  // steps on it, so the spine stays fixed and the detour is shown beside it.
  const detour = job.status === "recovering" || job.status === "retrying" || job.status === "delayed";
  const currentIndex = detour ? RELAY_STEPS.indexOf("executing") : RELAY_STEPS.indexOf(job.status);

  return (
    <div className="mt-5 space-y-1">
      {RELAY_STEPS.map((status, index) => {
        const done = !failed && currentIndex > index;
        const active = !failed && currentIndex === index;

        return (
          <div key={status} className="flex items-start gap-3 py-1.5">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                done
                  ? "bg-positive"
                  : active
                    ? "bg-accent pulsing"
                    : "border border-line bg-transparent"
              }`}
            />
            <div className="min-w-0">
              <p className={`text-sm ${done || active ? "text-foreground" : "text-muted"}`}>
                {STATUS_LABEL[status]}
              </p>
              {active && !detour && <p className="mt-0.5 text-xs text-muted">{job.message}</p>}
            </div>
          </div>
        );
      })}

      {detour && (
        <div className="mt-3 rounded-xl border border-line bg-accent-soft p-4">
          <p className="text-sm font-medium text-accent">{STATUS_LABEL[job.status]}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{job.message}</p>
          {job.recovery && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Something went wrong with the mint, so Tempo is fixing it for you. Your XRP is safe
              at the vault the whole time — no action needed, and please do not send another
              payment.
            </p>
          )}
          {job.recovery?.flareTxHash && (
            <a
              href={`${EXPLORER}/tx/${job.recovery.flareTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-mono text-[11px] text-muted transition-colors hover:text-foreground"
            >
              recovery tx {shortAddress(job.recovery.flareTxHash)} ↗
            </a>
          )}
        </div>
      )}

      {failed && (
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-sm text-accent">{job.message}</p>
          {job.error && <p className="mt-1 break-words text-xs text-muted">{job.error}</p>}
        </div>
      )}

      {job.flareTxHash && (
        <a
          href={`${EXPLORER}/tx/${job.flareTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block font-mono text-xs text-muted transition-colors hover:text-foreground"
        >
          Flare tx {shortAddress(job.flareTxHash)} ↗
        </a>
      )}
    </div>
  );
}

function OrderRow({ order, onCancel }: { order: OrderView; onCancel: () => void }) {
  const complete = order.slicesExecuted >= order.slices;
  const cancellable = !order.cancelled && !complete;

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">#{order.id}</span>
          <span className="text-sm font-medium">{ORDER_KIND_LABEL[order.kind]}</span>
          <span className="text-xs text-muted">→ {ACTION_LABEL[order.action]}</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] ${
            order.cancelled
              ? "bg-surface text-muted"
              : order.executable
                ? "bg-accent-soft text-accent"
                : "bg-surface text-muted"
          }`}
        >
          {order.cancelled ? "cancelled" : order.executable ? "ready" : order.reason}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <Cell
          label={order.action === 2 ? "Exits" : "Per slice"}
          value={
            order.amountPerSlice === WHOLE_BALANCE_STR
              ? "everything"
              : `${formatFxrp(order.amountPerSlice)} FXRP`
          }
        />
        <Cell label="Progress" value={`${order.slicesExecuted}/${order.slices}`} />
        {order.kind === 0 ? (
          <Cell label="Interval" value={formatInterval(order.intervalSeconds)} />
        ) : (
          <Cell label="Target" value={formatUsd(order.priceTarget)} />
        )}
        <Cell
          label="Next"
          value={complete || order.cancelled ? "—" : formatCountdown(order.nextExecutionAt)}
        />
      </div>

      {cancellable && (
        <button
          onClick={onCancel}
          className="mt-3 text-[11px] text-muted underline underline-offset-2 transition-colors hover:text-accent"
        >
          Cancel — sends one XRPL payment, moves no funds
        </button>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="mt-0.5 font-mono">{value}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-surface p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 font-mono text-[11px] text-muted">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  step,
  onChange,
}: {
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={0}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
    />
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
            value === option.value ? "bg-accent text-black" : "text-muted hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

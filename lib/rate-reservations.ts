import { GameError } from "./engine";

type Reserve = (
  key: string,
  amount: number,
  maximum: number,
) => Promise<number>;
type Allowance = {
  remaining: number;
  expires: number;
  denied: boolean;
  pending?: Promise<void>;
};
const limited = () =>
  new GameError("Too many requests. Wait a minute and try again.", 429);

// Redis books every slot before it is used. Losing an instance or evicting an
// allowance can waste booked slots, but never grants extra requests. No game
// data or client-provided proof is held in this process-local optimization.
export class ReservationLimiter {
  private allowances = new Map<string, Allowance>();

  constructor(
    private reserve: Reserve,
    private clock: () => number = () => Date.now(),
    private capacity = 2048,
  ) {}

  private async allocate(key: string, amount: number, maximum: number) {
    const granted = await this.reserve(key, amount, maximum);
    if (!Number.isInteger(granted) || granted < 0 || granted > amount)
      throw new GameError("Request limiter is unavailable. Please retry.", 503);
    return granted;
  }

  async prefetch(identity: string, bucket: string, maximum: number) {
    const minute = Math.floor(this.clock() / 60000);
    const key = `rally:rate:${identity}:${bucket}:${minute}`;
    const entry = this.allowances.get(`${key}:${maximum}`);
    // Only top up an existing low allowance. Background work cannot create an
    // identity, spend a slot, bypass a denial, or renew an expired minute.
    if (
      !entry ||
      entry.remaining > 1 ||
      entry.denied ||
      entry.pending ||
      entry.expires <= this.clock()
    )
      return;
    entry.pending = this.allocate(key, 4, maximum)
      .then((granted) => {
        entry.remaining += granted;
        entry.denied = granted === 0;
      })
      .finally(() => {
        entry.pending = undefined;
      });
    await entry.pending;
  }

  async take(identity: string, bucket: string, maximum: number) {
    for (;;) {
      const minute = Math.floor(this.clock() / 60000),
        key = `rally:rate:${identity}:${bucket}:${minute}`,
        localKey = `${key}:${maximum}`,
        expires = (minute + 1) * 60000;
      let allowance = this.allowances.get(localKey);
      if (allowance?.remaining) {
        allowance.remaining--;
        return;
      }
      if (allowance?.denied) throw limited();
      if (!allowance) {
        if (this.allowances.size >= this.capacity) {
          for (const [k, entry] of this.allowances)
            if (entry.expires <= this.clock()) this.allowances.delete(k);
          if (this.allowances.size >= this.capacity) {
            const disposable = [...this.allowances].find(
              ([, entry]) => !entry.pending,
            );
            if (disposable) this.allowances.delete(disposable[0]);
            else {
              // Never evict work another request is awaiting. Under pressure,
              // book just this request directly instead of churning leases.
              const granted = await this.allocate(key, 1, maximum);
              if (Math.floor(this.clock() / 60000) !== minute) continue;
              if (!granted) throw limited();
              return;
            }
          }
        }
        allowance = { remaining: 0, expires, denied: false };
        this.allowances.set(localKey, allowance);
      }
      if (!allowance.pending) {
        const entry = allowance;
        entry.pending = this.allocate(key, 4, maximum)
          .then((granted) => {
            entry.remaining = granted;
            entry.denied = granted === 0;
          })
          .finally(() => {
            entry.pending = undefined;
          });
      }
      await allowance.pending;
      // Recompute the window after I/O. Slots booked just before midnight's
      // minute boundary must never be spent in the following minute.
      if (Math.floor(this.clock() / 60000) !== minute) continue;
      // The cache may have evicted this completed entry while it was waking
      // its callers. Its already-booked slots still belong to those callers.
      if (allowance.remaining) {
        allowance.remaining--;
        return;
      }
      if (allowance.denied) throw limited();
    }
  }
}

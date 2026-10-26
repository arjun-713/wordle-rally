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
          if (this.allowances.size >= this.capacity)
            this.allowances.delete(this.allowances.keys().next().value!);
        }
        allowance = { remaining: 0, expires, denied: false };
        this.allowances.set(localKey, allowance);
      }
      if (!allowance.pending) {
        const entry = allowance;
        entry.pending = this.reserve(key, 4, maximum)
          .then((granted) => {
            if (!Number.isInteger(granted) || granted < 0 || granted > 4)
              throw new GameError(
                "Request limiter is unavailable. Please retry.",
                503,
              );
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
    }
  }
}

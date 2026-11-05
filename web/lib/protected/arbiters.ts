import { Keypair } from "@stellar/stellar-sdk";
import type { DemoArbiter } from "./types.ts";

// ponytail: demo arbiters are testnet keys operated by this server and charge no fee.
// A production roster would be independent services that sign their own rulings.
const NAMES = ["Nyquist default", "Demo arbiter A", "Demo arbiter B"];

type Operated = DemoArbiter & { keypair: Keypair };

/** Arbiters from DEMO_ARBITER_SECRETS. The first must be the contract's default arbiter. */
export function operatedArbiters(defaultArbiter: string): Operated[] {
  const secrets = (process.env.DEMO_ARBITER_SECRETS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const roster = secrets.map((secret, i) => {
    const keypair = Keypair.fromSecret(secret);
    return { name: NAMES[i] ?? `Demo arbiter ${i}`, address: keypair.publicKey(), isDefault: i === 0, keypair };
  });
  if (roster.length && roster[0].address !== defaultArbiter) {
    throw new Error("The first DEMO_ARBITER_SECRETS key must be the protected escrow's default arbiter");
  }
  return roster;
}

export const publicRoster = (roster: Operated[]): DemoArbiter[] =>
  roster.map(({ name, address, isDefault }) => ({ name, address, isDefault }));

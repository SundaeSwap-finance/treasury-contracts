import { Provider } from "@blaze-cardano/query";
import { Wallet } from "@blaze-cardano/sdk";

import { IWithdrawArgs, withdraw } from "../withdraw/index.js";

export interface ICompleteArgs<P extends Provider, W extends Wallet>
  extends Omit<IWithdrawArgs<P, W>, "destination"> {}

export async function complete<P extends Provider, W extends Wallet>(
  args: ICompleteArgs<P, W>,
) {
  return withdraw(args);
}

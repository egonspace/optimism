// TODO: A lot of this stuff could probably live in core-utils instead.
// Review this file eventually for stuff that could go into core-utils.

import path from "path";
import os from "os";
import fs from "fs";
import {Wallet} from "ethers";
import * as readlineSync from "readline-sync";
import {Provider} from "@ethersproject/abstract-provider";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

/**
 * Returns a copy of the given object ({ ...obj }) with the given keys omitted.
 *
 * @param obj Object to return with the keys omitted.
 * @param keys Keys to omit from the returned object.
 * @returns A copy of the given object with the given keys omitted.
 */
export const omit = <T extends object, K extends string | number | symbol>(
  obj: T,
  ...keys: K[]
): Omit<T, K> => {
  const copy = { ...obj }
  for (const key of keys) {
    delete copy[key as string]
  }
  return copy
}

const iskraContractHomeDir = path.join(os.homedir(), ".iskra-contract");
const walletDir = path.join(iskraContractHomeDir, "wallet");

async function walletLoad(name, password, provider) {
  const walletJson = path.join(walletDir, name);
  if (!fs.existsSync(walletJson)) {
    console.error(`wallet [${name}] is not exist`);
    return;
  }
  const walletJsonContent: string = fs.readFileSync(walletJson).toString();
  return Wallet.fromEncryptedJsonSync(walletJsonContent, password).connect(provider);
}

export function getPassword(name) {
  let password = readlineSync.question(`Keyfile Password for ${name}:`, { hideEchoBack: true, mask: "" });
  return password;
}

export async function getSignerFromArgs(
  wallet: string,
  provider: Provider
): Promise<SignerWithAddress | Wallet> {
  let signer;
  if (wallet) {
    signer = await walletLoad(wallet, getPassword(wallet), provider);
  } else {
    signer = undefined;
  }
  return signer;
}

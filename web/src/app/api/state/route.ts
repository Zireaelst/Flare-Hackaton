import { NextResponse } from "next/server";
import { Wallet } from "xrpl";
import { getFxrpBalance, getXrpUsdPrice, listOrders } from "@/lib/tempo/read";
import { getPersonalAccount } from "@/lib/flare/smartAccounts";
import { config } from "@/lib/flare/config";

export const dynamic = "force-dynamic";

/** Everything the demo page renders, in one round trip. */
export async function GET() {
  try {
    const demoAddress = Wallet.fromSeed(config.demoXrplSeed()).address;
    const personalAccount = await getPersonalAccount(demoAddress);

    const [orders, price, fxrpBalance] = await Promise.all([
      listOrders(),
      getXrpUsdPrice(),
      getFxrpBalance(personalAccount),
    ]);

    return NextResponse.json({
      orders,
      price,
      fxrpBalance,
      demoXrplAddress: demoAddress,
      personalAccount,
      tempoAddress: config.tempoAddress,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read chain state" },
      { status: 500 },
    );
  }
}

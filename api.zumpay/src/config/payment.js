const { env } = require("./env");

const paymentMetadata = {
  error: "payment_required",
  message: "This endpoint requires a payment header.",
  accepted_headers: ["x-payment", "authorization"],
  payment: {
    amount: "0.002",
    currency: "USDC",
    destination: env.paymentWalletAddress,
    network: "arc",
    asset_contract: env.usdcContractAddress
  }
};

module.exports = { paymentMetadata };

const express = require("express");
const cors = require("cors");

const { openApiSpec } = require("./config/openapi");
const { env } = require("./config/env");
const arcRoutes = require("./routes/arc");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "Zumpay Arc API",
    status: "ok",
    openapi: "/openapi.json",
    docs: "/docs"
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    name: "Zumpay Arc API Docs",
    description:
      "Paid Arc liquidity API for AI agents. API paga de liquidez en Arc para agentes de IA.",
    openapi: `${openApiSpec.servers[0].url}/openapi.json`,
    discovery: `${openApiSpec.servers[0].url}/v1/arc/tokens`,
    paid_endpoint: `${openApiSpec.servers[0].url}/v1/arc/pool-liquidity?tokenA=USDC&tokenB=WETH`,
    payment: {
      protocol: "x402",
      price: "$0.01 USDC",
      seller: env.paymentWalletAddress
    },
    examples: [
      "GET /v1/arc/tokens",
      "GET /v1/arc/pool-liquidity?tokenA=USDC&tokenB=WETH",
      "GET /v1/arc/pool-liquidity?tokenA=USDC&tokenB=WBTC&fee=3000&tickSpacing=60"
    ]
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

app.use("/v1/arc", arcRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "not_found",
    message: `Route ${req.method} ${req.path} was not found.`
  });
});

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    error: err.code || "internal_error",
    message: err.message || "Unexpected API error."
  });
});

module.exports = app;

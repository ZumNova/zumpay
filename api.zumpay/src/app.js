const express = require("express");
const cors = require("cors");

const { openApiSpec } = require("./config/openapi");
const arcRoutes = require("./routes/arc");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "Zumpay Arc API",
    status: "ok",
    openapi: "/openapi.json"
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

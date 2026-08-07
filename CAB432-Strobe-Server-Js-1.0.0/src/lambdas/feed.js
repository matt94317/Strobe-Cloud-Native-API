import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import feedRoutes from "../routes/feedRoutes.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/v1/feed", feedRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "NotFound", message: "Endpoint not found" });
});
app.use(errorHandler);

export const handler = serverless(app);

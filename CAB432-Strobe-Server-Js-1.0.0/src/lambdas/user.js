import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import userRoutes from "../routes/userRoutes.js";
import followRoutes from "../routes/followRoutes.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/v1/users", userRoutes);
app.use("/v1/users/:userId", followRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "NotFound", message: "Endpoint not found" });
});
app.use(errorHandler);

export const handler = serverless(app);

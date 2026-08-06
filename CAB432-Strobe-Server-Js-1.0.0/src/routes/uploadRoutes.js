import express from "express";
import * as uploadController from "../controllers/uploadController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Get upload URL (authenticated)
router.post("/url", authenticate, uploadController.getUploadUrl);

export default router;

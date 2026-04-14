import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import totpRouter from "./totp";
import apiKeysRouter from "./apiKeys";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(totpRouter);
router.use(apiKeysRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import totpRouter from "./totp";
import apiKeysRouter from "./apiKeys";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(totpRouter);
router.use(apiKeysRouter);
router.use(adminRouter);

export default router;

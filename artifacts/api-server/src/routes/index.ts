import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import totpRouter from "./totp";
import apiKeysRouter from "./apiKeys";
import botsRouter from "./bots";
import tradesRouter from "./trades";
import adminRouter from "./admin";
import aiRouter from "./ai";
import emailSettingsRouter from "./emailSettings";
import aiSettingsRouter from "./aiSettings";
import userAiSettingsRouter from "./userAiSettings";
import invitationsRouter from "./invitations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(invitationsRouter);
router.use(totpRouter);
router.use(apiKeysRouter);
router.use(botsRouter);
router.use(tradesRouter);
router.use(adminRouter);
router.use(aiRouter);
router.use(emailSettingsRouter);
router.use(aiSettingsRouter);
router.use(userAiSettingsRouter);

export default router;

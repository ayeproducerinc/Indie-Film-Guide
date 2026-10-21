import { Router, type IRouter } from "express";
import healthRouter from "./health";
import listingsRouter from "./listings";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(listingsRouter);
router.use(adminRouter);

export default router;

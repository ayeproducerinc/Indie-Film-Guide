import { Router, type IRouter } from "express";
import healthRouter from "./health";
import listingsRouter from "./listings";
import adminRouter from "./admin";
import mailingListRouter from "./mailing-list";

const router: IRouter = Router();

router.use(healthRouter);
router.use(listingsRouter);
router.use(adminRouter);
router.use(mailingListRouter);

export default router;

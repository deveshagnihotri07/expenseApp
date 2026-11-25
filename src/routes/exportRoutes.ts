import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { exportExcel } from '../controllers/exportController';

const router = Router();

router.get('/excel', authenticate, exportExcel);

export default router;

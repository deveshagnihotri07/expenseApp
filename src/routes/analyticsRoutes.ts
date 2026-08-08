import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getDashboardOverview,
  getCategoryAnalytics,
  getGroupAnalytics,
  getMonthlyTrend,
  getFriendAnalytics,
} from '../controllers/analyticsController';

const router = Router();

router.get('/dashboard', authenticate, getDashboardOverview);
router.get('/categories', authenticate, getCategoryAnalytics);
router.get('/groups', authenticate, getGroupAnalytics);
router.get('/monthly-trend', authenticate, getMonthlyTrend);
router.get('/friends', authenticate, getFriendAnalytics);

export default router;

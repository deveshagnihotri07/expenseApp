import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getDashboardOverview: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getCategoryAnalytics: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getGroupAnalytics: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMonthlyTrend: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getFriendAnalytics: (req: AuthRequest, res: Response) => Promise<void>;

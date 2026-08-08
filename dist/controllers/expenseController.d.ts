import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const createExpense: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateExpense: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getExpenses: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getExpenseById: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const settleExpense: (req: AuthRequest, res: Response) => Promise<void>;
export declare const deleteExpense: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;

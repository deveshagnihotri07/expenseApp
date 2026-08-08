import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getUserProfile: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateUserProfile: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getAllUsers: (req: AuthRequest, res: Response) => Promise<void>;

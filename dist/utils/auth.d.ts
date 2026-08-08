import { User } from '../models/User';
export declare const hashPassword: (password: string) => Promise<string>;
export declare const comparePassword: (password: string, hash: string) => Promise<boolean>;
export declare const generateToken: (payload: object) => string;
export declare const formatUser: (user: User) => {
    id: string;
    name: string;
    email: string;
    phone: string | undefined;
    avatarUrl: string | undefined;
    createdAt: Date;
    updatedAt: Date;
};

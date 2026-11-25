export interface FriendBalance {
    userId: string;
    name: string;
    email: string;
    balance: number;
}
export declare const computeFriendBalances: (userId: string) => Promise<FriendBalance[]>;

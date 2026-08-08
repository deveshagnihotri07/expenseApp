export type ShareType = 'equal' | 'percentage' | 'exact' | 'custom';

export interface Expense {
  id: string;
  description?: string;
  amount: number;
  currency: string;
  category_id?: string;
  group_id?: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  is_personal: boolean;
  expense_date: Date;
  is_settled: boolean;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  share_type: ShareType;
  is_settled: boolean;
  created_at: Date;
}

export interface Settlement {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  expense_id?: string;
  group_id?: string;
  created_at: Date;
}

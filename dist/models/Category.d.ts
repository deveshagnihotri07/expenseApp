export interface Category {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    is_default: boolean;
    created_by?: string;
    created_at: Date;
}

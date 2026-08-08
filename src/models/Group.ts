export interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  avatar_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: Date;
}

export interface GroupWithMembers {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  avatar_url?: string;
  created_at: Date;
  updated_at: Date;
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'member';
  }>;
}

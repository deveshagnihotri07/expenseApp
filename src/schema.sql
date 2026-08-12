-- Database schema for Splitwise Clone

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories table (default + custom)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7),
    is_default BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, created_by)
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group members (many-to-many)
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT,
    amount DECIMAL(14,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    category_id UUID REFERENCES categories(id),
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_personal BOOLEAN DEFAULT false,
    expense_date DATE DEFAULT CURRENT_DATE,
    is_settled BOOLEAN DEFAULT false
);

-- Expense splits (who owes what)
CREATE TABLE IF NOT EXISTS expense_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(14,2) NOT NULL,
    share_type VARCHAR(20) DEFAULT 'equal' CHECK (share_type IN ('equal', 'percentage', 'exact', 'custom')),
    is_settled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(expense_id, user_id)
);

-- Settlements (payments between users)
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID NOT NULL REFERENCES users(id),
    to_user_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(14,2) NOT NULL,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    settled_date DATE DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'Other',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS settled_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Other';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from ON settlements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to ON settlements(to_user_id);

-- Dedupe default categories (keep the lowest id per name) and repoint any
-- expenses that referenced a removed duplicate
WITH dups AS (
  SELECT id, name, ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS rn
  FROM categories
  WHERE is_default = true
)
UPDATE expenses e
SET category_id = first_cat.id
FROM dups dup
JOIN dups first_cat ON first_cat.name = dup.name AND first_cat.rn = 1
WHERE e.category_id = dup.id AND dup.rn > 1;

WITH dups AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS rn
  FROM categories
  WHERE is_default = true
)
DELETE FROM categories c
USING dups
WHERE c.id = dups.id AND dups.rn > 1;

-- Prevent duplicate default categories from being inserted again
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_default_name
ON categories(name) WHERE is_default = true;

-- Insert default categories
INSERT INTO categories (name, icon, color, is_default) VALUES
    ('Food & Dining', 'restaurant', '#F43F5E', true),
    ('Transportation', 'car', '#0EA5E9', true),
    ('Shopping', 'bag-handle', '#F59E0B', true),
    ('Entertainment', 'film', '#8B5CF6', true),
    ('Bills & Utilities', 'receipt', '#3B82F6', true),
    ('Travel', 'airplane', '#14B8A6', true),
    ('Health & Medical', 'heart', '#EC4899', true),
    ('Education', 'book', '#6366F1', true),
    ('Personal Care', 'sparkles', '#10B981', true),
    ('Gifts', 'gift', '#F97316', true),
    ('Other', 'more-horizontal', '#9CA3AF', true)
ON CONFLICT DO NOTHING;

-- Refresh icons and ensure unique colors for existing default categories
UPDATE categories SET color = CASE name
    WHEN 'Food & Dining' THEN '#F43F5E'
    WHEN 'Transportation' THEN '#0EA5E9'
    WHEN 'Shopping' THEN '#F59E0B'
    WHEN 'Entertainment' THEN '#8B5CF6'
    WHEN 'Bills & Utilities' THEN '#3B82F6'
    WHEN 'Travel' THEN '#14B8A6'
    WHEN 'Health & Medical' THEN '#EC4899'
    WHEN 'Education' THEN '#6366F1'
    WHEN 'Personal Care' THEN '#10B981'
    WHEN 'Gifts' THEN '#F97316'
    WHEN 'Other' THEN '#9CA3AF'
    ELSE color
END
WHERE is_default = true;

UPDATE categories SET icon = 'bag-handle' WHERE name = 'Shopping' AND is_default = true;
UPDATE categories SET icon = 'film' WHERE name = 'Entertainment' AND is_default = true;
UPDATE categories SET icon = 'sparkles' WHERE name = 'Personal Care' AND is_default = true;

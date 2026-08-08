import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { body, validationResult } from 'express-validator';

export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, name, email, phone, avatar_url, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, phone, avatar_url } = req.body;

    const result = await query(
      'UPDATE users SET name = $1, phone = $2, avatar_url = $3, updated_at = NOW() WHERE id = $4 RETURNING id, name, email, phone, avatar_url, updated_at',
      [name, phone, avatar_url, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      updatedAt: user.updated_at,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, name, email, avatar_url FROM users ORDER BY name ASC LIMIT 50'
    );
    res.json(
      result.rows.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatar_url,
      }))
    );
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

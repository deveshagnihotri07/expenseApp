import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import {
  buildExportWorkbook,
  ExportFilters,
  ExportScope,
  ExportStatus,
} from '../services/exportService';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCOPES: ExportScope[] = ['personal', 'group', 'both'];
const STATUSES: ExportStatus[] = ['all', 'settled', 'unsettled'];

const parseDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return undefined;
  return value;
};

export const exportExcel = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userName = req.user!.name;

    const scope = ((req.query.scope as string) || 'both') as ExportScope;
    if (!SCOPES.includes(scope)) {
      return res.status(400).json({ message: 'Invalid scope' });
    }

    const status = ((req.query.status as string) || 'all') as ExportStatus;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const groupId =
      typeof req.query.groupId === 'string' && req.query.groupId
        ? req.query.groupId
        : undefined;

    if (scope === 'group' && groupId) {
      const membership = await query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, userId]
      );
      if (membership.rows.length === 0) {
        return res
          .status(403)
          .json({ message: 'You are not a member of this group' });
      }
    }

    const monthRaw = parseInt(req.query.month as string, 10);
    const yearRaw = parseInt(req.query.year as string, 10);
    const hasPeriod =
      Number.isInteger(monthRaw) &&
      monthRaw >= 1 &&
      monthRaw <= 12 &&
      Number.isInteger(yearRaw);

    const categoryId =
      typeof req.query.categoryId === 'string' && req.query.categoryId
        ? req.query.categoryId
        : undefined;

    const filters: ExportFilters = {
      scope,
      groupId,
      from: parseDate(req.query.from),
      to: parseDate(req.query.to),
      month: hasPeriod ? monthRaw : undefined,
      year: hasPeriod ? yearRaw : undefined,
      categoryId,
      status,
    };

    const { workbook, filename } = await buildExportWorkbook(
      userId,
      userName,
      filters
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    await workbook.xlsx.write(res as any);
    res.end();
  } catch (error) {
    console.error('Export excel error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate export' });
    }
  }
};

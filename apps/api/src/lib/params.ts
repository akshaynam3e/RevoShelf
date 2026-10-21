import type { Request } from 'express';
import { z } from 'zod';

export const uuidParam = (req: Request, name: string): string => z.string().uuid().parse(req.params[name]);

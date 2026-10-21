import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_LISTING } from '@revoshelf/shared';
import { supabaseAdmin } from '../supabase';
import { AppError } from './errors';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_LISTING } });

export interface SniffedImage { ext: 'jpg' | 'png' | 'webp'; mime: string }

/** Detect the real image type from magic bytes; the client-declared MIME type / filename is never trusted. */
export function sniffImage(b: Buffer): SniffedImage | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/** Validates and uploads one image. Returns the storage path. Paths are server generated. */
export async function storeImage(bucket: string, prefix: string, file: Express.Multer.File): Promise<string> {
  const type = sniffImage(file.buffer);
  if (!type) throw new AppError(415, 'Only JPEG, PNG or WebP images are allowed', 'UNSUPPORTED_MEDIA');
  const path = `${prefix}/${randomUUID()}.${type.ext}`;
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file.buffer, { contentType: type.mime, upsert: false });
  if (error) {
    console.error('[storage]', error.message);
    throw new AppError(502, 'Could not store image');
  }
  return path;
}

export async function removeImages(bucket: string, paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
  if (error) console.error('[storage:remove]', error.message);
}

import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as customersService from '../services/customers.service.js';

const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200),
});

function parseId(req: Request, param: string): number {
  const id = parseInt(req.params[param] as string, 10);
  if (isNaN(id)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid ${param}`);
  }
  return id;
}

export async function listCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await customersService.listCustomers();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }
    const customer = await customersService.createCustomer(parsed.data.name);
    res.status(201).json({ data: customer });
  } catch (err) {
    next(err);
  }
}

export async function updateCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req, 'id');
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }
    const customer = await customersService.updateCustomer(id, parsed.data.name);
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
}

export async function deleteCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req, 'id');
    await customersService.deleteCustomer(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getCustomerParts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req, 'id');
    const parts = await customersService.getCustomerParts(id);
    const data = parts.map(p => ({
      id: p.id,
      name: p.name,
      gridX: p.gridX,
      gridY: p.gridY,
      gridZ: p.gridZ,
      visibility: p.visibility,
      imageUrl: p.imageUrl,
      perspImageUrls: p.perspImageUrls ? JSON.parse(p.perspImageUrls) as string[] : [],
      status: p.status,
      errorMessage: p.errorMessage,
      createdAt: p.createdAt,
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function associatePart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = parseId(req, 'id');
    const partId = req.params.partId as string;
    if (!partId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid partId');
    await customersService.associatePart(customerId, partId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function dissociatePart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = parseId(req, 'id');
    const partId = req.params.partId as string;
    if (!partId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid partId');
    await customersService.dissociatePart(customerId, partId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getCustomerRefImages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req, 'id');
    const images = await customersService.getCustomerRefImages(id);
    const data = images.map(img => ({
      id: img.id,
      name: img.name,
      isGlobal: false,
      imageUrl: img.filePath,
      fileSize: img.fileSize,
      createdAt: img.createdAt,
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function associateRefImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = parseId(req, 'id');
    const refImageId = parseInt(req.params.refImageId as string, 10);
    if (isNaN(refImageId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid refImageId');
    await customersService.associateRefImage(customerId, refImageId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function dissociateRefImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = parseId(req, 'id');
    const refImageId = parseInt(req.params.refImageId as string, 10);
    if (isNaN(refImageId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid refImageId');
    await customersService.dissociateRefImage(customerId, refImageId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

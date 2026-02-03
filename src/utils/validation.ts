import { CONSTANTS } from '../config/constants.js';
import { createValidationError, AppError } from './errors.js';
import {
  sanitizeTitle,
  sanitizeDescription,
  sanitizeCategory,
  sanitizeTags,
} from './sanitization.js';
import type { CreateTodoInput, UpdateTodoInput, TodoStatus, TodoPriority } from '../types/todo.js';

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Category pattern: letters, numbers, spaces, hyphens, underscores
const CATEGORY_PATTERN = /^[a-zA-Z0-9\s\-_]+$/;

// Tag pattern: letters, numbers, hyphens only (no spaces)
const TAG_PATTERN = /^[a-zA-Z0-9\-]+$/;

export function validateUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function validateId(id: unknown): string {
  if (typeof id !== 'string' || !id) {
    throw createValidationError('ID is required and must be a string');
  }
  if (!validateUUID(id)) {
    throw createValidationError('ID must be a valid UUID');
  }
  return id;
}

export function validateTitle(title: unknown): string {
  if (typeof title !== 'string' || !title) {
    throw createValidationError('Title is required and must be a string');
  }

  const sanitized = sanitizeTitle(title);

  if (sanitized.length === 0) {
    throw createValidationError('Title cannot be empty');
  }

  if (sanitized.length > CONSTANTS.MAX_TITLE_LENGTH) {
    throw createValidationError(`Title must be at most ${CONSTANTS.MAX_TITLE_LENGTH} characters`);
  }

  return sanitized;
}

export function validateDescription(description: unknown): string | undefined {
  if (description === undefined || description === null) {
    return undefined;
  }

  if (typeof description !== 'string') {
    throw createValidationError('Description must be a string');
  }

  const sanitized = sanitizeDescription(description);

  if (sanitized.length > CONSTANTS.MAX_DESCRIPTION_LENGTH) {
    throw createValidationError(`Description must be at most ${CONSTANTS.MAX_DESCRIPTION_LENGTH} characters`);
  }

  return sanitized || undefined;
}

export function validateCategory(category: unknown): string {
  if (category === undefined || category === null) {
    return CONSTANTS.DEFAULT_CATEGORY;
  }

  if (typeof category !== 'string') {
    throw createValidationError('Category must be a string');
  }

  const sanitized = sanitizeCategory(category);

  if (sanitized.length === 0) {
    return CONSTANTS.DEFAULT_CATEGORY;
  }

  if (sanitized.length > CONSTANTS.MAX_CATEGORY_LENGTH) {
    throw createValidationError(`Category must be at most ${CONSTANTS.MAX_CATEGORY_LENGTH} characters`);
  }

  if (!CATEGORY_PATTERN.test(sanitized)) {
    throw createValidationError('Category can only contain letters, numbers, spaces, hyphens, and underscores');
  }

  return sanitized;
}

export function validateStatus(status: unknown): TodoStatus {
  if (status === undefined || status === null) {
    return CONSTANTS.DEFAULT_STATUS;
  }

  if (typeof status !== 'string') {
    throw createValidationError('Status must be a string');
  }

  if (!CONSTANTS.VALID_STATUSES.includes(status as TodoStatus)) {
    throw createValidationError(`Status must be one of: ${CONSTANTS.VALID_STATUSES.join(', ')}`);
  }

  return status as TodoStatus;
}

export function validatePriority(priority: unknown): TodoPriority | undefined {
  if (priority === undefined || priority === null) {
    return undefined;
  }

  if (typeof priority !== 'string') {
    throw createValidationError('Priority must be a string');
  }

  if (!CONSTANTS.VALID_PRIORITIES.includes(priority as TodoPriority)) {
    throw createValidationError(`Priority must be one of: ${CONSTANTS.VALID_PRIORITIES.join(', ')}`);
  }

  return priority as TodoPriority;
}

export function validateTags(tags: unknown): string[] | undefined {
  if (tags === undefined || tags === null) {
    return undefined;
  }

  if (!Array.isArray(tags)) {
    throw createValidationError('Tags must be an array');
  }

  if (tags.length > CONSTANTS.MAX_TAGS_COUNT) {
    throw createValidationError(`Maximum ${CONSTANTS.MAX_TAGS_COUNT} tags allowed`);
  }

  const errors: string[] = [];

  tags.forEach((tag, index) => {
    if (typeof tag !== 'string') {
      errors.push(`Tag at index ${index} must be a string`);
      return;
    }

    if (tag.length > CONSTANTS.MAX_TAG_LENGTH) {
      errors.push(`Tag at index ${index} must be at most ${CONSTANTS.MAX_TAG_LENGTH} characters`);
    }

    if (!TAG_PATTERN.test(tag)) {
      errors.push(`Tag at index ${index} can only contain letters, numbers, and hyphens`);
    }
  });

  if (errors.length > 0) {
    throw createValidationError('Invalid tags', errors);
  }

  const sanitized = sanitizeTags(tags);
  return sanitized.length > 0 ? sanitized : undefined;
}

export function validateDueDate(dueDate: unknown): string | undefined {
  if (dueDate === undefined || dueDate === null) {
    return undefined;
  }

  if (typeof dueDate !== 'string') {
    throw createValidationError('Due date must be a string');
  }

  const date = new Date(dueDate);

  if (isNaN(date.getTime())) {
    throw createValidationError('Due date must be a valid ISO 8601 date string');
  }

  return date.toISOString();
}

export function validateLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return CONSTANTS.DEFAULT_LIMIT;
  }

  const num = Number(limit);

  if (isNaN(num) || !Number.isInteger(num)) {
    throw createValidationError('Limit must be an integer');
  }

  if (num < 1) {
    throw createValidationError('Limit must be at least 1');
  }

  if (num > CONSTANTS.MAX_LIMIT) {
    throw createValidationError(`Limit must be at most ${CONSTANTS.MAX_LIMIT}`);
  }

  return num;
}

export function validateOffset(offset: unknown): number {
  if (offset === undefined || offset === null) {
    return 0;
  }

  const num = Number(offset);

  if (isNaN(num) || !Number.isInteger(num)) {
    throw createValidationError('Offset must be an integer');
  }

  if (num < 0) {
    throw createValidationError('Offset must be non-negative');
  }

  return num;
}

export function validateBoolean(value: unknown, fieldName: string): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value !== 'boolean') {
    throw createValidationError(`${fieldName} must be a boolean`);
  }

  return value;
}

export function validateCreateTodoInput(input: unknown): CreateTodoInput {
  if (!input || typeof input !== 'object') {
    throw createValidationError('Input must be an object');
  }

  const data = input as Record<string, unknown>;

  return {
    title: validateTitle(data.title),
    description: validateDescription(data.description),
    category: validateCategory(data.category),
    priority: validatePriority(data.priority),
    tags: validateTags(data.tags),
    due_date: validateDueDate(data.due_date),
  };
}

export function validateUpdateTodoInput(input: unknown): UpdateTodoInput {
  if (!input || typeof input !== 'object') {
    throw createValidationError('Input must be an object');
  }

  const data = input as Record<string, unknown>;

  const result: UpdateTodoInput = {
    id: validateId(data.id),
  };

  if (data.title !== undefined) {
    result.title = validateTitle(data.title);
  }

  if (data.description !== undefined) {
    result.description = validateDescription(data.description);
  }

  if (data.category !== undefined) {
    result.category = validateCategory(data.category);
  }

  if (data.status !== undefined) {
    result.status = validateStatus(data.status);
  }

  if (data.priority !== undefined) {
    result.priority = validatePriority(data.priority);
  }

  if (data.tags !== undefined) {
    result.tags = validateTags(data.tags);
  }

  if (data.due_date !== undefined) {
    result.due_date = validateDueDate(data.due_date);
  }

  return result;
}

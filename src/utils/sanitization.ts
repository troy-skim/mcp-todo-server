// Strip HTML tags from string
export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

// Trim whitespace and normalize
export function normalizeString(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

// Sanitize title: strip HTML, trim whitespace
export function sanitizeTitle(title: string): string {
  return normalizeString(stripHtmlTags(title));
}

// Sanitize description: strip HTML, trim whitespace
export function sanitizeDescription(description: string): string {
  return normalizeString(stripHtmlTags(description));
}

// Sanitize category: lowercase, strip HTML, trim whitespace
export function sanitizeCategory(category: string): string {
  return normalizeString(stripHtmlTags(category)).toLowerCase();
}

// Sanitize tag: lowercase, strip HTML, trim whitespace
export function sanitizeTag(tag: string): string {
  return normalizeString(stripHtmlTags(tag)).toLowerCase();
}

// Sanitize tags array
export function sanitizeTags(tags: string[]): string[] {
  return tags.map(sanitizeTag).filter(tag => tag.length > 0);
}

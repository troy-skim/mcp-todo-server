export const CONSTANTS = {
  DEFAULT_USER_ID: 'default-user',
  DEFAULT_CATEGORY: 'personal',
  DEFAULT_STATUS: 'pending',

  MAX_TITLE_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_CATEGORY_LENGTH: 50,
  MAX_TAG_LENGTH: 30,
  MAX_TAGS_COUNT: 20,

  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,

  VALID_STATUSES: ['pending', 'in_progress', 'completed'] as const,
  VALID_PRIORITIES: ['low', 'medium', 'high'] as const,
} as const;

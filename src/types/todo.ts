export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'low' | 'medium' | 'high';

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  status: TodoStatus;
  priority: TodoPriority | null;
  tags: string[] | null;
  due_date: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  category?: string;
  priority?: TodoPriority;
  tags?: string[];
  due_date?: string;
}

export interface UpdateTodoInput {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  tags?: string[];
  due_date?: string;
}

export interface ListTodosInput {
  category?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  tag?: string;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface FilterByDateRangeInput {
  start_date?: string;
  end_date?: string;
  category?: string;
  status?: TodoStatus;
}

export interface SearchTodosInput {
  query: string;
  limit?: number;
}
